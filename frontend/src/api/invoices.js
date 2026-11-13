import client from './client';

export const invoicesApi = {
  upload: (customerId, formData) =>
    client.post(`/customers/${customerId}/invoices/upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  list:   (customerId, params) =>
    client.get(`/customers/${customerId}/invoices`, { params }),
  getOne: (customerId, invoiceId) =>
    client.get(`/customers/${customerId}/invoices/${invoiceId}`),
  updateItems: (customerId, invoiceId, items) =>
    client.patch(`/customers/${customerId}/invoices/${invoiceId}`, { items }),
  apply:  (customerId, invoiceId) =>
    client.post(`/customers/${customerId}/invoices/${invoiceId}/apply`),
  cancel: (customerId, invoiceId) =>
    client.post(`/customers/${customerId}/invoices/${invoiceId}/cancel`),
};
