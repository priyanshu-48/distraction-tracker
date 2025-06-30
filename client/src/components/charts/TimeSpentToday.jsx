import React, { useState, useEffect } from 'react';
import { PieChart, Pie, Tooltip, Cell, ResponsiveContainer } from 'recharts';
import api from '../../api';

export default function TimeSpentToday() {
  const [data, setData] = useState([]);
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await api.get("/analytics/time-spent-today");

        const cleaned = res.data.map(item => ({
          ...item,
          total_time: Number(item.total_time),
          shortDomain: getShortDomainFromUrl(item.url || item.domain),
        }));

        setData(cleaned);
      } catch (err) {
        console.error("Failed to fetch time spent data:", err);
      }
    };
    fetchData();
  }, []);

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#f45b69'];

  const onPieEnter = (_, index) => {
    setActiveIndex(index);
  };

  return (
    <div>
      {data.length === 0 ? (
        <p className="text-center text-gray-500">No activity logged today.</p>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              activeIndex={activeIndex}
              data={data}
              dataKey="total_time"
              fill="green"
              onMouseEnter={onPieEnter}
              style={{ cursor: 'pointer', outline: 'none' }}
              label={({ index }) => data[index].shortDomain}
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(value) => `${value} seconds`} />
          </PieChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

/**
 * Extracts a clean, readable domain name from a full URL or domain string.
 */
function getShortDomainFromUrl(input) {
  try {
    const hostname = new URL(input).hostname;
    return extractCleanDomain(hostname);
  } catch {
    return extractCleanDomain(input);
  }
}

function extractCleanDomain(domain) {
  const cleaned = domain.replace(/^www\./, '').split('.');
  const namePart = cleaned.length > 1 ? cleaned[cleaned.length - 2] : cleaned[0];
  return namePart.charAt(0).toUpperCase() + namePart.slice(1);
}
    