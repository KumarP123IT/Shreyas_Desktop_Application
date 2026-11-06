import client from './client';

export const healthApi = {
  get: () => client.get('/health'),
};
