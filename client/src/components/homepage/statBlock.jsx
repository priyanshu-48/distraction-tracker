import { useEffect, useState } from 'react';
import api from '../../api';

export default function StatBlock() {
  const [stats, setStats] = useState({
    distractions: 0,
    distractionTime: 0,
    sessionTime: 0,
    mostVisited: 'N/A'
  });

  useEffect(() => {
    async function fetchStats() {
      const [distractionsRes, sessionRes] = await Promise.all([
        api.get('/analytics/today-count'),
        api.get('/analytics/today-session'),
      ]);

      const distractionTime = distractionsRes.data[0].distraction_time || 0;
      const rawDomain = distractionsRes.data[0].most_visited_domain || 'N/A';
      const mostVisited = cleanDomain(rawDomain);

      const timeObj = sessionRes.data[0]?.total_time || {
        hours: 0,
        minutes: 0,
        seconds: 0
      };

      const sessionTime =
        (timeObj.hours || 0) * 3600 +
        (timeObj.minutes || 0) * 60 +
        (timeObj.seconds || 0);

      setStats({
        distractions: distractionsRes.data[0].count || 0,
        distractionTime,
        sessionTime,
        mostVisited
      });
    }

    fetchStats();
  }, []);


  return (
    <div className="grid grid-cols-4 max-md:grid-cols-2 gap-6 m-6">
      <StatCard title="Distractions" value={stats.distractions} />
      <StatCard title="Most Visited Website" value={stats.mostVisited} />
      <StatCard title="Distraction Time" value={formatTime(stats.distractionTime)} />
      <StatCard title="Session Time" value={formatTime(stats.sessionTime)} />
    </div>
  );
}

function StatCard({ title, value }) {
  return (
    <div className="bg-white shadow-md rounded-2xl p-4 text-center">
      <h4 className="text-sm font-medium text-gray-500">{title}</h4>
      <p className="text-2xl font-semibold text-gray-800 mt-2">{value}</p>
    </div>
  );
}

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
}

function cleanDomain(domain) {
  if (!domain) return 'N/A';

  let cleaned = domain.replace(/^https?:\/\/(www\.)?/, '').replace(/^www\./, '');
  cleaned = cleaned.split('/')[0];
  cleaned = cleaned.replace(/\.(com|in|org|net|co)$/, '');
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}


