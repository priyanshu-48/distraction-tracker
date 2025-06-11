import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

const data = [
  { day: "Mon", count: 31 },
  { day: "Tue", count: 45 },
  { day: "Wed", count: 39 },
  { day: "Thu", count: 42 },
  { day: "Fri", count: 37 },
  { day: "Sat", count: 21 },
  { day: "Sun", count: 18 },
];

export default function TabSwitchChart() {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data}>
        <XAxis dataKey="day" />
        <YAxis />
        <Tooltip />
        <Line type="monotone" dataKey="count" stroke="#6366f1" strokeWidth={2} />
      </LineChart>
    </ResponsiveContainer>
  );
}