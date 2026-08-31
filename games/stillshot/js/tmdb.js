// TMDB image helper. Catalogue entries store bare TMDB image paths
// ("/abc123.jpg") — the CDN serves them keylessly and the URLs never expire,
// so unlike Hookline's Deezer previews nothing needs refreshing at play time.
// Paths that don't start with "/" are served as-is (local test frames).

const CDN = 'https://image.tmdb.org/t/p/';

export function imageUrl(path, size = 'w780') {
  if (!path) return '';
  return path.startsWith('/') ? `${CDN}${size}${path}` : path;
}

export function movieLink(id) {
  return `https://www.themoviedb.org/movie/${id}`;
}
