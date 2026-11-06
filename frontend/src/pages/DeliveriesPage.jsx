import React, { useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import DeliveriesList from '@/components/delivery/DeliveriesList';
import DeliveryDetail from '@/components/delivery/DeliveryDetail';

export default function DeliveriesPage() {
  return (
    <Routes>
      <Route index element={<DeliveriesList />} />
      <Route path=":id" element={<DeliveryDetail />} />
    </Routes>
  );
}
