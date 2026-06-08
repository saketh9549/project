const DEFAULT_API_BASE_URL = 'http://localhost:8000';
const CURRENT_USER_STORAGE_KEY = 'summarix.currentUser';

export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL).replace(/\/$/, '');

function getCurrentUserEmail() {
  if (typeof window === 'undefined') {
    return '';
  }

  try {
    const raw = window.localStorage.getItem(CURRENT_USER_STORAGE_KEY);
    if (!raw) {
      return '';
    }

    const parsed = JSON.parse(raw);
    return typeof parsed?.email === 'string' ? parsed.email.trim() : '';
  } catch {
    return '';
  }
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
  if (!path) {
    return API_BASE_URL;
  }

  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const scopedPath = appendOwnerEmail(normalizedPath);
  return `${API_BASE_URL}${scopedPath}`;
}
