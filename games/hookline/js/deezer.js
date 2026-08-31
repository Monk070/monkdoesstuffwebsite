// Deezer preview URLs carry an expiry token, so URLs baked into the catalogue
// at build time eventually go stale. The Deezer API supports JSONP, which lets
// a purely static site fetch a fresh preview URL at play time with no proxy.

let cbCounter = 0;

export function freshPreview(deezerId, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const cbName = `__dzcb_${Date.now()}_${cbCounter++}`;
    const script = document.createElement('script');
    let settled = false;

    const finish = (value) => {
      if (settled) return;
      settled = true;
      delete window[cbName];
      script.remove();
      resolve(value);
    };

    window[cbName] = (data) => {
      finish(data && !data.error && data.preview ? data.preview : null);
    };
    script.onerror = () => finish(null);
    setTimeout(() => finish(null), timeoutMs);

    script.src = `https://api.deezer.com/track/${deezerId}?output=jsonp&callback=${cbName}`;
    document.head.appendChild(script);
  });
}
