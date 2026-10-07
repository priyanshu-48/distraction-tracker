import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000/api',
  // The login is an httpOnly cookie the browser attaches by itself; no script, including ours, ever sees it.
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  // The server wants this header on anything that changes data when the cookie is the credential. A page on another
  // site cannot send it without a CORS preflight that the server refuses.
  if ((config.method || 'get').toLowerCase() !== 'get') config.headers['X-Requested-With'] = 'dt';
  // "Today" and "this week" are computed server-side in the user's timezone.
  if (['/sites', '/summary', '/range'].some((prefix) => config.url?.startsWith(prefix))) {
    config.params = { tz: Intl.DateTimeFormat().resolvedOptions().timeZone, ...config.params };
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    // The session ended (expired, logged out elsewhere, account deleted): back to sign-in. Sign-in calls and the
    // "who am I" check answer 401 as a normal part of being signed out, so they are left to their callers.
    if (err.response?.status === 401 && !err.config.url.startsWith('/auth/')) {
      window.location.assign('/login');
    }
    return Promise.reject(err);
  }
);

export default api;
