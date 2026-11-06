import client from './client';

export const mslApi = {
  getGlobal:           ()         => client.get('/msl/global'),
  setGlobal:           (data)     => client.put('/msl/global', data),
  listCustomerDefaults:()         => client.get('/msl/customers'),
  getCustomerDefault:  (id)       => client.get(`/msl/customers/${id}`),
  setCustomerDefault:  (id, data) => client.put(`/msl/customers/${id}`, data),
  clearCustomerDefault:(id)       => client.delete(`/msl/customers/${id}`),
  listOverrides:       (params)   => client.get('/msl/overrides', { params }),
  createOverride:      (data)     => client.post('/msl/overrides', data),
  updateOverride:      (id, data) => client.put(`/msl/overrides/${id}`, data),
  deleteOverride:      (id)       => client.delete(`/msl/overrides/${id}`),
  bulkImport:          (rows)     => client.post('/msl/overrides/bulk', { rows }),
  resolve:             (params)   => client.get('/msl/resolve', { params }),
};
