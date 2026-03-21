import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Cell, Tooltip } from 'recharts';
import { dashboardApi, scoreToHeatColor } from '../api';

function useSplineScript() {
  useEffect(() => {
    if (!document.querySelector('script[src*="spline-viewer"]')) {
      const s = document.createElement('script');
      s.type = 'module';
      s.src = 'https://unpkg.com/@splinetool/viewer@1.12.70/build/spline-viewer.js';
      document.head.appendChild(s);
    }
  }, []);
}

const TARGET = 20;
const DAYS = ['SUN', 'MON', 'TUE', 'FRI'];

const CARD = {
  background: '#161616',
  borderRadius: '16px',
  padding: '24px',
  border: '1px solid rgba(255,255,255,0.07)',
};

// Fallback static heatmap (used until real data loads)
function buildFallbackMatrix() {
  const pattern = {
    active: ['#22c55e', '#22c55e', '#16a34a', '#22c55e', '#22c55e'],
    mid:    ['#15803d', '#16a34a', '#22c55e', '#16a34a', '#15803d'],
    low:    ['#15803d', '#16a34a', '#16a34a', '#22c55e', '#16a34a'],
    dim:    ['#166534', '#15803d', '#16a34a', '#15803d', '#166534'],
  };
  const dayPatterns = [pattern.active, pattern.mid, pattern.low, pattern.dim];
  return DAYS.map((_, di) =>
    Array.from({ length: 24 }, (_, h) => {
      const row = dayPatterns[di];
      if (h >= 9 && h <= 13) return row[(h - 9) % row.length];
      if (h >= 18 && h <= 22) return row[(h - 18) % row.length];
      if (h >= 13 && h <= 17) return (di + h) % 3 === 0 ? '#15803d' : '#1f2937';
      return '#1f2937';
    })
  );
}

// Convert [{day, hour, avg_score}] → 4-row × 24-col matrix
function heatmapDataToMatrix(heatData) {
  // day 0=Sun,1=Mon,2=Tue,4=Fri → map to our 4 rows
  const dayMap = { 0: 0, 1: 1, 2: 2, 5: 3 }; // Sun Mon Tue Fri
  const matrix = DAYS.map(() => Array(24).fill('#1f2937'));
  heatData.forEach(({ day, hour, avg_score }) => {
    const row = dayMap[day];
    if (row === undefined) return;
    const col = Math.max(0, Math.min(23, hour));
    matrix[row][col] = scoreToHeatColor(avg_score);
  });
  return matrix;
}

