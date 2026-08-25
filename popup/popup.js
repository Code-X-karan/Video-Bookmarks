/* global chrome, BookmarkStorage */

const appEl = document.getElementById("app");

const state = {
  tab: null, // chrome.tabs.Tab
  ytState: null, // response from content script GET_STATE, or null
  bookmarks: [], // bookmarks for the current video
  otherVideos: [], // summaries of other saved videos
  mode: "list", // "list" | "add"
  addCapturedTime: null,
  openMenuId: null,
  renamingId: null,
  showOtherVideos: false,
  undo: null, // { videoId, videoMeta, bookmark, timeoutId }
};

function formatTime(seconds) {
  if (seconds == null || isNaN(seconds) || seconds < 0) return "00:00";
  seconds = Math.floor(seconds);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : str;
  return div.innerHTML;
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

// Ask the content script for the current video/time. Resolves to null if
// no content script is present (not on YouTube) or it doesn't respond.
function askContentScript(tabId, message) {
  return new Promise((resolve) => {
    if (!tabId) return resolve(null);
    try {
      chrome.tabs.sendMessage(tabId, message, (response) => {
        if (chrome.runtime.lastError) {
          resolve(null);
          return;
        }
        resolve(response || null);
      });
    } catch (e) {
      resolve(null);
    }
  });
}

async function refreshCurrentVideoBookmarks() {
  if (state.ytState && state.ytState.videoId) {
    const video = await BookmarkStorage.getVideo(state.ytState.videoId);
    state.bookmarks = video ? video.bookmarks : [];
  } else {
    state.bookmarks = [];
  }
}

async function refreshOtherVideos() {
  const all = await BookmarkStorage.getAllVideosSummary();
  state.otherVideos = all.filter(
    (v) => !state.ytState || v.videoId !== state.ytState.videoId
  );
}

async function init() {
  state.tab = await getActiveTab();
  state.ytState = await askContentScript(state.tab && state.tab.id, {
    type: "GET_STATE",
  });
  await refreshCurrentVideoBookmarks();
  await refreshOtherVideos();
  render();
}

// ---------------- Rendering ----------------

function render() {
  appEl.innerHTML = "";

  const header = document.createElement("div");
  header.className = "header";
  header.innerHTML = `<span class="icon">🔖</span><span class="app-title">Video Marks</span>`;
  appEl.appendChild(header);

  if (state.ytState && state.ytState.videoId) {
    const titleEl = document.createElement("div");
    titleEl.className = "video-title";
    titleEl.textContent = state.ytState.title || "Untitled video";
    appEl.appendChild(titleEl);
  } else {
    const notice = document.createElement("div");
    notice.className = "not-youtube";
    notice.textContent = "Open a YouTube video to add a bookmark here.";
    appEl.appendChild(notice);
  }

  if (state.mode === "add") {
    renderAddForm();
  } else {
    renderListArea();
    renderAddBar();
  }

  renderOtherVideosSection();
}

function renderListArea() {
  if (!state.bookmarks || state.bookmarks.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.innerHTML = `
      <div class="big-icon">🔖</div>
      <p>No bookmarks yet.<br/>Pause the video and add a bookmark at an important moment.</p>
    `;
    appEl.appendChild(empty);
    return;
  }

  const wrap = document.createElement("div");
  wrap.className = "list-wrap";

  const box = document.createElement("div");
  box.className = "bookmark-box";

  state.bookmarks.forEach((bookmark) => {
    box.appendChild(renderBookmarkRow(bookmark));
  });

  wrap.appendChild(box);
  appEl.appendChild(wrap);
}

function renderBookmarkRow(bookmark) {
  if (state.renamingId === bookmark.id) {
    const row = document.createElement("div");
    row.className = "rename-row";
    row.innerHTML = `
      <input type="text" maxlength="120" value="${escapeHtml(bookmark.title)}" />
    `;
    const input = row.querySelector("input");
    setTimeout(() => {
      input.focus();
      input.select();
    }, 0);

    const commit = async () => {
      const newTitle = input.value.trim() || bookmark.title;
      await BookmarkStorage.renameBookmark(
        state.ytState.videoId,
        bookmark.id,
        newTitle
      );
      state.renamingId = null;
      await refreshCurrentVideoBookmarks();
      render();
    };

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") commit();
      if (e.key === "Escape") {
        state.renamingId = null;
        render();
      }
    });
    input.addEventListener("blur", commit);

    return row;
  }

  const row = document.createElement("div");
  row.className = "bookmark-row";
  row.innerHTML = `
    <span class="play">▶</span>
    <span class="time">${formatTime(bookmark.time)}</span>
    <span class="name">${escapeHtml(bookmark.title)}</span>
    <button class="menu-btn" type="button" title="More">⋮</button>
  `;

  const menuBtn = row.querySelector(".menu-btn");
  menuBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    state.openMenuId = state.openMenuId === bookmark.id ? null : bookmark.id;
    render();
  });

  row.addEventListener("click", () => jumpToBookmark(bookmark));

  if (state.openMenuId === bookmark.id) {
    const menu = document.createElement("div");
    menu.className = "menu-popover";
    menu.innerHTML = `
      <button type="button" data-action="rename">Rename</button>
      <button type="button" data-action="delete" class="danger">Delete</button>
    `;
    menu.addEventListener("click", (e) => e.stopPropagation());
    menu.querySelector('[data-action="rename"]').addEventListener("click", () => {
      state.openMenuId = null;
      state.renamingId = bookmark.id;
      render();
    });
    menu.querySelector('[data-action="delete"]').addEventListener("click", () => {
      state.openMenuId = null;
      deleteBookmark(bookmark);
    });
    row.appendChild(menu);
  }

  return row;
}

