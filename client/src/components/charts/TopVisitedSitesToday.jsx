import { useEffect, useState } from "react";
import api from "../../api";
import {
    BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";

export default function TopSitesChart() {
    const [data, setData] = useState([]);

    useEffect(() => {
        api.get("/analytics/most-visited-today").then((res) => {
            const cleaned = res.data.map(item => ({
                ...item,
                shortDomain: item.domain.split('.')[0],
            }));    
            const finalized = cleaned.map(item => ({
                ...item,
                shortDomain: item.shortDomain.charAt(0).toUpperCase() + item.shortDomain.slice(1),
            }))
            setData(finalized);
        });
    }, []);

    return (
        <div>
            <ResponsiveContainer width="100%" height={300}>
                <BarChart layout="vertical" data={data} margin={{ top: 20, right: 40, left: 40, bottom: 20 }}>
                    <XAxis type="number" dataKey="visit_count" allowDecimals={false} domain={[0, 'dataMax']} tickFormatter={(tick) => tick}/>
                    <YAxis type="category" dataKey="shortDomain" tick={{ fontSize: 12 }}/>
                    <Tooltip formatter={(val) => `${val} visits`}/>
                    <Bar dataKey="visit_count" fill='#8b5cf6ff' radius={[0, 2, 2, 0]} />
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}
