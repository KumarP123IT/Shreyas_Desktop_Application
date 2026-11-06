import client from './client';

export const notificationsApi = {
  list:    (params) => client.get('/notifications', { params }),
  retry:   (id)      => client.post(`/notifications/${id}/retry`),
  clear:   (params)  => client.delete('/notifications', { params }),
  internet:()        => client.get('/notifications/internet'),
};
