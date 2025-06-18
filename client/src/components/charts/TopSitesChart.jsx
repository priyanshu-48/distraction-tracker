import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

const data = [
  { site: "YouTube", minutes: 52 },
  { site: "Instagram", minutes: 33 },
  { site: "Reddit", minutes: 27 },
  { site: "Twitter", minutes: 22 },
];

export default function TopSitesChart() {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart layout="horizontal" data={data}>
        <XAxis dataKey="site" type="category"/>
        <YAxis type="number" hide />
        <Tooltip />
        <Bar dataKey="minutes" fill="#8b5cf6" barSize={20}/>
      </BarChart>
    </ResponsiveContainer>
  );
}