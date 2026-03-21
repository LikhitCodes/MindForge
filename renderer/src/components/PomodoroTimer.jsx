import { useState, useEffect, useRef } from 'react';

export default function PomodoroTimer() {
  const [seconds, setSeconds] = useState(25 * 60);
  const [running, setRunning] = useState(false);
  const [goal, setGoal] = useState('');
  const timerRef = useRef(null);

  useEffect(() => {
    if (running) {
      timerRef.current = setInterval(() => setSeconds(s => s > 0 ? s - 1 : 0), 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [running]);

  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const display = `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

  return (
    <div style={{ width: '100%', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#000000', minHeight: 'calc(100vh - 60px)' }}>

      {/* Timer Circle */}
      <div style={{ width: '320px', height: '320px', borderRadius: '50%', border: '2px solid rgba(255,255,255,0.15)', background: 'transparent', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', marginBottom: '48px' }}>
        <span style={{ fontSize: '13px', letterSpacing: '2px', textTransform: 'uppercase', color: '#9ca3af', marginBottom: '8px' }}>READY</span>
        <span style={{ fontSize: '72px', fontWeight: 800, color: '#ffffff', letterSpacing: '-2px', lineHeight: 1 }}>{display}</span>
      </div>

      {/* Below Circle */}
      <div style={{ width: '360px', display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center' }}>
        <label style={{ fontSize: '11px', letterSpacing: '2px', textTransform: 'uppercase', color: '#6b7280', alignSelf: 'flex-start', marginBottom: '4px' }}>SESSION GOAL</label>
        <input
          type="text"
          value={goal}
          onChange={e => setGoal(e.target.value)}
          placeholder="What will you focus on?"
          style={{ width: '100%', height: '44px', background: '#1a1a1a', border: '1px solid #374151', borderRadius: '8px', padding: '0 16px', color: '#ffffff', fontSize: '15px', outline: 'none', boxSizing: 'border-box' }}
          onFocus={e => e.target.style.borderColor = '#6366f1'}
          onBlur={e => e.target.style.borderColor = '#374151'}
        />
        <button
          onClick={() => setRunning(r => !r)}
          style={{ width: '100%', height: '48px', background: '#ffffff', color: '#000000', borderRadius: '8px', border: 'none', fontSize: '16px', fontWeight: 600, cursor: 'pointer' }}
        >
          {running ? 'Pause' : 'Start Pomodoro'}
        </button>
      </div>
    </div>
  );
}
