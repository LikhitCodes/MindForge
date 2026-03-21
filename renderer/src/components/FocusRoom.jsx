import { useState, useEffect, useRef } from 'react';

const ROOM_SERVER = import.meta.env.VITE_ROOM_SERVER || 'https://mindforge-rooms.onrender.com';

function generateCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function getStatusFromScore(score) {
  if (score >= 70) return { label: 'Studying', color: 'var(--score-green)', emoji: '📚' };
  if (score >= 50) return { label: 'Break', color: 'var(--score-amber)', emoji: '☕' };
  return { label: 'Distracted', color: 'var(--score-red)', emoji: '😵' };
}

/* ─── Member Card ─── */
function MemberCard({ member, onReact }) {
  const status = getStatusFromScore(member.score);
  const [showReaction, setShowReaction] = useState(null);

  function handleReact(emoji) {
    onReact(member.id, emoji);
    setShowReaction(emoji);
    setTimeout(() => setShowReaction(null), 1500);
  }

  return (
    <div className="premium-card p-4 relative overflow-hidden transition-all duration-200 hover:scale-[1.01]">
      {/* Reaction animation */}
      {showReaction && (
        <div className="absolute inset-0 flex items-center justify-center text-4xl animate-score-enter pointer-events-none z-10">
          {showReaction}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Avatar */}
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold bg-zinc-800 text-zinc-300 border border-zinc-700"
          >
            {member.name?.[0]?.toUpperCase() || '?'}
          </div>
          <div>
            <span className="text-sm font-semibold block" style={{ color: 'var(--text-primary)' }}>
              {member.name}
            </span>
            <span className="text-xs flex items-center gap-1 font-medium mt-0.5" style={{ color: status.color }}>
              {status.emoji} {status.label}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Score */}
          <span className="text-xl font-bold tabular-nums" style={{ color: status.color }}>
            {member.score}
          </span>
          {/* Reaction buttons */}
          <div className="flex gap-1.5">
            <button
              onClick={() => handleReact('👍')}
              className="w-8 h-8 rounded-md flex items-center justify-center transition-colors hover:bg-zinc-800 border border-transparent hover:border-zinc-700"
            >
              👍
            </button>
            <button
              onClick={() => handleReact('🔥')}
              className="w-8 h-8 rounded-md flex items-center justify-center transition-colors hover:bg-zinc-800 border border-transparent hover:border-zinc-700"
            >
              🔥
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Main Component ─── */
export default function FocusRoom() {
  const [roomCode, setRoomCode] = useState('');
  const [inputCode, setInputCode] = useState('');
  const [userName, setUserName] = useState('');
  const [inRoom, setInRoom] = useState(false);
  const [members, setMembers] = useState([]);
  const wsRef = useRef(null);

  // Demo members for offline preview
  const demoMembers = [
    { id: '1', name: 'Alice', score: 82 },
    { id: '2', name: 'Bob', score: 61 },
    { id: '3', name: 'Charlie', score: 45 },
  ];

  function createRoom() {
    if (!userName.trim()) return;
    const code = generateCode();
    setRoomCode(code);
    setInRoom(true);
    setMembers([{ id: 'self', name: userName, score: 75 }, ...demoMembers]);
  }

  function joinRoom() {
    if (!userName.trim() || !inputCode.trim()) return;
    setRoomCode(inputCode.toUpperCase());
    setInRoom(true);
    setMembers([{ id: 'self', name: userName, score: 75 }, ...demoMembers]);
  }

  function leaveRoom() {
    setInRoom(false);
    setRoomCode('');
    setMembers([]);
    if (wsRef.current) wsRef.current.close();
  }

  function handleReact(memberId, emoji) {
    console.log(`[FocusRoom] React ${emoji} to ${memberId}`);
  }

  if (!inRoom) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="max-w-sm w-full space-y-6">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
              Focus Room
            </h2>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Study together in real-time. No chat — just focus.
            </p>
          </div>

          {/* Name input */}
          <div>
            <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>
              Your Name
            </label>
            <input
              type="text"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              placeholder="Enter your name"
              className="w-full px-4 py-3 rounded-lg text-sm outline-none transition-colors border focus:border-white"
              style={{
                background: 'var(--bg-secondary)',
                borderColor: 'var(--border)',
                color: 'var(--text-primary)',
              }}
            />
          </div>

          {/* Create room */}
          <button
            onClick={createRoom}
            disabled={!userName.trim()}
            className="btn-primary w-full py-3 text-sm disabled:opacity-50"
          >
            Create New Room
          </button>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
            <span className="text-xs font-medium uppercase tracking-widest" style={{ color: 'var(--text-tertiary)' }}>or</span>
            <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
          </div>

          {/* Join room */}
          <div className="flex gap-2">
            <input
              type="text"
              value={inputCode}
              onChange={(e) => setInputCode(e.target.value.toUpperCase())}
              maxLength={6}
              placeholder="Room code"
              className="flex-1 px-4 py-3 rounded-lg text-sm outline-none text-center tracking-widest font-mono uppercase transition-colors border focus:border-white"
              style={{
                background: 'var(--bg-secondary)',
                borderColor: 'var(--border)',
                color: 'var(--text-primary)',
              }}
            />
            <button
              onClick={joinRoom}
              disabled={!userName.trim() || inputCode.length < 6}
              className="btn-secondary px-6 py-3 text-sm disabled:opacity-50"
            >
              Join
            </button>
          </div>
        </div>
      </div>
    );
  }

  // In room view
  return (
    <div className="h-full overflow-y-auto pr-2 pb-6" style={{ scrollbarGutter: 'stable' }}>
      {/* Room header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
            Focus Room
          </h2>
          <div className="flex items-center gap-2 mt-1">
            <span
              className="px-2 py-0.5 rounded text-[11px] font-mono font-bold tracking-widest border"
              style={{
                background: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
                borderColor: 'var(--border)'
              }}
            >
              {roomCode}
            </span>
            <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
              {members.length} Member{members.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
        <button
          onClick={leaveRoom}
          className="btn-secondary px-4 py-2 text-xs"
        >
          Leave Room
        </button>
      </div>

      {/* Members */}
      <div className="space-y-3">
        {members.map((m) => (
          <MemberCard key={m.id} member={m} onReact={handleReact} />
        ))}
      </div>

      {/* ─── Leaderboard ─── */}
      {members.length > 1 && (
        <div className="mt-8">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
            Leaderboard
          </h3>
          <div className="premium-card overflow-hidden">
            {[...members]
              .sort((a, b) => b.score - a.score)
              .map((m, i) => {
                const medals = ['🥇', '🥈', '🥉'];
                const medal = i < 3 ? medals[i] : `#${i + 1}`;
                const barWidth = Math.max(10, m.score);
                const barColor = m.score >= 70 ? 'var(--score-green)' : m.score >= 50 ? 'var(--score-amber)' : 'var(--score-red)';
                const isYou = m.id === 'self';

                return (
                  <div
                    key={m.id}
                    className={`flex items-center gap-3 px-4 py-3 transition-colors ${i > 0 ? 'border-t' : ''}`}
                    style={{
                      borderColor: 'var(--border)',
                      background: isYou ? 'rgba(255,255,255,0.03)' : 'transparent',
                    }}
                  >
                    <span className="text-base w-7 text-center">{medal}</span>
                    <span
                      className="text-sm font-semibold flex-shrink-0 w-24 truncate"
                      style={{ color: isYou ? 'var(--accent-primary)' : 'var(--text-primary)' }}
                    >
                      {m.name} {isYou && <span className="text-[10px] text-zinc-500">(You)</span>}
                    </span>
                    <div className="flex-1 h-5 rounded-sm overflow-hidden" style={{ background: 'var(--bg-secondary)' }}>
                      <div
                        className="h-full rounded-sm transition-all duration-700 ease-out"
                        style={{ width: `${barWidth}%`, background: barColor, opacity: 0.85 }}
                      />
                    </div>
                    <span className="text-sm font-bold tabular-nums w-8 text-right" style={{ color: barColor }}>
                      {m.score}
                    </span>
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}
