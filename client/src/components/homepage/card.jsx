import React from 'react';

export default function Card({ title, children }) {
  return (
    <div className="bg-white rounded-xl shadow p-6">
      {title && <h2 className="text-lg font-semibold text-gray-900 mb-4">{title}</h2>}
      {children}
    </div>
  );
}

