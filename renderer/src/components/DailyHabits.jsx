import { useState, useEffect, useRef, useCallback } from 'react';

const API = 'http://localhost:39871';

/* ─── Contribution Grid ─── */
function ContributionGrid() {
  const days = 30;
  const cells = Array.from({ length: days }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (days - 1 - i));
    return { date: d.toISOString().slice(0, 10), day: d.getDay() };
  });

  // Simulated: in real app, fetch from API for each day
  return (
    <div className="flex flex-wrap gap-[3px]">
      {cells.map((cell) => (
        <div
          key={cell.date}
          className="w-3 h-3 rounded-sm transition-transform duration-200 hover:scale-125"
          style={{
            background: 'rgba(124, 92, 252, 0.15)',
          }}
          title={cell.date}
        />
      ))}
    </div>
  );
}

/* ─── Meditation Timer ─── */
function MeditationTimer({ onComplete }) {
  const [running, setRunning] = useState(false);
  const [seconds, setSeconds] = useState(300); // 5 minutes
  const intervalRef = useRef(null);

  const start = useCallback(() => {
    if (running) return;
    setRunning(true);
  }, [running]);

  useEffect(() => {
    if (running && seconds > 0) {
      intervalRef.current = setInterval(() => {
        setSeconds((s) => {
          if (s <= 1) {
            clearInterval(intervalRef.current);
            setRunning(false);
            onComplete();
            return 0;
          }
          return s - 1;
        });
      }, 1000);
    }
    return () => clearInterval(intervalRef.current);
  }, [running]);

  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const progress = ((300 - seconds) / 300) * 100;

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative w-24 h-24">
        {/* Background circle */}
        <svg className="w-24 h-24 -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(124,92,252,0.1)" strokeWidth="6" />
          <circle
            cx="50" cy="50" r="42"
            fill="none"
            stroke="var(--accent-purple)"
            strokeWidth="6"
            strokeDasharray={`${progress * 2.64} 264`}
            strokeLinecap="round"
            className="transition-all duration-1000"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-lg font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>
            {mins}:{secs.toString().padStart(2, '0')}
          </span>
        </div>
      </div>
      {!running && seconds === 300 && (
        <button
          onClick={start}
          className="btn-primary w-full py-2.5 mt-2 text-xs"
        >
          Begin
        </button>
      )}
      {running && (
        <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
          Breathe deeply...
        </span>
      )}
      {seconds === 0 && (
        <span className="text-xs font-semibold" style={{ color: 'var(--score-green)' }}>
          ✓ Complete!
        </span>
      )}
    </div>
  );
}

/* ─── Habit Card ─── */
function HabitCard({ icon, title, description, done, onComplete, children }) {
  return (
    <div
      className="premium-card p-6 flex flex-col transition-all duration-300"
      style={{
        borderColor: done ? 'var(--score-green)' : 'var(--border)',
      }}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{icon}</span>
          <div>
            <h4 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              {title}
            </h4>
            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              {description}
            </p>
          </div>
        </div>
        {done && (
          <div
            className="w-6 h-6 rounded-full flex items-center justify-center"
            style={{ background: 'var(--score-green)' }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
        )}
      </div>
      <div className="flex-1 flex items-center justify-center py-2">
        {children || (
          !done && onComplete && (
            <button
              onClick={onComplete}
              className="btn-primary w-full py-2.5 text-xs font-semibold"
            >
              Mark Complete
            </button>
          )
        )}
      </div>
    </div>
  );
}

/* ─── Main Component ─── */
export default function DailyHabits() {
  const [habits, setHabits] = useState({
    read_done: false,
    meditation_done: false,
    session_done: false,
    streak_count: 0,
  });
  const [loading, setLoading] = useState(true);

  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    fetch(`${API}/habits?date=${today}`)
      .then((r) => r.json())
      .then((d) => {
        setHabits(d);
        setLoading(false);
      })
      .catch((err) => {
        console.error('[DailyHabits] Fetch error:', err);
        setLoading(false);
      });
  }, []);

  async function markHabit(habit) {
    try {
      await fetch(`${API}/habit-complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ habit }),
      });
      setHabits((prev) => ({
        ...prev,
        [`${habit}_done`]: true,
      }));
    } catch (err) {
      console.error('[DailyHabits] Error marking habit:', err);
    }
  }

  const completedCount = [habits.read_done, habits.meditation_done, habits.session_done].filter(Boolean).length;

  return (
    <div className="h-full overflow-y-auto pr-2 pb-6" style={{ scrollbarGutter: 'stable' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
            Daily Habits
          </h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
            Build your focus foundation — {today}
          </p>
        </div>

          <div className="flex items-center gap-2">
            <div className="px-4 py-1.5 rounded-lg flex items-center bg-zinc-800 border border-zinc-700">
              <span className="text-sm mr-2">🔥</span>
              <span className="text-sm font-bold text-amber-500 tabular-nums">
                {habits.streak_count}
              </span>
              <span className="ml-1 text-[10px] font-medium text-zinc-400 uppercase tracking-widest">
                Streak
              </span>
            </div>
            <div className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${completedCount === 3 ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-zinc-800 text-zinc-400 border-zinc-700'}`}>
              {completedCount}/3 Done
            </div>
          </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <span className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Loading habits...</span>
        </div>
      ) : (
        <>
          {/* Habit cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <HabitCard
              icon="📖"
              title="5-min Read"
              description="Read an article or book chapter"
              done={habits.read_done}
              onComplete={() => markHabit('read')}
            />
            <HabitCard
              icon="🧘"
              title="5-min Meditation"
              description="Guided breathing exercise"
              done={habits.meditation_done}
            >
              {!habits.meditation_done && (
                <MeditationTimer onComplete={() => markHabit('meditation')} />
              )}
            </HabitCard>
            <HabitCard
              icon="🎯"
              title="Focus Session"
              description="30+ min with avg score ≥ 70"
              done={habits.session_done}
            >
              {!habits.session_done && (
                <div className="text-center">
                  <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    Auto-completes when you achieve a 30+ minute focus session with score ≥ 70
                  </p>
                </div>
              )}
            </HabitCard>
          </div>

          {/* Contribution grid */}
          <div className="glass-card p-5">
            <h4 className="text-xs font-semibold uppercase tracking-wider mb-3"
              style={{ color: 'var(--text-tertiary)' }}>
              Last 30 Days
            </h4>
            <ContributionGrid />
          </div>
        </>
      )}
    </div>
  );
}
