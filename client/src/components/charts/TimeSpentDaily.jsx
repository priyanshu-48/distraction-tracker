import { useState,useEffect, use } from "react";
import api from "../../api.js";
import {
    BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,CartesianGrid,
} from "recharts";

export default function TimeSpentDaily(){
    const [data,setData] = useState([]);
    useEffect(() => {
        const fetchData = async () => {
            const res = await api.get("/analytics/time-spent-daily");
            setData(res.data);
        }
        fetchData();
    },[]);

    return(
        <>
            <ResponsiveContainer width="100%" height={300}>
                <BarChart data={data} margin={{ top: 20, right: 40, left: 0, bottom: 20 }} barCategoryGap='30%' >
                    <CartesianGrid />
                    <XAxis dataKey="weekday"/>
                    <YAxis dataKey="time_spent" />
                    <Bar dataKey="time_spent" fill='#8b5cf6ff' radius={[2, 2, 0, 0]}/>
                    <Tooltip />
                </BarChart>
            </ResponsiveContainer>
        </>
    )
}