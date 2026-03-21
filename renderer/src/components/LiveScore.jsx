import { useState, useEffect, useRef } from 'react';

const API = 'http://localhost:39871';
const WS_URL = 'ws://localhost:39871';

export default function LiveScore() {
  const [score, setScore] = useState(null);
  const [prevScore, setPrevScore] = useState(null);
  const [label, setLabel] = useState('No session');
  const [connected, setConnected] = useState(false);
  const [sessionActive, setSessionActive] = useState(false);
  
  // Session config state
  const [sessionGoal, setSessionGoal] = useState('');
  const [sessionMode, setSessionMode] = useState('basic');
  const [allowedApps, setAllowedApps] = useState(['chrome', 'code', 'cursor']); 
  const [newAppInput, setNewAppInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');

  const [sessionInfo, setSessionInfo] = useState(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [showConfig, setShowConfig] = useState(false);
  
  const wsRef = useRef(null);
  const reconnectRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    function connect() {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => setConnected(true);

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'score') {
            setPrevScore(score);
            setScore(data.score);
            setLabel(data.label || getLabel(data.score));
          }
          if (data.type === 'session_status') {
            setSessionActive(data.active);
            if (data.active) setSessionInfo(data);
          }
          if (data.type === 'session_started') {
            setSessionActive(true);
            setSessionInfo(data);
            setScore(null);
            setLabel('Starting...');
          }
          if (data.type === 'session_ended') {
            setSessionActive(false);
            setSessionInfo(null);
            setScore(null);
            setLabel('Session ended');
            setElapsedTime(0);
          }
        } catch (e) {
          console.error('[LiveScore] Parse error:', e);
        }
      };

      ws.onclose = () => {
        setConnected(false);
        reconnectRef.current = setTimeout(connect, 3000);
      };
      ws.onerror = () => ws.close();
    }
    connect();
    return () => {
      if (wsRef.current) wsRef.current.close();
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
    };
  }, []);

  useEffect(() => {
    if (sessionActive && sessionInfo?.startTime) {
      timerRef.current = setInterval(() => {
        setElapsedTime(Math.floor((Date.now() - sessionInfo.startTime) / 1000));
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      setElapsedTime(0);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [sessionActive, sessionInfo]);

  async function handleAddAllowedApp() {
    if (!newAppInput.trim()) return;
    setAiLoading(true);
    setAiError('');

    try {
      const res = await fetch(`${API}/ai-validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appName: newAppInput.trim() })
      });
      const data = await res.json();
      
      if (data.isProductive) {
        if (!allowedApps.includes(newAppInput.toLowerCase())) {
          setAllowedApps([...allowedApps, newAppInput.toLowerCase()]);
        }
        setNewAppInput('');
      } else {
        setAiError(`AI Rejected: ${data.reason}`);
      }
    } catch (err) {
      setAiError('Failed to validate app');
    } finally {
      setAiLoading(false);
    }
  }

  function removeApp(app) {
    setAllowedApps(allowedApps.filter(a => a !== app));
  }

  async function handleStartSession() {
    const goal = sessionGoal.trim() || 'Focus Session';
    try {
      const res = await fetch(`${API}/session/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal, mode: sessionMode, allowedApps }),
      });
      const data = await res.json();
      if (data.ok) {
        setSessionActive(true);
        setSessionInfo(data.session);
        setShowConfig(false);
        setSessionGoal('');
      }
    } catch (err) {
      console.error('[LiveScore] Start session error:', err);
    }
  }

  async function handleEndSession() {
    try {
      const res = await fetch(`${API}/session/end`, { method: 'POST' });
      const data = await res.json();
      if (data.ok) {
        setSessionActive(false);
        setSessionInfo(null);
        setScore(null);
      }
    } catch (err) {
      console.error('[LiveScore] End session error:', err);
    }
  }

  function getLabel(s) {
    if (s >= 70) return 'Deep work';
    if (s >= 50) return 'Moderate';
    return 'Distracted';
  }

  function getColor(s) {
    if (s === null) return 'var(--text-secondary)';
    if (s >= 70) return 'var(--score-green)';
    if (s >= 50) return 'var(--score-amber)';
    return 'var(--score-red)';
  }

  function formatTime(totalSec) {
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  const trend = score !== null && prevScore !== null ? score - prevScore : 0;
  const color = getColor(score);

  return (
    <div className="premium-card p-8 h-full flex flex-col items-center justify-center relative">
      <div className="absolute top-4 right-5 flex items-center gap-2">
        <div className="w-1.5 h-1.5 rounded-full" style={{ background: connected ? 'var(--score-green)' : 'var(--score-red)' }} />
        <span className="text-[10px] font-medium" style={{ color: 'var(--text-tertiary)' }}>{connected ? 'Syncing' : 'Offline'}</span>
      </div>

      {/* ═══ NO SESSION — Config & Start ═══ */}
      {!sessionActive && (
        <div className="flex flex-col items-center gap-5 animate-fade-in w-full max-w-sm">
          {!showConfig ? (
            <>
              <div className="text-center mb-2">
                <h2 className="text-xl font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Start Focusing</h2>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Configure your session to begin tracking.</p>
              </div>
              <button
                onClick={() => setShowConfig(true)}
                className="btn-primary w-full py-2.5 text-sm"
              >
                Configure Session
              </button>
            </>
          ) : (
            <div className="w-full flex flex-col gap-5 text-left animate-fade-in">
              <h3 className="text-lg font-semibold border-b pb-2" style={{ color: 'var(--text-primary)', borderColor: 'var(--border)' }}>
                Session Setup
              </h3>
              
              <div>
                <label className="text-xs font-semibold mb-1.5 block uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>Goal</label>
                <input
                  type="text" value={sessionGoal} onChange={(e) => setSessionGoal(e.target.value)}
                  placeholder="What are you working on?"
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none transition-colors"
                  style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                  onFocus={(e) => e.target.style.borderColor = 'var(--text-secondary)'}
                  onBlur={(e) => e.target.style.borderColor = 'var(--border)'}
                />
              </div>

              <div>
                <label className="text-xs font-semibold mb-1.5 block uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>Enforcement Mode</label>
                <div className="flex gap-2">
                  <button 
                    onClick={() => setSessionMode('basic')} 
                    className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${sessionMode === 'basic' ? 'bg-white text-black' : 'bg-zinc-800 text-zinc-400 border border-zinc-700 hover:text-white'}`}
                  >
                    Basic (Warn)
                  </button>
                  <button 
                    onClick={() => setSessionMode('exam')} 
                    className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${sessionMode === 'exam' ? 'bg-red-500 text-white' : 'bg-zinc-800 text-zinc-400 border border-zinc-700 hover:text-red-400'}`}
                  >
                    Exam (Kill)
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold mb-1.5 block uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>Allowed Applications</label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {allowedApps.map(app => (
                    <span key={app} className="text-[11px] font-medium px-2 py-1 rounded bg-zinc-800 text-zinc-300 border border-zinc-700 flex items-center gap-1.5">
                      {app} <button onClick={() => removeApp(app)} className="text-zinc-500 hover:text-white transition-colors">×</button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2 mt-2">
                  <input
                    type="text" value={newAppInput} onChange={(e) => setNewAppInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddAllowedApp()}
                    placeholder="e.g. figma"
                    className="flex-1 px-3 py-1.5 rounded-lg text-xs outline-none"
                    style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                  />
                  <button onClick={handleAddAllowedApp} disabled={aiLoading} className="btn-secondary px-3 py-1.5 text-xs">
                    {aiLoading ? '...' : 'Add'}
                  </button>
                </div>
                {aiError && <span className="text-[11px] text-red-500 font-medium mt-1 block">{aiError}</span>}
              </div>

              <div className="flex gap-3 mt-2">
                 <button onClick={() => setShowConfig(false)} className="btn-secondary flex-1 py-2.5 text-sm">Cancel</button>
                 <button onClick={handleStartSession} className="btn-primary flex-1 py-2.5 text-sm">Start</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ ACTIVE SESSION — Show live score ═══ */}
      {sessionActive && (
        <div className="flex flex-col items-center w-full animate-fade-in relative">
          <div className="flex items-center justify-between w-full mb-8">
            <div className="flex items-center gap-2">
               <div className="w-2 h-2 rounded-full animate-pulse bg-red-500" />
               <span className="text-sm font-mono font-medium" style={{ color: 'var(--text-secondary)' }}>
                 {formatTime(elapsedTime)}
               </span>
            </div>
            
            <div className="flex items-center gap-2">
              {sessionInfo?.mode === 'exam' && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-500/10 text-red-500 uppercase tracking-wider border border-red-500/20">
                  Exam Mode
                </span>
              )}
              {sessionInfo?.goal && (
                <span className="text-[11px] font-medium px-2 py-0.5 rounded" style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}>
                  {sessionInfo.goal}
                </span>
              )}
            </div>
          </div>

          <div className="relative flex flex-col items-center justify-center w-48 h-48 mb-6">
            <svg className="absolute w-full h-full -rotate-90" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="46" fill="none" stroke="var(--bg-secondary)" strokeWidth="2" />
              <circle cx="50" cy="50" r="46" fill="none" stroke={color} strokeWidth="3" 
                strokeDasharray={`${(score || 0) * 2.89} 289`} strokeLinecap="round" 
                className="transition-all duration-1000 ease-out" 
              />
            </svg>
            
            <div className="flex flex-col items-center relative z-10">
              <span className="text-[10px] font-bold tracking-widest uppercase mb-1" style={{ color: 'var(--text-tertiary)' }}>Score</span>
              <span className="text-6xl font-black tabular-nums tracking-tighter transition-colors duration-500" style={{ color, lineHeight: 1 }}>
                {score !== null ? score : '--'}
              </span>
              <div className="flex items-center gap-1.5 mt-2">
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: 'var(--bg-secondary)', color }}>
                  {score !== null ? label : 'Analyzing...'}
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={handleEndSession}
            className="btn-secondary w-full max-w-[200px] py-2.5 text-sm hover:text-red-400 hover:border-red-900/50"
          >
            End Session
          </button>
        </div>
      )}
    </div>
  );
}
