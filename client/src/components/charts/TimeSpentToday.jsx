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
                    shortDomain: item.domain.split('.')[0],
                }));

                const finalized = cleaned.map(item => ({
                    ...item,
                    total_time: Number(item.total_time),
                    shortDomain: item.shortDomain.charAt(0).toUpperCase() + item.shortDomain.slice(1),
                }));

                setData(finalized);
            } catch (err) {
                console.error("Failed to fetch time spent data:", err);
            }
        };
        fetchData();
    }, []);

    const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#f45b69']

    const onPieEnter = (_, index) => {
        setActiveIndex(index);
    }

    return (
        <div>
            {data.length === 0 ? (
                <p className="text-center text-gray-500">No activity logged today.</p>
            ) : (
                <ResponsiveContainer width='100%' height={300}>
                    <PieChart >
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
                        <Tooltip />
                    </PieChart>
                </ResponsiveContainer>
            )}
        </div>
    )
}