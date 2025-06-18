import { useState } from "react";
import Button from "../components/homepage/button";
import StatBlock from "../components/homepage/statBlock";
import {BarChart,Bar,XAxis,YAxis,Tooltip,ResponsiveContainer,} from "recharts";
import TopSitesChart from "../components/charts/TopSitesChart";
import Card from "../components/homepage/card";
import { Play, Pause } from "lucide-react";

export default function HomePage() {
  const [tracking, setTracking] = useState(false);

  const toggleTracking = () => setTracking((prev) => !prev);

  const analytics = {
    mostVisitedSites: [
      { site: "YouTube", time: 120 },
      { site: "Reddit", time: 90 },
      { site: "StackOverflow", time: 60 },
    ],
    focusSessionTime: "3h 20m",
    timeDistracted: "1h 10m",
    timeFocused: "4h 30m",
    sessionCount: 5,
  };

  return (
    <div className="min-h-screen bg-warm-white text-gray-800 m-0 p-0">
      <div className="max-w-80% mx-auto space-y-6">
        <div className="justify-self-center pt-12">
          <h1 className="text-4xl font-bold">Focus Tracker</h1>
        </div>
        <div className="bg-white rounded-2xl m-10 grid grid-cols-2 md:grid-cols-4 gap-x-10 gap-y-4 px-6 py-4">
          <StatBlock title="Focus Session Time" value="3h 20m" growth={5.2} />
          <StatBlock title="Time Distracted" value="1h 10m" growth={-3.1} />
          <StatBlock title="Focus Sessions" value="5" />
          <StatBlock title="Total Focused" value="4h 30m" />
        </div>
        <div className="justify-self-center p-6 ">
          <Button
            onClick={toggleTracking}
            variant={tracking ? "destructive" : "default"}
            className="text-2xl gap-3"
          >
            {tracking ? (
              <Pause className="w-6 h-6" />
            ) : (
              <Play className="w-6 h-6" />
            )}
            {tracking ? "Stop" : "Start"} Session
          </Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 px-10 mt-12">

          <Card title="Most Visited Sites">
            <div className="h-48 flex items-end justify-around px-4 pb-4">
              <TopSitesChart />
            </div>
          </Card>

          <Card title="Distraction Peaks">
            <div className="h-48 flex items-center justify-center text-gray-500">
              {/* Chart goes here */}
            </div>
          </Card>

          <Card title="Focus Timeline">
            <div className="h-48 flex items-center justify-center text-gray-500">
              {/* Graph goes here */}
            </div>
          </Card>

        </div>
      </div>
    </div>
  );
}
