import client from './client';

export const stocksApi = {
  list:   (params)       => client.get('/stocks', { params }),
  getOne: (id)           => client.get(`/stocks/${id}`),
  create: (data)         => client.post('/stocks', data),
  update: (id, data)     => client.patch(`/stocks/${id}`, data),
  adjust: (id, data)     => client.post(`/stocks/${id}/adjust`, data),
  remove: (id)           => client.delete(`/stocks/${id}`),
};
