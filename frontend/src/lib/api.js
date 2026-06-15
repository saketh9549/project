const DEFAULT_API_BASE_URL = 'http://localhost:8000';

export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL).replace(/\/$/, '');

function getCurrentUser() {
  try {
    const userJson = localStorage.getItem('summarix_user');
    return userJson ? JSON.parse(userJson) : null;
  } catch (e) {
    return null;
  }
}

function getCurrentUserEmail() {
  const user = getCurrentUser();
  return user ? user.email : '';
}

function getCurrentUserRole() {
  const user = getCurrentUser();
  return user ? user.role : 'user';
}

function appendOwnerEmail(path) {
  if (path.startsWith('/api/auth/')) {
    return path;
  }

  const ownerEmail = getCurrentUserEmail();
  const role = getCurrentUserRole();
  if (!ownerEmail) {
    return path;
  }

  const [pathname, queryString = ''] = path.split('?');
  const params = new URLSearchParams(queryString);

  if (!params.has('owner_email')) {
    params.set('owner_email', ownerEmail);
  }
  if (!params.has('role')) {
    params.set('role', role);
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
