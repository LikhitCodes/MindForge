import { useState, useEffect, useRef, useCallback } from 'react';

const API = 'http://localhost:39871';
const WS_URL = 'ws://localhost:39871';

const WORK_DURATION = 25 * 60; // 25 minutes in seconds

function getSmartBreakDuration(score) {
  if (score >= 80) return 7 * 60;  // 🏆 Reward: 7 min
  if (score >= 60) return 5 * 60;  // ✅ Standard: 5 min
  return 3 * 60;                    // ⚡ Short refocus: 3 min
}

function formatTime(totalSec) {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export default function PomodoroTimer() {
  const [phase, setPhase] = useState('idle');       // idle | work | break
  const [timeLeft, setTimeLeft] = useState(WORK_DURATION);
  const [totalTime, setTotalTime] = useState(WORK_DURATION);
  const [cycleCount, setCycleCount] = useState(0);
  const [liveScore, setLiveScore] = useState(null);
  const [sessionGoal, setSessionGoal] = useState('');
  const [breakDuration, setBreakDuration] = useState(5 * 60);

  const wsRef = useRef(null);
  const timerRef = useRef(null);

  // WebSocket for live score
  useEffect(() => {
    function connect() {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'score') {
            setLiveScore(data.score);
          }
        } catch (e) { /* ignore */ }
      };
      ws.onclose = () => setTimeout(connect, 3000);
      ws.onerror = () => ws.close();
    }
    connect();
    return () => { if (wsRef.current) wsRef.current.close(); };
  }, []);

  // Countdown timer
  useEffect(() => {
    if (phase === 'idle') return;

    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          handlePhaseEnd();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timerRef.current);
  }, [phase, liveScore]);

  const handlePhaseEnd = useCallback(() => {
    if (phase === 'work') {
      // End the backend session
      fetch(`${API}/session/end`, { method: 'POST' }).catch(() => {});

      // Calculate smart break
      const smartBreak = getSmartBreakDuration(liveScore || 50);
      setBreakDuration(smartBreak);
      setPhase('break');
      setTimeLeft(smartBreak);
      setTotalTime(smartBreak);
      setCycleCount((c) => c + 1);

      // Play notification sound
      try { new Audio('data:audio/wav;base64,UklGRl9vT19telegramAFmt').play(); } catch {}
    } else if (phase === 'break') {
      // Break over → start new work phase automatically
      startWorkPhase();
    }
  }, [phase, liveScore]);

  async function startWorkPhase() {
    // Start a backend session
    try {
      await fetch(`${API}/session/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goal: sessionGoal || 'Pomodoro Focus',
          mode: 'basic',
          allowedApps: ['chrome', 'code', 'cursor'],
        }),
      });
    } catch (err) {
      console.error('[Pomodoro] Failed to start session:', err);
    }

    setPhase('work');
    setTimeLeft(WORK_DURATION);
    setTotalTime(WORK_DURATION);
    setLiveScore(null);
  }

  function handleStart() {
    startWorkPhase();
  }

  function handleStop() {
    clearInterval(timerRef.current);
    fetch(`${API}/session/end`, { method: 'POST' }).catch(() => {});
    setPhase('idle');
    setTimeLeft(WORK_DURATION);
    setTotalTime(WORK_DURATION);
    setLiveScore(null);
  }

  // Progress ring calculation
  const progress = totalTime > 0 ? ((totalTime - timeLeft) / totalTime) : 0;
  const circumference = 2 * Math.PI * 46;
  const strokeOffset = circumference - progress * circumference;

  const phaseColor = phase === 'work' ? 'var(--score-green)' : phase === 'break' ? 'var(--score-amber)' : 'var(--text-secondary)';
  const phaseLabel = phase === 'work' ? 'FOCUS' : phase === 'break' ? 'BREAK' : 'READY';

  const breakLabel = breakDuration >= 7 * 60 ? '🏆 Earned 7min break!' : breakDuration >= 5 * 60 ? '✅ Standard 5min break' : '⚡ Quick 3min refocus';

  return (
    <div className="h-full flex flex-col items-center justify-center overflow-y-auto pb-6">
      <div className="max-w-md w-full flex flex-col items-center gap-8">
        {/* Header */}
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
            Pomodoro Timer
          </h2>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Smart breaks powered by your focus score
          </p>
        </div>

        {/* Timer Ring */}
        <div className="relative flex items-center justify-center w-64 h-64">
          <svg className="absolute w-full h-full -rotate-90" viewBox="0 0 100 100">
            {/* Background ring */}
            <circle cx="50" cy="50" r="46" fill="none" stroke="var(--bg-secondary)" strokeWidth="2" />
            {/* Progress ring */}
            <circle
              cx="50" cy="50" r="46" fill="none"
              stroke={phaseColor}
              strokeWidth="3"
              strokeDasharray={circumference}
              strokeDashoffset={strokeOffset}
              strokeLinecap="round"
              className="transition-all duration-1000 ease-linear"
            />
          </svg>

          <div className="flex flex-col items-center relative z-10">
            <span
              className="text-[10px] font-bold tracking-[0.2em] uppercase mb-2"
              style={{ color: phaseColor }}
            >
              {phaseLabel}
            </span>
            <span
              className="text-6xl font-black tabular-nums tracking-tighter transition-colors duration-500"
              style={{ color: 'var(--text-primary)', lineHeight: 1 }}
            >
              {formatTime(timeLeft)}
            </span>
            {phase !== 'idle' && (
              <span className="text-xs font-medium mt-3" style={{ color: 'var(--text-tertiary)' }}>
                Cycle {cycleCount + (phase === 'work' ? 1 : 0)}
              </span>
            )}
          </div>
        </div>

        {/* Live Score Badge (during work phase) */}
        {phase === 'work' && liveScore !== null && (
          <div className="premium-card px-4 py-2 flex items-center gap-3 animate-fade-in">
            <span className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>Live Score</span>
            <span
              className="text-lg font-bold tabular-nums"
              style={{
                color: liveScore >= 70 ? 'var(--score-green)' : liveScore >= 50 ? 'var(--score-amber)' : 'var(--score-red)',
              }}
            >
              {liveScore}
            </span>
          </div>
        )}

        {/* Break info (during break phase) */}
        {phase === 'break' && (
          <div className="premium-card px-4 py-3 text-center animate-fade-in">
            <p className="text-sm font-medium" style={{ color: 'var(--score-amber)' }}>
              {breakLabel}
            </p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
              Based on your focus score of {liveScore ?? '—'}
            </p>
          </div>
        )}

        {/* Controls */}
        {phase === 'idle' ? (
          <div className="w-full max-w-xs space-y-4">
            <div>
              <label className="text-xs font-semibold mb-1.5 block uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>
                Session Goal
              </label>
              <input
                type="text"
                value={sessionGoal}
                onChange={(e) => setSessionGoal(e.target.value)}
                placeholder="What will you focus on?"
                className="w-full px-4 py-3 rounded-lg text-sm outline-none transition-colors border focus:border-white"
                style={{
                  background: 'var(--bg-secondary)',
                  borderColor: 'var(--border)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>
            <button onClick={handleStart} className="btn-primary w-full py-3 text-sm">
              Start Pomodoro
            </button>
          </div>
        ) : (
          <button onClick={handleStop} className="btn-secondary px-8 py-2.5 text-sm hover:text-red-400 hover:border-red-900/50">
            Stop Timer
          </button>
        )}

        {/* Cycle history */}
        {cycleCount > 0 && (
          <div className="flex items-center gap-2 mt-2">
            {Array.from({ length: Math.min(cycleCount, 8) }).map((_, i) => (
              <div
                key={i}
                className="w-3 h-3 rounded-full"
                style={{ background: i < 4 ? 'var(--score-green)' : 'var(--score-amber)' }}
              />
            ))}
            <span className="text-xs font-medium ml-1" style={{ color: 'var(--text-tertiary)' }}>
              {cycleCount} cycle{cycleCount !== 1 ? 's' : ''} done
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
