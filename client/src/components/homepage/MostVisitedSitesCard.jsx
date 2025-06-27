import Card from "./card";
import TopSitesChart from "../charts/TopSitesChart";

export default function MostVisitedSitesCard() {
  return (
    <Card title="Most Visited Sites">
      <div className="h-48 flex items-end justify-around px-4 pb-4">
        <TopSitesChart />
      </div>
    </Card>
  );
}
