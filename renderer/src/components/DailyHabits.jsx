import { useState, useEffect } from 'react';
import { habitsApi, scraperApi, analyticsApi } from '../api';

const animations = `
@keyframes pop {
  0% { transform: scale(1); }
  50% { transform: scale(1.15); }
  100% { transform: scale(1); }
}
@keyframes glow {
  0% { box-shadow: 0 0 5px rgba(99, 102, 241, 0.2); }
  50% { box-shadow: 0 0 20px rgba(99, 102, 241, 0.6); }
  100% { box-shadow: 0 0 5px rgba(99, 102, 241, 0.2); }
}
@keyframes floatUp {
  0% { transform: translateY(0); opacity: 1; }
  100% { transform: translateY(-50px); opacity: 0; }
}
`;

export default function DailyHabits() {
  const [breathingRunning, setBreathingRunning] = useState(false);
  const [breathSeconds, setBreathSeconds] = useState(5 * 60);
  const [habits, setHabits] = useState({ read_done: false, meditation_done: false, session_done: false, streak_count: 0 });
  const [loading, setLoading] = useState(true);
  const [scrapedContent, setScrapedContent] = useState([]);
  const [fetchingScraper, setFetchingScraper] = useState(false);
  const [scraperTopic, setScraperTopic] = useState('Deep Learning');
  const [lastCompleted, setLastCompleted] = useState(null); // 'read', 'meditation', 'session'

  const breathDisplay = `${Math.floor(breathSeconds / 60)}:${String(breathSeconds % 60).padStart(2,'0')}`;

  useEffect(() => {
    habitsApi.get().then(h => { setHabits(h); setLoading(false); }).catch(() => setLoading(false));
    
    const initScraper = async () => {
      setFetchingScraper(true);
      try {
        // 1. Fetch top goal of the day
        const topGoalRes = await analyticsApi.topGoal();
        const topic = topGoalRes?.goal || 'Deep Learning';
        setScraperTopic(topic);

        // 2. Fetch scraped content for that goal
        const data = await scraperApi.fetchContent(topic);
        const articles = data.results || data.recommendations || (Array.isArray(data) ? data : []);
        setScrapedContent(articles.slice(0, 3));
        if (data.topic) setScraperTopic(data.topic);
      } catch (err) {
        console.error('Scraper init failed:', err);
      } finally {
        setFetchingScraper(false);
      }
    };

    initScraper();
  }, []);

  async function toggleHabit(key, apiKey) {
    const newVal = !habits[key];
    if (newVal) setLastCompleted(apiKey); // Trigger animation
    setHabits(h => ({ ...h, [key]: newVal }));
    try { await habitsApi.complete(apiKey); } catch (_) {}
    // Refresh to get updated streak
    try { const fresh = await habitsApi.get(); setHabits(fresh); } catch (_) {}
    
    // Reset animation state after a delay
    setTimeout(() => setLastCompleted(null), 1500);
  }

  const readDone = habits.read_done;
  const meditationDone = habits.meditation_done;
  const sessionDone = habits.session_done;
  const streakCount = habits.streak_count || 0;
  const STREAK_COUNT = 30;
  const COMPLETE_UNTIL = Math.min(streakCount, STREAK_COUNT);

  return (
    <div style={{ width: '100%', background: '#000000', padding: '40px 48px', boxSizing: 'border-box', minHeight: 'calc(100vh - 60px)', overflowY: 'auto', position: 'relative' }}>
      <style>{animations}</style>
      
      {/* FLOAT ANIMATION */}
      {lastCompleted && (
        <div style={{ 
          position: 'fixed', 
          top: '40%', 
          left: '50%', 
          transform: 'translateX(-50%)', 
          fontSize: '48px', 
          zIndex: 1000,
          animation: 'floatUp 1.5s ease-out forwards',
          pointerEvents: 'none'
        }}>
          🔥 +1 Streak!
        </div>
      )}

      {/* HABIT CARDS ROW */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '40px' }}>

        {/* CARD 1 — 5-min Read */}
        <div style={{ background: '#111111', borderRadius: '16px', padding: '24px', border: '1px solid rgba(255,255,255,0.08)', minHeight: '380px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ marginBottom: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '8px' }}>
              <div style={{ width: '36px', height: '36px', background: '#1a1a2e', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', flexShrink: 0 }}>📖</div>
              <div>
                <div style={{ color: '#ffffff', fontSize: '18px', fontWeight: 600 }}>5-min Read</div>
                <div style={{ color: '#6b7280', fontSize: '14px', marginTop: '2px' }}>Personalized: {scraperTopic}</div>
              </div>
            </div>
          </div>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto', marginBottom: '20px', paddingRight: '4px' }}>
            {fetchingScraper ? (
              <div style={{ color: '#4b5563', fontSize: '13px', fontStyle: 'italic', textAlign: 'center', marginTop: '20px' }}>
                Scraping latest articles...
              </div>
            ) : scrapedContent.length > 0 ? (
              scrapedContent.map((item, idx) => (
                <div 
                  key={idx} 
                  onClick={() => {
                    if (item.link) window.mindforge.openExternal(item.link);
                    if (!readDone) toggleHabit('read_done', 'read');
                  }}
                  style={{ 
                    background: 'rgba(255,255,255,0.03)', 
                    border: '1px solid rgba(255,255,255,0.05)', 
                    borderRadius: '10px', 
                    padding: '12px',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.borderColor = 'rgba(99,102,241,0.3)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.05)'; }}
                >
                  <div style={{ color: '#ffffff', fontSize: '14px', fontWeight: 600, marginBottom: '4px', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {item.title || 'Untitled Article'}
                  </div>
                  <div style={{ color: '#9ca3af', fontSize: '12px', lineHeight: '1.4', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {item.description || item.snippet || 'Click to read this insightful piece on modern technology and research.'}
                  </div>
                </div>
              ))
            ) : (
              <div style={{ color: '#4b5563', fontSize: '13px', textAlign: 'center', marginTop: '20px' }}>
                No fresh content found right now.
              </div>
            )}
          </div>

          <button
            onClick={() => toggleHabit('read_done', 'read')}
            style={{ 
              background: readDone ? '#1a1a1a' : 'linear-gradient(135deg, #6366f1, #4f46e5)', 
              color: readDone ? '#6b7280' : '#ffffff', 
              borderRadius: '8px', 
              padding: '12px', 
              width: '100%', 
              fontSize: '14px', 
              fontWeight: 600, 
              border: readDone ? '1px solid #374151' : 'none', 
              cursor: 'pointer',
              marginTop: 'auto'
            }}
          >
            {readDone ? '✓ Completed' : 'Mark Daily Read Done'}
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ color: '#ffffff', fontSize: '18px', fontWeight: 500 }}>Habit Streak (Last 30 Days)</span>
            {streakCount > 0 && (
              <span style={{ color: '#ff4500', fontSize: '20px', animation: 'pop 1s infinite' }}>🔥 {streakCount}</span>
            )}
          </div>
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
                border: isComplete ? 'none' : '1px solid #374151',
                animation: isComplete && i === COMPLETE_UNTIL - 1 ? 'glow 2s infinite ease-in-out' : 'none',
                transition: 'all 0.5s ease'
              }} />
            );
          })}
        </div>
      </div>

    </div>
  );
}