function renderAddBar() {
  const bar = document.createElement("div");
  bar.className = "add-bar";
  const onYouTubeVideo = !!(state.ytState && state.ytState.videoId);
  bar.innerHTML = `<button class="add-btn" type="button" ${
    onYouTubeVideo ? "" : "disabled"
  }>+ Add Bookmark</button>`;
  bar.querySelector("button").addEventListener("click", startAddBookmark);
  appEl.appendChild(bar);
}

function renderAddForm() {
  const form = document.createElement("div");
  form.className = "add-form";
  form.innerHTML = `
    <div class="form-label">Add bookmark</div>
    <div class="form-time">${formatTime(state.addCapturedTime)}</div>
    <input type="text" maxlength="120" placeholder="Bookmark name..." />
    <div class="form-actions">
      <button class="cancel" type="button">Cancel</button>
      <button class="save" type="button">Save</button>
    </div>
  `;

  const input = form.querySelector("input");
  setTimeout(() => input.focus(), 0);

  form.querySelector(".cancel").addEventListener("click", () => {
    state.mode = "list";
    render();
  });

  const save = async () => {
    const title = input.value.trim() || formatTime(state.addCapturedTime);
    await BookmarkStorage.saveBookmark(
      state.ytState.videoId,
      { title: state.ytState.title, url: state.ytState.url },
      { time: state.addCapturedTime, title }
    );
    state.mode = "list";
    await refreshCurrentVideoBookmarks();
    render();
  };

  form.querySelector(".save").addEventListener("click", save);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") save();
    if (e.key === "Escape") {
      state.mode = "list";
      render();
    }
  });

  appEl.appendChild(form);
}

function renderOtherVideosSection() {
  if (!state.otherVideos || state.otherVideos.length === 0) return;

  const wrap = document.createElement("div");
  wrap.className = "other-videos";

  const toggle = document.createElement("button");
  toggle.className = "other-videos-toggle";
  toggle.type = "button";
  toggle.textContent = state.showOtherVideos
    ? "▾ Other videos"
    : `▸ Other videos (${state.otherVideos.length})`;
  toggle.addEventListener("click", () => {
    state.showOtherVideos = !state.showOtherVideos;
    render();
  });
  wrap.appendChild(toggle);

  if (state.showOtherVideos) {
    state.otherVideos.forEach((summary) => {
      wrap.appendChild(renderOtherVideoItem(summary));
    });
  }

  appEl.appendChild(wrap);
}

