import { useState, useEffect } from 'react';
import { habitsApi } from '../api';

export default function DailyHabits() {
  const [breathingRunning, setBreathingRunning] = useState(false);
  const [breathSeconds, setBreathSeconds] = useState(5 * 60);
  const [habits, setHabits] = useState({ read_done: false, meditation_done: false, session_done: false, streak_count: 0 });
  const [loading, setLoading] = useState(true);

  const breathDisplay = `${Math.floor(breathSeconds / 60)}:${String(breathSeconds % 60).padStart(2,'0')}`;

  useEffect(() => {
    habitsApi.get().then(h => { setHabits(h); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  async function toggleHabit(key, apiKey) {
    const newVal = !habits[key];
    setHabits(h => ({ ...h, [key]: newVal }));
    try { await habitsApi.complete(apiKey); } catch (_) {}
    // Refresh to get updated streak
    try { const fresh = await habitsApi.get(); setHabits(fresh); } catch (_) {}
  }

  const readDone = habits.read_done;
  const meditationDone = habits.meditation_done;
  const sessionDone = habits.session_done;
  const streakCount = habits.streak_count || 0;
  const STREAK_COUNT = 30;
  const COMPLETE_UNTIL = Math.min(streakCount, STREAK_COUNT);

  return (
    <div style={{ width: '100%', background: '#000000', padding: '40px 48px', boxSizing: 'border-box', minHeight: 'calc(100vh - 60px)', overflowY: 'auto' }}>

      {/* HABIT CARDS ROW */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '40px' }}>

        {/* CARD 1 — 5-min Read */}
        <div style={{ background: '#111111', borderRadius: '16px', padding: '24px', border: '1px solid rgba(255,255,255,0.08)', minHeight: '220px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '12px' }}>
              <div style={{ width: '36px', height: '36px', background: '#1a1a2e', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', flexShrink: 0 }}>📖</div>
              <div>
                <div style={{ color: '#ffffff', fontSize: '18px', fontWeight: 600 }}>5-min Read</div>
                <div style={{ color: '#6b7280', fontSize: '14px', marginTop: '4px' }}>Read an article or book chapter</div>
              </div>
            </div>
          </div>
          <button
            onClick={() => toggleHabit('read_done', 'read')}
            style={{ background: readDone ? '#1a1a1a' : '#ffffff', color: readDone ? '#6b7280' : '#000000', borderRadius: '8px', padding: '12px', width: '100%', fontSize: '14px', fontWeight: 600, border: readDone ? '1px solid #374151' : 'none', cursor: 'pointer' }}
          >
            {readDone ? '✓ Completed' : 'Mark Complete'}
          </button>
        </div>

        {/* CARD 2 — Guided breathing */}
        <div style={{ background: '#111111', borderRadius: '16px', padding: '24px', border: '1px solid rgba(255,255,255,0.08)', minHeight: '220px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', width: '100%', marginBottom: '12px' }}>
            <div style={{ width: '36px', height: '36px', background: '#1a1a2e', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', flexShrink: 0 }}>🔔</div>
            <div style={{ color: '#ffffff', fontSize: '18px', fontWeight: 600 }}>Guided breathing exercise</div>
          </div>

          {/* Circular timer */}
          <div style={{ width: '120px', height: '120px', borderRadius: '50%', border: '3px solid #312e81', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '12px 0' }}>
            <span style={{ fontSize: '28px', fontWeight: 700, color: '#ffffff' }}>{breathDisplay}</span>
          </div>

          <button
            onClick={() => setBreathingRunning(r => !r)}
            style={{ background: '#ffffff', color: '#000000', borderRadius: '8px', padding: '12px', width: '100%', fontSize: '14px', fontWeight: 600, border: 'none', cursor: 'pointer' }}
          >
            {breathingRunning ? 'Pause' : 'Begin'}
          </button>
        </div>

        {/* CARD 3 — Session */}
        <div style={{ background: '#111111', borderRadius: '16px', padding: '24px', border: '1px solid rgba(255,255,255,0.08)', minHeight: '220px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '8px' }}>
            <div style={{ width: '36px', height: '36px', background: 'linear-gradient(135deg, #ec4899, #8b5cf6)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', flexShrink: 0 }}>🎯</div>
            <div>
              <div style={{ color: '#ffffff', fontSize: '18px', fontWeight: 600 }}>Session</div>
              <div style={{ color: '#6b7280', fontSize: '14px', marginTop: '4px' }}>30+ min with avg score ≥ 70</div>
            </div>
          </div>
          <div style={{ color: '#6b7280', fontSize: '13px', marginTop: '16px', flex: 1 }}>
            Auto-completes when you achieve a 30+ minute focus session with score ≥ 70
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'linear-gradient(135deg, #ec4899, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
            </div>
          </div>
        </div>
      </div>

      {/* HABIT STREAK SECTION */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <span style={{ color: '#ffffff', fontSize: '18px', fontWeight: 500 }}>Habit Streak (Last 30 Days)</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px', fontSize: '12px', color: '#6b7280', letterSpacing: '1px', textTransform: 'uppercase' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ width: '14px', height: '14px', borderRadius: '3px', border: '1px solid #374151', background: 'transparent' }}></div>
              INCOMPLETE
            </div>
            <span>|</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ width: '14px', height: '14px', borderRadius: '3px', background: '#6366f1' }}></div>
              <div style={{ width: '14px', height: '14px', borderRadius: '3px', background: '#6366f1' }}></div>
              COMPLETE
            </div>
          </div>
        </div>

        {/* 30 squares */}
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'nowrap' }}>
          {Array.from({ length: STREAK_COUNT }).map((_, i) => {
            const isComplete = i < COMPLETE_UNTIL;
            return (
              <div key={i} style={{
                width: '28px', height: '28px', borderRadius: '6px', flexShrink: 0,
                background: isComplete ? '#6366f1' : 'transparent',
                border: isComplete ? 'none' : '1px solid #374151'
              }} />
            );
          })}
        </div>
      </div>

    </div>
  );
}
