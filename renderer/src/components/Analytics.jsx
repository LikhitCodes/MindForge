import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Cell, LineChart, Line, Tooltip } from 'recharts';
import { analyticsApi } from '../api';

const CARD = {
  background: '#1a1a1a',
  borderRadius: '12px',
  padding: '24px',
  border: '1px solid rgba(255,255,255,0.06)',
};

const FOCUS_WINDOWS = [
  { time: '12:00', score: 83 },
  { time: '8:00',  score: 80 },
  { time: '11:00', score: 80 },
  { time: '10:00', score: 78 },
  { time: '9:00',  score: 76 },
];

const VOLUME_DATA = [
  { day: 'Sat, Mar 21', v: 30 },
  { day: 'Mar 14',  v: 45 },
  { day: 'Sun, Mar 19', v: 70 },
  { day: 'Fri, Mar 16', v: 88 },
  { day: 'Thu, Mar 21', v: 62 },
  { day: '',         v: 90 },
];

const INTEGRITY_DATA = [
  { d: 'Sat, Mar 14', v: 50 },
  { d: 'Sat, Mar 16', v: 50 },
  { d: 'Sat, Mar 13', v: 50 },
  { d: 'Sat, Mar 17', v: 38 },
  { d: 'Sat, Mar 16', v: 35 },
  { d: 'Sat, Mar 27', v: 45 },
  { d: 'Tat, Mar 15', v: 62 },
  { d: 'Tat, Mar 27', v: 52 },
  { d: 'Sri, Mar 26', v: 44 },
  { d: 'Sat, Mar 27', v: 50 },
  { d: 'Sat, Mar 21', v: 50 },
];

export default function AnalyticsDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    analyticsApi.get('week').then(d => { setData(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  // Build chart data from real API or fallback
  const focusWindows = data?.bestHours?.slice(0, 5).map(h => ({
    time: `${h.hour}:00`, score: h.avgScore,
  })) || FOCUS_WINDOWS;

  const volumeData = data?.dailyStats?.slice(-6).map(d => ({
    day: d.date?.slice(5) || d.date, v: d.deepWork || 0,
  })) || VOLUME_DATA;

  const integrityData = data?.dailyStats?.map(d => ({
    d: d.date?.slice(5) || d.date, v: d.avgScore || 0,
  })) || INTEGRITY_DATA;

  const totalOutput = data?.totalDeepWork || 0;
  const efficiency  = data?.avgScore || 0;
  const volume      = data?.totalSessions || 0;

  return (
    <div style={{ width: '100%', background: '#0d0d0f', padding: '40px 48px', boxSizing: 'border-box', minHeight: 'calc(100vh - 60px)', overflowY: 'auto', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>

      {/* Page Header */}
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ color: '#ffffff', fontSize: '32px', fontWeight: 700, margin: '0 0 4px 0' }}>
          <span style={{ fontStyle: 'italic', fontWeight: 400 }}>Seseric</span> Dashboard
        </h1>
        <p style={{ color: '#6b7280', fontSize: '14px', margin: 0 }}>Key Deep Works list of deep work performance metrics.</p>
      </div>

      {/* TOP ROW: 3 stat cards + Top 5 Focus Windows + Volume Output */}
      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr 1fr', gap: '16px', marginBottom: '16px', alignItems: 'start' }}>

        {/* LEFT: 3 stacked stat cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={CARD}>
            <div style={{ fontSize: '11px', letterSpacing: '1.5px', textTransform: 'uppercase', color: '#9ca3af', marginBottom: '8px' }}>TOTAL OUTPUT</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
              <span style={{ fontSize: '48px', fontWeight: 800, color: '#22c55e', lineHeight: 1 }}>{loading ? '...' : totalOutput}</span>
              <span style={{ fontSize: '18px', color: '#22c55e', fontWeight: 500 }}>min</span>
            </div>
          </div>
          <div style={CARD}>
            <div style={{ fontSize: '11px', letterSpacing: '1.5px', textTransform: 'uppercase', color: '#9ca3af', marginBottom: '8px' }}>EFFICIENCY</div>
            <span style={{ fontSize: '48px', fontWeight: 800, color: '#f59e0b', lineHeight: 1 }}>{loading ? '...' : efficiency}</span>
          </div>
          <div style={CARD}>
            <div style={{ fontSize: '11px', letterSpacing: '1.5px', textTransform: 'uppercase', color: '#9ca3af', marginBottom: '8px' }}>VOLUME</div>
            <span style={{ fontSize: '48px', fontWeight: 800, color: '#a855f7', lineHeight: 1 }}>{loading ? '...' : volume}</span>
          </div>
        </div>

        {/* MIDDLE: Top 5 Focus Windows */}
        <div style={CARD}>
          <div style={{ fontSize: '11px', letterSpacing: '1.5px', textTransform: 'uppercase', color: '#9ca3af', marginBottom: '20px' }}>TOP 5 FOCUS WINDOWS</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {focusWindows.map((fw, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ color: '#6b7280', fontSize: '13px', width: '42px', flexShrink: 0 }}>{fw.time}</span>
              <div style={{ flex: 1, height: '28px', background: '#111', borderRadius: '4px', overflow: 'hidden', position: 'relative' }}>
                <div style={{ width: `${Math.min(fw.score, 100)}%`, height: '100%', background: '#22c55e', borderRadius: '4px', opacity: 0.85 }} />
              </div>
              <span style={{ color: '#ffffff', fontSize: '13px', fontWeight: 600, width: '24px', textAlign: 'right', flexShrink: 0 }}>{fw.score}</span>
            </div>
          ))}
          </div>
        </div>

        {/* RIGHT: Volume Output bar chart */}
        <div style={CARD}>
          <div style={{ fontSize: '11px', letterSpacing: '1.5px', textTransform: 'uppercase', color: '#9ca3af', marginBottom: '20px' }}>VOLUME OUTPUT</div>
          <div style={{ height: '200px' }}>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={VOLUME_DATA} barSize={30} margin={{ top: 4, right: 0, bottom: 20, left: -20 }}>
                <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="day" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} interval={0} angle={-20} textAnchor="end" />
                <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} domain={[0, 100]} ticks={[30, 50, 70, 100]} />
                <Bar dataKey="v" fill="#22c55e" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* BOTTOM ROW: Historical Focus Integrity (full width line chart) */}
      <div style={CARD}>
        <div style={{ fontSize: '11px', letterSpacing: '1.5px', textTransform: 'uppercase', color: '#9ca3af', marginBottom: '20px' }}>HISTORICAL FOCUS INTEGRITY</div>
        <div style={{ height: '200px' }}>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={INTEGRITY_DATA} margin={{ top: 8, right: 20, bottom: 20, left: -20 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="d" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} interval={0} angle={-15} textAnchor="end" />
              <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} domain={[30, 100]} ticks={[40, 50, 100]} />
              <Tooltip
                contentStyle={{ background: '#1a1a1a', border: '1px solid #374151', borderRadius: '8px', color: '#fff', fontSize: '12px' }}
                cursor={{ stroke: 'rgba(255,255,255,0.1)', strokeWidth: 1 }}
              />
              <Line
                type="monotone" dataKey="v" stroke="#f59e0b" strokeWidth={2}
                dot={{ fill: '#f59e0b', r: 4, strokeWidth: 0 }}
                activeDot={{ r: 6, fill: '#f59e0b' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

    </div>
  );
}
