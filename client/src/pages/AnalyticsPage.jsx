import React from 'react'
import ChartCard from '../components/ChartCard'
import TopSitesChart from '../components/charts/TopVisitedSitesToday'
import TimeSpentToday from '../components/charts/TimeSpentToday'
import TabSwitchesDaily from '../components/charts/TabSwitchesDaily'
import TimeSpentDaily from '../components/charts/TimeSpentDaily'

export default function Analytics() {
 return (
  <div className="p-10 space-y-10 bg-gray-50 min-h-screen">
    <div>
      <h1 className="text-3xl font-bold text-gray-800">Analytics</h1>
    </div>

    {/* Today Section */}
    <section>
      <h2 className="text-2xl font-semibold text-gray-700 mb-4">Today</h2>
      <div className="grid grid-cols-2 max-md:grid-cols-1 gap-6">
        <ChartCard title="Most Visited Sites">
          <TopSitesChart />
        </ChartCard>
        <ChartCard title="Most Time Spent">
          <TimeSpentToday />
        </ChartCard>
      </div>
    </section>

    {/* This Week Section */}
    <section>
      <h2 className="text-2xl font-semibold text-gray-700 mb-4">This Week</h2>
      <div className="grid grid-cols-2 max-md:grid-cols-1 gap-6">
        <ChartCard title="Daily Tab Switches">
          <TabSwitchesDaily />
        </ChartCard>
        <ChartCard title="Daily Time Spent">
          <TimeSpentDaily />
        </ChartCard>
      </div>
    </section>
  </div>
);

}

