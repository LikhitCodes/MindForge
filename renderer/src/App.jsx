import { Routes, Route, NavLink, useLocation } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from './AuthContext';
import LiveScore from './components/LiveScore';
import Heatmap from './components/Heatmap';
import DeepWorkRamp from './components/DeepWorkRamp';
import FocusDebt from './components/FocusDebt';
import Dashboard from './components/Dashboard';
import AnalyticsDashboard from './components/Analytics';
import PomodoroTimer from './components/PomodoroTimer';
import DailyHabits from './components/DailyHabits';
import FocusRoom from './components/FocusRoom';
import Session from './components/Session';
import DistractionShield from './components/DistractionShield';
import AmbientPlayer from './components/AmbientPlayer';
import AuthPage from './components/AuthPage';

const MAIN_NAV = [
  { label: 'Dashboard', path: '/' },
  { label: 'Session', path: '/session' },
  { label: 'Pomodoro', path: '/pomodoro' },
  { label: 'Habits', path: '/habits' },
  { label: 'Analytics', path: '/analytics' },
  { label: 'Focus Room', path: '/room' },
];

export default function App() {
  const location = useLocation();
  const isHabits = location.pathname === '/habits';

  return (
    <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column', background: '#000000', overflow: 'hidden', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>

      {/* NAVBAR */}
      <nav style={{ height: '60px', background: '#000000', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 40px', flexShrink: 0 }}>

        {/* Left: Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="2" y1="12" x2="22" y2="12" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </svg>
          <span style={{ color: '#ffffff', fontSize: '18px', fontWeight: 600 }}>MindForge</span>
        </div>

        {/* Right: Nav links */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '40px' }}>
          {MAIN_NAV.map(item => {
            const isActive = item.path === '/'
              ? location.pathname === '/' || location.pathname === '/session'
              : location.pathname === item.path;
            return (
              <NavLink key={item.path} to={item.path} style={{ color: isActive ? '#ffffff' : '#6b7280', fontWeight: isActive ? 600 : 400, fontSize: '15px', textDecoration: 'none' }}>
                {item.label}
              </NavLink>
            );
          })}

          {/* Streak badge (only on habits) */}
          {isHabits && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(249,115,22,0.15)', border: '1px solid rgba(249,115,22,0.3)', borderRadius: '20px', padding: '6px 14px', fontSize: '13px', color: '#f97316' }}>
              🔥 <span style={{ letterSpacing: '1px', fontWeight: 600 }}>STREAK</span>
              <span>1/3 Do</span>
            </div>
          )}
        </div>
      </nav>

      {/* Page Content */}
      <div style={{ flex: 1, display: 'flex', width: '100%', position: 'relative', overflowY: 'auto', overflowX: 'hidden' }}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/session" element={<Session />} />
          <Route path="/pomodoro" element={<PomodoroTimer />} />
          <Route path="/habits" element={<DailyHabits />} />
          <Route path="/analytics" element={<AnalyticsDashboard />} />
          <Route path="/room" element={<FocusRoom />} />
        </Routes>
      </div>

      {/* Bottom-left Ambient Sounds */}
      <div style={{ position: 'fixed', bottom: '20px', left: '20px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#6b7280', zIndex: 50, cursor: 'pointer' }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" /></svg>
        <span>Ambient Sounds</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9" /></svg>
      </div>

      <DistractionShield />
    </div>
  );
}
