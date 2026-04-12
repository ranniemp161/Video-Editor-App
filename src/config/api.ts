/**
 * Central API configuration.
 * Import API_BASE and getAuthHeaders() from here instead of defining them per-file.
 */

export const API_BASE = import.meta.env.VITE_API_URL || '/api';

/** Returns the stored JWT token, or null if not logged in. */
export const getAuthToken = (): string | null =>
  localStorage.getItem('auth_token');

/**
 * Returns an Authorization header object ready to spread into fetch options.
 * Returns an empty object when no token is present (unauthenticated).
 *
 * Usage:
 *   fetch(`${API_BASE}/endpoint`, {
 *     method: 'POST',
 *     headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
 *   })
 */
export const getAuthHeaders = (): Record<string, string> => {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};
