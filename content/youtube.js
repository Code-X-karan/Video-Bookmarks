/**
 * Content script injected on YouTube pages.
 * Responsibilities:
 *  - Report current video id / timestamp to the popup (GET_STATE)
 *  - Seek the player to a saved timestamp (SEEK)
 *  - Show a small floating "add bookmark" overlay when triggered
 *    by the keyboard shortcut (SHOW_ADD_BOOKMARK_OVERLAY)
 *  - Track YouTube's SPA navigation so video-id changes are detected
 */
(function () {
  if (window.__ytBookmarkContentLoaded) return;
  window.__ytBookmarkContentLoaded = true;

  function extractVideoId(href) {
    try {
      const u = new URL(href);
      if (!u.hostname.includes("youtube.com")) return null;

      if (u.pathname === "/watch") {
        return u.searchParams.get("v");
      }
      if (u.pathname.startsWith("/shorts/")) {
        return u.pathname.split("/")[2] || null;
      }
      if (u.pathname.startsWith("/embed/")) {
        return u.pathname.split("/")[2] || null;
      }
      if (u.pathname.startsWith("/live/")) {
        return u.pathname.split("/")[2] || null;
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  function getVideoElement() {
    return (
      document.querySelector("video.html5-main-video") ||
      document.querySelector("video")
    );
  }

  function getVideoTitle() {
    const candidates = [
      "h1.ytd-watch-metadata yt-formatted-string",
      "h1.title yt-formatted-string",
      "h1.title",
      "#title h1",
    ];
    for (const sel of candidates) {
      const el = document.querySelector(sel);
      if (el && el.textContent && el.textContent.trim()) {
        return el.textContent.trim();
      }
    }
    const metaTitle = document.querySelector('meta[name="title"]');
    if (metaTitle && metaTitle.content) return metaTitle.content.trim();
    return document.title.replace(/ - YouTube$/, "").trim();
  }

  function isShorts() {
    return location.pathname.startsWith("/shorts/");
  }

  function getState() {
    const videoId = extractVideoId(location.href);
    const videoEl = getVideoElement();
    return {
      onYouTube: true,
      videoId,
      title: videoId ? getVideoTitle() : null,
      url: videoId
        ? `https://www.youtube.com/watch?v=${videoId}`
        : location.href,
      isShorts: isShorts(),
      hasVideoElement: !!videoEl,
      currentTime: videoEl ? videoEl.currentTime : null,
      duration: videoEl ? videoEl.duration : null,
      isPaused: videoEl ? videoEl.paused : null,
    };
  }

  function seekTo(time) {
    const videoEl = getVideoElement();
    if (!videoEl) return false;
    videoEl.currentTime = time;
    return true;
  }

  function formatTime(seconds) {
    if (seconds == null || isNaN(seconds) || seconds < 0) return "00:00";
    seconds = Math.floor(seconds);
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    const pad = (n) => String(n).padStart(2, "0");
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  }

  // ---------- Messaging ----------
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || !msg.type) return false;

    if (msg.type === "GET_STATE") {
      sendResponse(getState());
      return true;
    }

    if (msg.type === "SEEK") {
      const ok = seekTo(msg.time);
      sendResponse({ ok });
      return true;
    }

    if (msg.type === "SHOW_ADD_BOOKMARK_OVERLAY") {
      showAddBookmarkOverlay();
      sendResponse({ ok: true });
      return true;
    }

    return false;
  });

  // ---------- SPA navigation detection ----------
  // YouTube fires "yt-navigate-finish" on internal navigations. We also
  // poll as a safety net (e.g. Shorts vertical-scroll navigation doesn't
  // always fire the same events).
  let lastHref = location.href;
  function checkForNavigation() {
    if (location.href !== lastHref) {
      lastHref = location.href;
      // Close any stale overlay tied to the previous video.
      const existing = document.getElementById("yt-bookmark-overlay-host");
      if (existing) existing.remove();
    }
  }
  window.addEventListener("yt-navigate-finish", checkForNavigation);
  setInterval(checkForNavigation, 1000);

  // ---------- Add-bookmark overlay (keyboard shortcut flow) ----------
  function showAddBookmarkOverlay() {
    const existing = document.getElementById("yt-bookmark-overlay-host");
    if (existing) existing.remove();

    const state = getState();
    if (!state.videoId || !state.hasVideoElement) {
      return; // not on a watchable video, nothing to bookmark
    }

    // Capture the timestamp at the moment the overlay opens (i.e. the
    // moment the shortcut was pressed) -- not later.
    const capturedTime = state.currentTime;

    const host = document.createElement("div");
    host.id = "yt-bookmark-overlay-host";
    Object.assign(host.style, {
      position: "fixed",
      bottom: "24px",
      right: "24px",
      zIndex: "2147483647",
    });
    document.documentElement.appendChild(host);

    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <style>
        * { box-sizing: border-box; }
        .card {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
          background: #ffffff;
          border: 1px solid #e4e4e4;
          border-radius: 12px;
          box-shadow: 0 8px 28px rgba(0,0,0,0.18);
          padding: 14px;
          width: 260px;
          color: #111111;
        }
        .label {
          font-size: 11px;
          color: #888888;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-bottom: 4px;
        }
        .time {
          font-size: 19px;
          font-weight: 600;
          margin-bottom: 10px;
        }
        input {
          width: 100%;
          padding: 8px 10px;
          border: 1px solid #dddddd;
          border-radius: 8px;
          font-size: 13px;
          margin-bottom: 10px;
          outline: none;
          font-family: inherit;
        }
        input:focus { border-color: #999999; }
        .actions {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
        }
        button {
          border: none;
          border-radius: 8px;
          padding: 6px 14px;
          font-size: 13px;
          cursor: pointer;
          font-family: inherit;
        }
        .cancel { background: #f2f2f2; color: #333333; }
        .cancel:hover { background: #e6e6e6; }
        .save { background: #111111; color: #ffffff; }
        .save:hover { background: #000000; }
      </style>
      <div class="card">
        <div class="label">Add bookmark</div>
        <div class="time">${formatTime(capturedTime)}</div>
        <input type="text" maxlength="120" placeholder="Bookmark name..." />
        <div class="actions">
          <button class="cancel" type="button">Cancel</button>
          <button class="save" type="button">Save</button>
        </div>
      </div>
    `;

    const input = shadow.querySelector("input");
    const cancelBtn = shadow.querySelector(".cancel");
    const saveBtn = shadow.querySelector(".save");

    // Focus without stealing YouTube's own keyboard shortcuts (space,
    // arrows, etc.) while typing in this input.
    setTimeout(() => input.focus(), 0);

    function close() {
      document.removeEventListener("click", onOutsideClick, { capture: true });
      host.remove();
    }

    function onOutsideClick(e) {
      if (!host.contains(e.target)) close();
    }
    document.addEventListener("click", onOutsideClick, { capture: true });

    cancelBtn.addEventListener("click", close);

    async function save() {
      const title = input.value.trim() || formatTime(capturedTime);
      await window.BookmarkStorage.saveBookmark(
        state.videoId,
        { title: state.title, url: state.url },
        { time: capturedTime, title }
      );
      close();
    }

    saveBtn.addEventListener("click", save);
    input.addEventListener("keydown", (e) => {
      e.stopPropagation(); // don't let YouTube react to keystrokes
      if (e.key === "Enter") save();
      if (e.key === "Escape") close();
    });
    input.addEventListener("keyup", (e) => e.stopPropagation());
  }
})();
