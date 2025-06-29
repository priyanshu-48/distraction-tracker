import React from 'react';

export default function Card({ title, children }) {
  return (
    <div className="bg-white rounded-xl shadow pt-8">
      {title && <h2 className="text-lg text-center font-semibold text-gray-900 mb-4">{title}</h2>}
      {children}
    </div>
  );
}