function renderOtherVideoItem(summary) {
  const item = document.createElement("div");
  item.className = "other-video-item";

  const titleEl = document.createElement("div");
  titleEl.className = "ov-title";
  titleEl.textContent = summary.title;
  item.appendChild(titleEl);

  BookmarkStorage.getVideo(summary.videoId).then((video) => {
    if (!video) return;
    video.bookmarks.forEach((bookmark) => {
      const row = document.createElement("div");
      row.className = "ov-bookmark";
      row.innerHTML = `
        <span class="time">${formatTime(bookmark.time)}</span>
        <span class="name">${escapeHtml(bookmark.title)}</span>
      `;
      row.addEventListener("click", () => {
        chrome.tabs.create({
          url: `${video.url || "https://www.youtube.com/watch?v=" + summary.videoId}&t=${Math.floor(
            bookmark.time
          )}s`,
        });
      });
      item.appendChild(row);
    });
  });

  return item;
}

// ---------------- Actions ----------------

async function startAddBookmark() {
  if (!state.tab || !state.tab.id) return;
  // Re-query fresh state so the timestamp is captured at the moment of
  // clicking "Add Bookmark", not whenever the popup happened to open.
  const fresh = await askContentScript(state.tab.id, { type: "GET_STATE" });
  if (fresh) state.ytState = fresh;

  if (!state.ytState || !state.ytState.videoId) {
    render();
    return;
  }
  state.addCapturedTime = state.ytState.currentTime || 0;
  state.mode = "add";
  render();
}

async function jumpToBookmark(bookmark) {
  if (state.tab && state.tab.id && state.ytState && state.ytState.videoId) {
    const res = await askContentScript(state.tab.id, {
      type: "SEEK",
      time: bookmark.time,
    });
    if (res && res.ok) return;
  }
  // Fallback: open the video in a new tab at the timestamp.
  if (state.ytState && state.ytState.url) {
    chrome.tabs.create({
      url: `${state.ytState.url}&t=${Math.floor(bookmark.time)}s`,
    });
  }
}

async function deleteBookmark(bookmark) {
  const videoId = state.ytState.videoId;
  const videoMeta = { title: state.ytState.title, url: state.ytState.url };
  const removed = await BookmarkStorage.deleteBookmark(videoId, bookmark.id);
  await refreshCurrentVideoBookmarks();
  render();
  if (removed) {
    showUndoToast(videoId, videoMeta, removed);
  }
}

function showUndoToast(videoId, videoMeta, bookmark) {
  if (state.undo && state.undo.timeoutId) {
    clearTimeout(state.undo.timeoutId);
  }

  const toast = document.createElement("div");
  toast.className = "toast";
  toast.innerHTML = `<span>Bookmark deleted</span><button type="button">Undo</button>`;

  const timeoutId = setTimeout(() => {
    if (toast.parentNode) toast.parentNode.removeChild(toast);
    state.undo = null;
  }, 4000);

  toast.querySelector("button").addEventListener("click", async () => {
    clearTimeout(timeoutId);
    if (toast.parentNode) toast.parentNode.removeChild(toast);
    state.undo = null;
    await BookmarkStorage.restoreBookmark(videoId, videoMeta, bookmark);
    await refreshCurrentVideoBookmarks();
    render();
  });

  state.undo = { videoId, videoMeta, bookmark, timeoutId };
  appEl.appendChild(toast);
}

// Close any open row menu when clicking elsewhere in the popup.
appEl.addEventListener("click", () => {
  if (state.openMenuId !== null) {
    state.openMenuId = null;
    render();
  }
});

init();
