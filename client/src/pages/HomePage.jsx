import { Play, Pause } from "lucide-react";
import Button from "../components/homepage/button";
import StatBlock from '../components/homepage/statBlock';
import { useTracking } from "../hooks/useTracking";
import ChartCard from "../components/ChartCard";
import TopVisitedToday from "../components/charts/TopVisitedSitesToday";
import TimeSpentToday from "../components/charts/TimeSpentToday";
import TimeSpentDaily from "../components/charts/TimeSpentDaily";
import TabSwitchesDaily from "../components/charts/TabSwitchesDaily";

export default function HomePage() {
  const { isTracking, toggleTracking } = useTracking();

  return (
    <div className="min-h-screen bg-warm-white text-gray-800 m-0 p-0">
      <div className="max-w-80% mx-auto space-y-6">
        <div className="justify-self-center pt-12">
          <h1 className="text-4xl font-bold mb-10">Distraction Tracker</h1>
        </div>

        <StatBlock />

        <div className="justify-self-center p-6">
          <Button
            onClick={toggleTracking}
            variant={isTracking ? "destructive" : "default"}
            className="text-2xl gap-3"
          >
            {isTracking ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6" />}
            {isTracking ? "Stop" : "Start"} Session
          </Button>
        </div>
        <div className="grid grid-cols-2 grid-rows-2 gap-4 m-10"> 
            <ChartCard title='Most Visited Sites'><TopVisitedToday/></ChartCard>
            <ChartCard title='Most Time Spent'><TimeSpentToday /></ChartCard>
            <ChartCard title="Daily Tab Switches"><TabSwitchesDaily /></ChartCard>
            <ChartCard title="Daily Time Spent"><TimeSpentDaily /></ChartCard>
        </div>
      </div>
    </div>
  );
}
