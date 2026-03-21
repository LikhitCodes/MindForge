import { useState, useEffect } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

const API = 'http://localhost:39871';

function StatCard({ label, value, unit, color }) {
  return (
    <div className="premium-card p-5 flex flex-col">
      <span className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-tertiary)' }}>
        {label}
      </span>
      <div className="flex items-baseline gap-1">
        <span className="text-3xl font-black tabular-nums" style={{ color: color || 'var(--text-primary)' }}>
          {value}
        </span>
        {unit && <span className="text-sm font-medium" style={{ color: 'var(--text-tertiary)' }}>{unit}</span>}
      </div>
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="premium-card px-3 py-2 text-xs" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
      <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }}>
          {p.name}: <strong>{p.value}</strong>
        </p>
      ))}
    </div>
  );
};

export default function Analytics() {
  const [range, setRange] = useState('week');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`${API}/analytics?range=${range}`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [range]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin w-8 h-8 border-4 border-zinc-600 border-t-white rounded-full" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-500">
        Failed to load analytics data
      </div>
    );
  }

  // Format daily data for charts
  const chartData = (data.dailyStats || []).map((d) => ({
    date: new Date(d.date).toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' }),
    'Deep Work': d.deepWork,
    'Avg Score': d.avgScore,
    Sessions: d.sessions,
  }));

  // Best hours data
  const hoursData = (data.bestHours || []).slice(0, 8).map((h) => ({
    hour: `${h.hour}:00`,
    score: h.avgScore,
  }));

  return (
    <div className="h-full overflow-y-auto pr-2 pb-6" style={{ scrollbarGutter: 'stable' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Analytics</h2>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            Your focus trends at a glance
          </p>
        </div>
        <div className="flex gap-1 p-1 rounded-lg" style={{ background: 'var(--bg-secondary)' }}>
          {['week', 'month'].map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all capitalize ${
                range === r ? 'bg-white text-black' : 'text-zinc-400 hover:text-white'
              }`}
            >
              {r === 'week' ? 'This Week' : 'This Month'}
            </button>
          ))}
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Deep Work" value={data.totalDeepWork} unit="min" color="var(--score-green)" />
        <StatCard label="Avg Score" value={data.avgScore} color="var(--score-amber)" />
        <StatCard label="Sessions" value={data.totalSessions} />
        <StatCard label="Current Streak" value={data.currentStreak} unit="days" color="var(--score-green)" />
      </div>

      {/* Deep Work Chart */}
      <div className="premium-card p-6 mb-6">
        <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
          Daily Deep Work
        </h3>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="date" tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }} />
            <YAxis tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="Deep Work" fill="var(--score-green)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Focus Score Trend */}
      <div className="premium-card p-6 mb-6">
        <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
          Focus Score Trend
        </h3>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="date" tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }} />
            <YAxis domain={[0, 100]} tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }} />
            <Tooltip content={<CustomTooltip />} />
            <Line type="monotone" dataKey="Avg Score" stroke="var(--score-amber)" strokeWidth={2} dot={{ fill: 'var(--score-amber)', r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Best Hours */}
      <div className="premium-card p-6">
        <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
          Most Productive Hours
        </h3>
        {hoursData.length > 0 ? (
          <div className="space-y-3">
            {hoursData.map((h, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="text-xs font-mono w-12 text-right" style={{ color: 'var(--text-tertiary)' }}>
                  {h.hour}
                </span>
                <div className="flex-1 h-6 rounded" style={{ background: 'var(--bg-secondary)' }}>
                  <div
                    className="h-full rounded transition-all duration-500"
                    style={{
                      width: `${h.score}%`,
                      background: h.score >= 70 ? 'var(--score-green)' : h.score >= 50 ? 'var(--score-amber)' : 'var(--score-red)',
                      opacity: 0.8,
                    }}
                  />
                </div>
                <span className="text-xs font-bold tabular-nums w-8" style={{ color: 'var(--text-primary)' }}>
                  {h.score}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>No data yet. Complete some focus sessions!</p>
        )}
      </div>
    </div>
  );
}
