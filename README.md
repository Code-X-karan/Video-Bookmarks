# YouTube Video Marks

A minimal Chrome extension for bookmarking exact timestamps in YouTube videos — pause, name the moment, jump back later.

## Features

- Add a bookmark at the exact current timestamp (captured on click, not on popup open)
- Click a bookmark to jump straight to that time
- Rename / delete via the `⋮` menu, with a 4s undo after delete
- Bookmarks grouped per video, with an "Other videos" browser
- Keyboard shortcut `Ctrl+Shift+B` (`Cmd+Shift+B` on Mac) for quick capture
- Works across YouTube's SPA navigation (including Shorts)
- Bookmarks persist via `chrome.storage.local` — no account, no sync, no analytics

## Install

1. Unzip the folder.
2. Go to `chrome://extensions`, enable **Developer mode**.
3. Click **Load unpacked** and select the folder containing `manifest.json`.
4. Pin the 🔖 icon for quick access.

## Usage

1. Watch a video, pause where you want to mark it.
2. Open the popup → **+ Add Bookmark** → name it → **Save**.
3. Click any bookmark later to jump to that timestamp.
4. Rename/Delete from the `⋮` menu (delete shows an **Undo** toast).
5. Or press `Ctrl+Shift+B` anytime to capture instantly via an on-page popup (shortcut is customizable at `chrome://extensions/shortcuts`).

## Structure

```
manifest.json
popup/        → popup UI (index.html, popup.js, styles.css)
content/      → runs on YouTube pages (reads state, seeks player, SPA tracking)
background/   → handles the keyboard shortcut
utils/        → shared chrome.storage.local helper
icons/
```

## Data Storage

Stored locally under `chrome.storage.local` key `ytBookmarks`:

```json
{
  "ytBookmarks": {
    "<videoId>": {
      "title": "React Tutorial",
      "url": "https://www.youtube.com/watch?v=...",
      "bookmarks": [{ "id": "b_...", "time": 134, "title": "useState explanation", "createdAt": 1234567890 }]
    }
  }
}
```

## Permissions

Only `storage` — no tabs, host, or scripting permissions beyond the declared YouTube content script.

## Known Limitations

- Timestamps may drift if a video is re-edited/re-uploaded.
- Jumping from "Other videos" always opens a new tab.
- Shorts deep-linking with a start time is best-effort (Shorts URLs don't reliably support `t=`).
