import { Routes, Route, NavLink, useLocation } from 'react-router-dom';
import { useState } from 'react';
import LiveScore from './components/LiveScore';
import Heatmap from './components/Heatmap';
import DeepWorkRamp from './components/DeepWorkRamp';
import FocusDebt from './components/FocusDebt';
import DailyHabits from './components/DailyHabits';
import FocusRoom from './components/FocusRoom';
import PomodoroTimer from './components/PomodoroTimer';
import Analytics from './components/Analytics';
import DailySummary from './components/DailySummary';
import DistractionShield from './components/DistractionShield';
import AmbientPlayer from './components/AmbientPlayer';

/* ─── Icon SVGs ─── */
const DashboardIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
  </svg>
);
const HabitsIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
  </svg>
);
const RoomIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);
const TimerIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
  </svg>
);
const AnalyticsIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
  </svg>
);

const navItems = [
  { path: '/', label: 'Dashboard', icon: <DashboardIcon /> },
  { path: '/pomodoro', label: 'Pomodoro', icon: <TimerIcon /> },
  { path: '/habits', label: 'Habits', icon: <HabitsIcon /> },
  { path: '/analytics', label: 'Analytics', icon: <AnalyticsIcon /> },
  { path: '/room', label: 'Focus Room', icon: <RoomIcon /> },
];

/* ─── Dashboard Page ─── */
function Dashboard() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full overflow-y-auto pr-2 pb-6"
      style={{ scrollbarGutter: 'stable' }}>
      {/* Top row: Live Score + Daily Summary */}
      <div className="lg:col-span-1">
        <LiveScore />
      </div>
      <div className="lg:col-span-2">
        <DeepWorkRamp />
      </div>

      {/* Middle row: Heatmap + Focus Debt */}
      <div className="lg:col-span-2">
        <Heatmap />
      </div>
      <div className="lg:col-span-1">
        <FocusDebt />
      </div>

      {/* Bottom row: Daily Summary */}
      <div className="lg:col-span-3">
        <DailySummary />
      </div>
    </div>
  );
}

/* ─── Main App ─── */
export default function App() {
  const location = useLocation();
  const [interventionMsg, setInterventionMsg] = useState(null);

  return (
    <div className="flex h-screen w-screen overflow-hidden" style={{ background: 'var(--bg-base)' }}>
      {/* ─── Sidebar ─── */}
      <aside className="w-[240px] flex-shrink-0 flex flex-col border-r"
        style={{
          background: 'var(--bg-card)',
          borderColor: 'var(--border)',
        }}>
        {/* Logo / titlebar drag */}
        <div className="titlebar-drag px-6 pt-8 pb-4">
          <div className="titlebar-no-drag flex items-center justify-between pb-2">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-white">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
                </svg>
              </div>
              <div>
                <span className="text-sm font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>
                  MindForge
                </span>
                <span className="block text-[10px] font-medium text-zinc-500 uppercase tracking-widest">
                  Focus Engine
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Nav items */}
        <nav className="flex-1 px-4 space-y-1">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors duration-150 group ${isActive ? 'bg-zinc-800 text-white font-medium' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'}`}
              >
                <span className="transition-transform duration-200 group-hover:scale-105">
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        {/* Ambient Player */}
        <AmbientPlayer />

        {/* Bottom: version info */}
        <div className="px-6 py-4 border-t" style={{ borderColor: 'var(--border)' }}>
          <p className="text-[11px] font-medium" style={{ color: 'var(--text-tertiary)' }}>
            v1.0.0
          </p>
        </div>
      </aside>

      {/* ─── Main Content ─── */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Titlebar drag region */}
        <div className="titlebar-drag h-10 flex-shrink-0" />

        {/* Intervention banner */}
        {interventionMsg && (
          <div className="mx-8 mb-4 px-4 py-3 rounded-lg flex items-center justify-between animate-slide-up bg-amber-500/10 border border-amber-500/20">
            <span className="text-sm font-medium text-amber-500">{interventionMsg}</span>
            <button
              onClick={() => setInterventionMsg(null)}
              className="text-xs px-3 py-1.5 rounded-md transition-colors bg-amber-500/10 text-amber-500 hover:bg-amber-500/20"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Page content */}
        <div className="flex-1 overflow-hidden px-8">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/pomodoro" element={<PomodoroTimer />} />
            <Route path="/habits" element={<DailyHabits />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/room" element={<FocusRoom />} />
          </Routes>
        </div>
      </main>

      {/* Distraction Shield Overlay */}
      <DistractionShield />
    </div>
  );
}
