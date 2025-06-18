// import React from 'react';

export default function StatBlock({ title, value, growth = null }) {
  return (
    <div className="flex flex-col">
      <p className="text-sm text-gray-500">{title}</p>
      <p className="text-2xl font-semibold text-gray-900 mt-1">{value}</p>
      {growth !== null && (
        <p className={`text-sm mt-0.5 ${growth >= 0 ? 'text-green-600' : 'text-red-500'}`}>
          {growth >= 0 ? `+${growth}%` : `${growth}%`} from last session
        </p>
      )}
    </div>
  );
}
