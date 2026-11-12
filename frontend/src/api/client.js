/**
 * Axios instance pre-configured for the Smart MSL Monitor API.
 * - Sends cookies (httpOnly JWT) with every request.
 * - Intercepts 401 → clears auth store and redirects to /login.
 */

import axios from 'axios';
import { useAuthStore } from '@/store/authStore';

const client = axios.create({
  baseURL: '/api',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30_000,
});

// Response interceptor – handle 401 globally, and bounce users who still
// have mustChangePassword set (e.g. sessions that predate the flag) to the
// profile page where they can rotate the temporary password.
client.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      useAuthStore.getState().clearUser();
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    } else if (
      err.response?.status === 403 &&
      err.response?.data?.error?.code === 'PASSWORD_CHANGE_REQUIRED' &&
      !window.location.pathname.startsWith('/settings/profile')
    ) {
      window.location.href = '/settings/profile?mustChange=1';
    }
    return Promise.reject(err);
  }
);

export default client;
