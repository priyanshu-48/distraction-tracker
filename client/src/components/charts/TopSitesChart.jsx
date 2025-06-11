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
      <BarChart layout="vertical" data={data}>
        <XAxis type="number" hide />
        <YAxis dataKey="site" type="category" />
        <Tooltip />
        <Bar dataKey="minutes" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}