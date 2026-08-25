// Handles the Ctrl+Shift+B keyboard shortcut. chrome.commands can only be
// listened to from the background context, so it relays the request to the
// content script running on the active tab, which captures the timestamp
// and shows the small "add bookmark" overlay.
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "add-bookmark") return;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) return;

  try {
    await chrome.tabs.sendMessage(tab.id, {
      type: "SHOW_ADD_BOOKMARK_OVERLAY",
    });
  } catch (err) {
    // No content script on this tab (not a YouTube page) -- ignore.
  }
});
