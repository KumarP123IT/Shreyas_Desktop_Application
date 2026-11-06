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

// Response interceptor – handle 401 globally
client.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      useAuthStore.getState().clearUser();
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  }
);

export default client;
