// TikTok LIVE bridge client — connects to the local serve.mjs WebSocket
// (/tiktok), which talks to TikTok LIVE directly via tiktok-live-connector.
// Auto-reconnects with exponential backoff (1s → 15s). Identical pattern to
// Hookline / TikTok Café.
//
// Events arrive as { event, data }:
//   chat        { uniqueId, nickname, comment, profilePictureUrl }
//   gift        { uniqueId, nickname, giftName, diamondCount, repeatCount }
//   roomUser    { viewerCount }
//   tiktokState { state, username, error }   (connection status for the UI)

export const DEFAULT_URL = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/tiktok`;
const MIN_RECONNECT_MS = 1000;
const MAX_RECONNECT_MS = 15000;

export function connect({
  url = DEFAULT_URL,
  onOpen,
  onClose,
  onError,
  onEvent,
} = {}) {
  let socket  = null;
  let delayMs = MIN_RECONNECT_MS;
  let stopped = false;

  function open() {
    if (stopped) return;
    socket = new WebSocket(url);

    socket.addEventListener("open", () => {
      delayMs = MIN_RECONNECT_MS;
      onOpen?.();
    });

    socket.addEventListener("close", (ev) => {
      onClose?.(ev);
      if (stopped) return;
      setTimeout(open, delayMs);
      delayMs = Math.min(delayMs * 2, MAX_RECONNECT_MS);
    });

    socket.addEventListener("error", (ev) => {
      onError?.(ev);
    });

    socket.addEventListener("message", (ev) => {
      let parsed;
      try {
        parsed = JSON.parse(ev.data);
      } catch (err) {
        onError?.({ kind: "parse", raw: ev.data, err });
        return;
      }
      onEvent?.(parsed);
    });
  }

  open();

  return {
    get url() { return url; },
    stop() { stopped = true; socket?.close(); },
  };
}
