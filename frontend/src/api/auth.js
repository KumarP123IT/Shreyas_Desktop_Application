import client from './client';

export const authApi = {
  login: (data) => client.post('/auth/login', data),
  logout: () => client.post('/auth/logout'),
  me: () => client.get('/auth/me'),
  updateProfile: (data) => client.patch('/auth/me', data),
  changePassword: (data) => client.post('/auth/change-password', data),
};
