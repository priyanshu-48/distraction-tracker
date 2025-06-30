import { useEffect, useState } from "react";
import api from "../../api";
import {
    BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,CartesianGrid,
} from "recharts";

export default function TopSitesChart() {
    const [data, setData] = useState([]);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const res = await api.get("/analytics/most-visited-today");

                const cleaned = res.data.map(item => ({
                    ...item,
                    shortDomain: item.domain.split('.')[0],
                }));

                const finalized = cleaned.map(item => ({
                    ...item,
                    shortDomain: item.shortDomain.charAt(0).toUpperCase() + item.shortDomain.slice(1),
                }));

                setData(finalized);
            } catch (err) {
                console.error("Failed to fetch most visited sites:", err);
            }
        };
        fetchData();
    }, []);


    const paddedData = [...data];
    while (paddedData.length < 5) {
        paddedData.push({
            shortDomain: '',
            visit_count: 0
        });
    }

    const maxValue = Math.max(...paddedData.map(d => d.visit_count), 0);
    const roundedMax = Math.ceil(maxValue / 10) * 10;

    return (
        <div>
            {data.length === 0 ? (
                <div>
                    <p className="text-center text-gray-500 mb-10">No activity logged today.</p>
                </div>
            ) : (
                <ResponsiveContainer width="100%" height={300}>
                    <BarChart layout="vertical" data={paddedData} margin={{ top: 20, right: 40, left: 40, bottom: 20 }}>
                        <CartesianGrid vertical={true} horizontal={false} />
                        <XAxis type="number" dataKey="visit_count" tickCount={6}  domain={[0, roundedMax]}/>
                        <YAxis type="category" dataKey="shortDomain" tick={{ fontSize: 12 }} />
                        <Tooltip formatter={(val) => `${val} visits`} />
                        <Bar dataKey="visit_count" fill='#8b5cf6ff' radius={[0, 2, 2, 0]} />
                    </BarChart>
                </ResponsiveContainer>
            )}
        </div>
    );
}
