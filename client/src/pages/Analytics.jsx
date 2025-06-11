import AnalyticsCard from "../components/AnalyticsCard";
import SectionHeader from "../components/SectionHeader";
import TopSitesChart from "../components/charts/TopSitesChart";
import FocusVsDistractionChart from "../components/charts/FocusVsDistractionChart";
import TabSwitchChart from "../components/charts/TabSwitchChart";

function Analytics() {
  return (
    <div className="space-y-8 p-6 bg-gray-50 min-h-screen">
      <SectionHeader title="Distraction Analytics" />

      {/* Top Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <AnalyticsCard title="Top Distracting Sites" subtitle="Sites where most distraction time was spent">
          <TopSitesChart />
        </AnalyticsCard>

        <AnalyticsCard title="Focus vs Distraction Time" subtitle="Comparison of focus and distraction time (hours)">
          <FocusVsDistractionChart />
        </AnalyticsCard>

        <AnalyticsCard title="Tab Switch Pattern" subtitle="Number of tab switches over last 7 days">
          <TabSwitchChart />
        </AnalyticsCard>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <AnalyticsCard title="Distraction Trend (30 Days)" subtitle="Focus and distraction time trend over last 30 days">
          <div className="text-gray-400 text-sm text-center py-12">Coming soon</div>
        </AnalyticsCard>

        <AnalyticsCard title="Most Visited Categories" subtitle="Categories of apps/sites used during distraction">
          <div className="text-gray-400 text-sm text-center py-12">Coming soon</div>
        </AnalyticsCard>

        <AnalyticsCard title="Distraction Sources" subtitle="Browser, mobile, desktop, etc.">
          <div className="text-gray-400 text-sm text-center py-12">Coming soon</div>
        </AnalyticsCard>
      </div>
    </div>
  );
}

export default Analytics;