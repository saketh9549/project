const DEFAULT_API_BASE_URL = 'http://127.0.0.1:8000';

function getCurrentUserEmail() {
  return 'user@summarix.io';
}

function appendOwnerEmail(path) {
  const ownerEmail = getCurrentUserEmail();
  if (!ownerEmail) {
    return path;
  }

  const [pathname, queryString = ''] = path.split('?');
  const params = new URLSearchParams(queryString);

  if (!params.has('owner_email')) {
    params.set('owner_email', ownerEmail);
  }

  const nextQuery = params.toString();
  return nextQuery ? `${pathname}?${nextQuery}` : pathname;
}

export function apiUrl(path) {
  const baseUrl = import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL;
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const scopedPath = appendOwnerEmail(normalizedPath);
  return `${normalizedBase}${scopedPath}`;
}
