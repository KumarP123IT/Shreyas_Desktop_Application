import client from './client';

export const forecastsApi = {
  upload:   (formData) => client.post('/forecasts/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  save:     (data)     => client.post('/forecasts/save', data),
  activate: (id, data) => client.post(`/forecasts/${id}/activate`, data),
  list:     (params)   => client.get('/forecasts', { params }),
  download: (id)       => client.get(`/forecasts/${id}/file`, { responseType: 'blob' }),
};

export const deliveriesApi = {
  kpis:           ()           => client.get('/deliveries/kpis'),
  list:           (params)     => client.get('/deliveries', { params }),
  getOne:         (id)         => client.get(`/deliveries/${id}`),
  updateSchedule: (id, data)   => client.patch(`/deliveries/${id}/schedule`, data),
  saveSheet:      (id, data)   => client.post(`/deliveries/${id}/sheet`, data),
  reapplyDefaults:(id)         => client.post(`/deliveries/${id}/reapply-defaults`),
  mslSummary:     (id)         => client.get(`/deliveries/${id}/msl-summary`),
  remove:         (id)         => client.delete(`/deliveries/${id}`),
};
