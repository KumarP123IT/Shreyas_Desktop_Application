import React, { useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import CustomersList from '@/components/customers/CustomersList';
import CustomerDetail from '@/components/customers/CustomerDetail';

export default function CustomersPage() {
  return (
    <Routes>
      <Route index element={<CustomersList />} />
      <Route path=":id" element={<CustomerDetail />} />
    </Routes>
  );
}
