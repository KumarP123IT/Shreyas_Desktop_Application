import React from 'react';
import { Routes, Route } from 'react-router-dom';

import StocksList  from '@/components/stocks/StocksList';
import StockDetail from '@/components/stocks/StockDetail';

export default function StocksPage() {
  return (
    <Routes>
      <Route index     element={<StocksList />} />
      <Route path=":id" element={<StockDetail />} />
    </Routes>
  );
}
