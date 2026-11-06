import client from './client';

export const customersApi = {
  list:    (params) => client.get('/customers', { params }),
  getOne:  (id)     => client.get(`/customers/${id}`),
  create:  (data)   => client.post('/customers', data),
  update:  (id, d)  => client.patch(`/customers/${id}`, d),
  archive: (id)     => client.delete(`/customers/${id}`),
  restore: (id)     => client.post(`/customers/${id}/restore`),
};
