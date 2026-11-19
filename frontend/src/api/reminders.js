import client from './client';

export const remindersApi = {
  list:        (params)               => client.get('/reminders', { params }),
  generate:    (deliveryId)           => client.post(`/reminders/delivery/${deliveryId}/generate`),
  restart:     (deliveryId)           => client.post(`/reminders/delivery/${deliveryId}/restart`),
  stop:        (deliveryId, scope, deliveryItemId) =>
    client.post(`/reminders/delivery/${deliveryId}/stop`, { scope, deliveryItemId }),
  snooze:      (id, hours)            => client.post(`/reminders/${id}/snooze`, { hours }),
  reschedule:  (id, runAt)            => client.post(`/reminders/${id}/reschedule`, { runAt }),
  toggle:      (id)                   => client.post(`/reminders/${id}/toggle`),
  pauseAll:    ()                     => client.post('/reminders/pause-all'),
  resumeAll:   ()                     => client.post('/reminders/resume-all'),
  clear:       (params)               => client.delete('/reminders', { params }),
};
