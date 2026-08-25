/**
 * Shared storage utility for YouTube Video Marks.
 * Loaded as a plain (non-module) script in both the content script
 * context and the popup, so it must only rely on `chrome.storage`
 * and attach itself to the global object.
 *
 * Data shape (chrome.storage.local key "ytBookmarks"):
 * {
 *   [videoId]: {
 *     title: string,
 *     url: string,
 *     bookmarks: [{ id, time, title, createdAt }]
 *   }
 * }
 */
(function (global) {
  const ROOT_KEY = "ytBookmarks";

  function generateId() {
    return "b_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  }

  async function getAllData() {
    const result = await chrome.storage.local.get(ROOT_KEY);
    return result[ROOT_KEY] || {};
  }

  async function setAllData(data) {
    await chrome.storage.local.set({ [ROOT_KEY]: data });
  }

  async function getVideo(videoId) {
    if (!videoId) return null;
    const data = await getAllData();
    return data[videoId] || null;
  }

  function sortBookmarks(video) {
    video.bookmarks.sort((a, b) => a.time - b.time);
  }

  async function saveBookmark(videoId, videoMeta, bookmarkInput) {
    if (!videoId) throw new Error("videoId is required");
    const data = await getAllData();

    if (!data[videoId]) {
      data[videoId] = {
        title: (videoMeta && videoMeta.title) || "Untitled video",
        url: (videoMeta && videoMeta.url) || "",
        bookmarks: [],
      };
    } else {
      if (videoMeta && videoMeta.title) data[videoId].title = videoMeta.title;
      if (videoMeta && videoMeta.url) data[videoId].url = videoMeta.url;
      if (!Array.isArray(data[videoId].bookmarks)) data[videoId].bookmarks = [];
    }

    const bookmark = {
      id: generateId(),
      time: bookmarkInput.time,
      title: bookmarkInput.title,
      createdAt: Date.now(),
    };

    data[videoId].bookmarks.push(bookmark);
    sortBookmarks(data[videoId]);
    await setAllData(data);
    return bookmark;
  }

  async function renameBookmark(videoId, bookmarkId, newTitle) {
    const data = await getAllData();
    const video = data[videoId];
    if (!video) return false;
    const bookmark = video.bookmarks.find((b) => b.id === bookmarkId);
    if (!bookmark) return false;
    bookmark.title = newTitle;
    await setAllData(data);
    return true;
  }

  async function deleteBookmark(videoId, bookmarkId) {
    const data = await getAllData();
    const video = data[videoId];
    if (!video) return null;
    const idx = video.bookmarks.findIndex((b) => b.id === bookmarkId);
    if (idx === -1) return null;
    const [removed] = video.bookmarks.splice(idx, 1);
    if (video.bookmarks.length === 0) {
      delete data[videoId];
    }
    await setAllData(data);
    return removed;
  }

  // Used for "undo" after a delete.
  async function restoreBookmark(videoId, videoMeta, bookmark) {
    const data = await getAllData();
    if (!data[videoId]) {
      data[videoId] = {
        title: (videoMeta && videoMeta.title) || "Untitled video",
        url: (videoMeta && videoMeta.url) || "",
        bookmarks: [],
      };
    }
    data[videoId].bookmarks.push(bookmark);
    sortBookmarks(data[videoId]);
    await setAllData(data);
  }

  async function getAllVideosSummary() {
    const data = await getAllData();
    return Object.keys(data).map((videoId) => ({
      videoId,
      title: data[videoId].title,
      url: data[videoId].url,
      count: data[videoId].bookmarks.length,
    }));
  }

  global.BookmarkStorage = {
    getAllData,
    getVideo,
    saveBookmark,
    renameBookmark,
    deleteBookmark,
    restoreBookmark,
    getAllVideosSummary,
  };
})(typeof window !== "undefined" ? window : globalThis);
