import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000/api',
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  // "Today" and "this week" are computed server-side in the user's timezone.
  if (config.url?.startsWith('/analytics') || config.url?.startsWith('/sites')) {
    config.params = { tz: Intl.DateTimeFormat().resolvedOptions().timeZone, ...config.params };
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    // Expired/invalid token on a protected call: drop it and go back to login.
    if (err.response?.status === 401 && !err.config.url.startsWith('/auth/')) {
      localStorage.removeItem('token');
      window.location.assign('/login');
    }
    return Promise.reject(err);
  }
);

export default api;