export default function Dashboard() {
  const navigate = useNavigate();
  useSplineScript();

  // ── Analytics state ─────────────────────────────────────
  const [ramp, setRamp]       = useState(null);   // { current_target, today_best, history[] }
  const [debt, setDebt]       = useState(null);   // { debt_minutes }
  const [matrix, setMatrix]   = useState(buildFallbackMatrix());
  const [summary, setSummary] = useState(null);   // { totalDeepWork, habitsCompleted, habitsTotal, avgScore }
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [rampRes, debtRes, heatRes, sumRes] = await Promise.allSettled([
          dashboardApi.ramp(),
          dashboardApi.debt(),
          dashboardApi.heatmap(),
          dashboardApi.summary(),
        ]);
        if (rampRes.status === 'fulfilled') setRamp(rampRes.value);
        if (debtRes.status === 'fulfilled') setDebt(debtRes.value);
        if (heatRes.status === 'fulfilled' && Array.isArray(heatRes.value) && heatRes.value.length > 0) {
          setMatrix(heatmapDataToMatrix(heatRes.value));
        }
        if (sumRes.status === 'fulfilled') setSummary(sumRes.value);
      } catch (_) {}
      setLoading(false);
    }
    load();
  }, []);

  // Build chart data from ramp history
  const rampData = ramp?.history?.length > 0
    ? ramp.history.map(r => ({ date: r.date?.slice(5) || r.date, value: r.achieved || 0, done: (r.achieved || 0) >= (ramp.current_target || TARGET) }))
    : [
        { date: '03-14', value: 45, done: true },
        { date: '03-15', value: 25, done: false },
        { date: '03-16', value: 60, done: true },
        { date: '03-17', value: 20, done: false },
        { date: '03-18', value: 30, done: false },
        { date: '03-20', value: 35, done: false },
      ];

  const target   = ramp?.current_target || TARGET;
  const todayBest= ramp?.today_best || 0;
  const debtMin  = debt?.debt_minutes || 0;
  const deepWork = summary?.totalDeepWork || 0;
  const habDone  = summary?.habitsCompleted || 0;
  const habTotal = summary?.habitsTotal || 3;
  const pct      = summary?.avgScore ? `${summary.avgScore}%` : '--';

  return (
    <div style={{ width: '100%', height: '100vh', overflowY: 'auto', overflowX: 'hidden', scrollBehavior: 'smooth' }}>

      {/* ── HERO ── */}
      <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: '80px', minHeight: '100vh', width: '100%', position: 'relative', overflow: 'hidden', flexShrink: 0, background: '#000000' }}>
        <div style={{ flex: '0 0 auto', maxWidth: '560px', paddingRight: '40px', zIndex: 10 }}>
          <h1 style={{ fontSize: '72px', fontWeight: 800, color: '#ffffff', lineHeight: 1.1, letterSpacing: '-2px', margin: '0 0 24px 0' }}>
            Design your<br />own focus
          </h1>
          <p style={{ fontSize: '16px', color: '#9ca3af', fontWeight: 400, lineHeight: 1.6, margin: '0 0 40px 0' }}>
            We build systems that process data at the speed of thought.<br />
            Fast, adaptive, and built to scale with the world.
          </p>
          <button onClick={() => navigate('/session')}
            style={{ background: '#ffffff', color: '#000000', borderRadius: '50px', padding: '14px 32px', fontSize: '16px', fontWeight: 600, border: 'none', cursor: 'pointer' }}>
            Get Started
          </button>
        </div>
        <div style={{ flex: '0 0 55%', height: '100vh', position: 'relative', overflow: 'hidden' }}>
          {/* @ts-ignore */}
          <spline-viewer url="https://prod.spline.design/Nv3Hgrs9DL1kFEb1/scene.splinecode" style={{ width: '100%', height: '100%', display: 'block' }} />
          <div style={{ position: 'absolute', bottom: 0, right: 0, width: '220px', height: '60px', background: '#000000', zIndex: 20 }} />
        </div>
      </div>

      {/* ── NEURAL ANALYTICS ENGINE ── */}
      <div style={{ background: '#0a0a0a', padding: '60px 48px 80px', width: '100%', boxSizing: 'border-box', flexShrink: 0 }}>

        {/* Header */}
        <div style={{ marginBottom: '40px' }}>
          <div style={{ width: '40px', height: '3px', background: '#6366f1', borderRadius: '2px', marginBottom: '12px' }} />
          <h2 style={{ color: '#ffffff', fontSize: '36px', fontWeight: 700, letterSpacing: '-0.5px', margin: '0 0 8px 0' }}>Neural Analytics Engine</h2>
          <p style={{ color: '#6b7280', fontSize: '15px', fontWeight: 400, margin: 0 }}>Monitoring subconscious habits and structural focus over time.</p>
        </div>

        {/* ROW 1: Deep Work Ramp + Focus Debt */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.8fr 1fr', gap: '16px', marginBottom: '20px', alignItems: 'stretch' }}>

          {/* Deep Work Ramp */}
          <div style={{ ...CARD, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
              <div>
                <div style={{ color: '#ffffff', fontSize: '18px', fontWeight: 600 }}>Deep Work Ramp</div>
                <div style={{ color: '#6b7280', fontSize: '13px', marginTop: '2px' }}>Progressive focus training</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                <span style={{ border: '1px solid rgba(255,255,255,0.12)', borderRadius: '20px', padding: '4px 12px', fontSize: '13px', color: '#9ca3af' }}>🎯 Target: {target} min</span>
                <span style={{ fontSize: '14px', fontWeight: 600, color: '#ffffff' }}>{todayBest > 0 ? `${Math.round((todayBest / target) * 100)}%` : '0%'}</span>
              </div>
            </div>
            <div style={{ marginTop: '12px', marginBottom: '4px' }}>
              <span style={{ fontSize: '14px', color: '#9ca3af' }}>Today's best: <strong style={{ color: '#ffffff' }}>{todayBest} min</strong></span>
              <div style={{ fontSize: '11px', letterSpacing: '1.5px', textTransform: 'uppercase', color: '#6b7280', marginTop: '4px' }}>THIS WEEK</div>
            </div>
            <div style={{ height: '160px', width: '100%', marginTop: '8px' }}>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={rampData} barSize={28} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                  <CartesianGrid vertical={false} horizontal={false} />
                  <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis hide={true} />
                  <Tooltip contentStyle={{ background: '#1f2937', border: 'none', borderRadius: '6px', fontSize: '12px', color: '#fff' }} />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {rampData.map((e, i) => <Cell key={i} fill={e.done ? '#22c55e' : '#374151'} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p style={{ color: '#6b7280', fontSize: '13px', marginTop: '12px' }}>1 more success → target increases to {target + 5} min</p>
          </div>

          {/* Focus Debt */}
          <div style={{ ...CARD, display: 'flex', flexDirection: 'column' }}>
            <div style={{ color: '#ffffff', fontSize: '18px', fontWeight: 600, marginBottom: '6px' }}>Focus Debt</div>
            <p style={{ color: '#6b7280', fontSize: '13px', margin: '0 0 28px 0' }}>Carry-over cost from incomplete sessions</p>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: '4px' }}>
              <span style={{ fontSize: '72px', fontWeight: 800, color: debtMin > 0 ? '#f59e0b' : '#22c55e', lineHeight: 1 }}>{debtMin}</span>
              <span style={{ fontSize: '24px', fontWeight: 500, color: debtMin > 0 ? '#f59e0b' : '#22c55e', alignSelf: 'flex-end', marginBottom: '10px' }}>min</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', marginTop: '8px', marginBottom: '24px' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: debtMin > 0 ? '#f59e0b' : '#22c55e' }} />
              <span style={{ fontSize: '14px', color: debtMin > 0 ? '#f59e0b' : '#22c55e', fontWeight: 500 }}>{debtMin === 0 ? 'No Debt 🎉' : debtMin < 30 ? 'Low Debt' : 'Moderate Debt'}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                <span>🔷</span>
                <span style={{ color: '#9ca3af', fontSize: '13px' }}>Carry-over cost from interrupted sessions yesterday</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                <span>💡</span>
                <span style={{ color: '#22c55e', fontSize: '13px' }}>Complete today's meditation to reduce by 8 minutes</span>
              </div>
            </div>
          </div>
        </div>

        {/* ROW 2: Focus Matrix heatmap */}
        <div style={{ ...CARD, marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
            <div>
              <div style={{ color: '#ffffff', fontSize: '18px', fontWeight: 600 }}>Focus Matrix</div>
              <div style={{ color: '#6b7280', fontSize: '13px', marginTop: '4px' }}>Density map of stained concentration vs time</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '1px' }}>
              <span>LESS</span>
              {['#166534','#15803d','#16a34a','#22c55e'].map((c, i) => (
                <div key={i} style={{ width: '12px', height: '12px', borderRadius: '2px', background: c }} />
              ))}
              <span>MORE</span>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'flex-start', gap: '12px', marginTop: '20px', overflowX: 'auto' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', paddingTop: '24px' }}>
              {DAYS.map(d => <div key={d} style={{ height: '16px', fontSize: '11px', color: '#6b7280', display: 'flex', alignItems: 'center', width: '28px', flexShrink: 0 }}>{d}</div>)}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', paddingLeft: '4px' }}>
                {['12a','3a','6a','9a','6p','9p'].map(l => <span key={l} style={{ fontSize: '11px', color: '#6b7280' }}>{l}</span>)}
              </div>
              {matrix.map((row, di) => (
                <div key={di} style={{ display: 'flex', flexDirection: 'row', gap: '4px' }}>
                  {row.map((color, h) => <div key={h} style={{ width: '16px', height: '16px', borderRadius: '3px', background: color, flexShrink: 0 }} />)}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ROW 3: Today's Summary */}
        <div>
          <h3 style={{ color: '#ffffff', fontSize: '22px', fontWeight: 600, marginBottom: '16px' }}>Today's Summary</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
            {[
              {
                iconBg:'rgba(34,197,94,0.12)', iconBorder:'rgba(34,197,94,0.2)',
                icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
                val: deepWork > 0 ? `${deepWork}` : '0', label: 'DEEP WORK', labelSz: '11px',
              },
              {
                iconBg:'rgba(34,197,94,0.12)', iconBorder:'rgba(34,197,94,0.2)',
                icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>,
                val: `${habDone} / ${habTotal}`, label: 'HABITS', labelSz: '11px',
              },
              {
                iconBg:'rgba(236,72,153,0.12)', iconBorder:'rgba(236,72,153,0.2)',
                icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ec4899" strokeWidth="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>,
                val: pct, label: 'Focus Score', labelSz: '13px',
              },
            ].map((c, i) => (
              <div key={i} style={{ ...CARD, borderRadius: '14px', padding: '20px 24px', display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '16px' }}>
                <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: c.iconBg, border: `1px solid ${c.iconBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {c.icon}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: '32px', fontWeight: 700, color: '#ffffff', lineHeight: 1 }}>{loading ? '...' : c.val}</span>
                  <span style={{ fontSize: c.labelSz, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#6b7280', marginTop: '2px' }}>{c.label}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
