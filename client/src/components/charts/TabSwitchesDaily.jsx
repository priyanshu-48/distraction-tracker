import { useState, useEffect } from "react";
import api from "../../api";
import {
    LineChart,
    ResponsiveContainer,
    Legend,
    Tooltip,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
} from "recharts";

export default function TabSwitchesDaily() {
    const [data, setData] = useState([]);

    useEffect(() => {
        const fetchData = async () => {
            const res = await api.get("/analytics/tab-switches-daily");
            setData(res.data);
        };
        fetchData();
    }, []);

    const maxValue = Math.max(...data.map(item => item.tab_switches),0);
    const roundedMax = Math.ceil(maxValue/10)*10;

    return (
        <>
            <ResponsiveContainer width="100%" height={300}>
                <LineChart data={data} margin={{ top: 20, right: 60, left: 20, bottom: 20 }}>
                    <CartesianGrid />
                    <XAxis dataKey="weekday" interval={"preserveStartEnd"}/>
                    <YAxis domain={[0, roundedMax]} tickCount={6} />
                    <Legend />
                    <Tooltip />
                    <Line
                        dataKey="tab_switches"
                        name="No. of Switches"
                        stroke="#f45b69"
                        strokeWidth={2}
                        dot={{ r: 4, fill:"#f45b69" }} 
                        activeDot={{ r: 8 }}
                    />
                </LineChart>
            </ResponsiveContainer>
        </>
    )
}