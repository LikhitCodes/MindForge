import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../AuthContext';

/* ─── Status Helpers ─── */
function getStatusDisplay(status, score) {
  if (status === 'break') return { label: 'On Break', color: 'var(--score-amber)', emoji: '☕', dot: '#f59e0b' };
  if (status === 'distracted') return { label: 'Distracted', color: 'var(--score-red)', emoji: '😵', dot: '#ef4444' };
  // Default: focused (also covers neutral)
  return { label: 'Focused', color: 'var(--score-green)', emoji: '📚', dot: '#10b981' };
}

/* ─── SVG Icons ─── */
const CopyIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
  </svg>
);
const MailIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>
  </svg>
);
const LinkIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
  </svg>
);
const CheckIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);

/* ─── Member Card ─── */
function MemberCard({ member, isYou, onReact }) {
  const statusInfo = getStatusDisplay(member.status, member.score);
  const [showReaction, setShowReaction] = useState(null);

  function handleReact(emoji) {
    if (onReact) onReact(member.user_id, emoji);
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
          {/* Avatar with status dot */}
          <div className="relative">
            <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold bg-zinc-800 text-zinc-300 border border-zinc-700">
              {member.display_name?.[0]?.toUpperCase() || '?'}
            </div>
            {/* Status dot */}
            <div
              className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2"
              style={{ background: statusInfo.dot, borderColor: 'var(--bg-card)' }}
            />
          </div>
          <div>
            <span className="text-sm font-semibold block" style={{ color: 'var(--text-primary)' }}>
              {member.display_name}
              {isYou && <span className="text-[10px] ml-1 text-zinc-500">(You)</span>}
            </span>
            <span className="text-xs flex items-center gap-1 font-medium mt-0.5" style={{ color: statusInfo.color }}>
              {statusInfo.emoji} {statusInfo.label}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Score */}
          <span className="text-xl font-bold tabular-nums" style={{ color: statusInfo.color }}>
            {member.score || 0}
          </span>
          {/* Reaction buttons */}
          {!isYou && (
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
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Email Invite Modal ─── */
function InviteModal({ roomCode, roomName, onClose }) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);

  function handleSend() {
    if (!email.trim()) return;
    const subject = encodeURIComponent(`Join my Focus Room on MindForge: "${roomName}"`);
    const body = encodeURIComponent(
      `Hey!\n\nI'm studying on MindForge and created a Focus Room. Join me!\n\nRoom Code: ${roomCode}\nRoom Name: ${roomName}\n\nOpen MindForge → Focus Room → Enter the code to join.\n\nLet's focus together! 🧠`
    );
    window.open(`mailto:${email}?subject=${subject}&body=${body}`);
    setSent(true);
    setTimeout(() => { setSent(false); onClose(); }, 1500);
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={onClose}>
      <div className="premium-card p-6 w-96 animate-slide-up" style={{ background: 'var(--bg-card)' }}
        onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
          Invite via Email
        </h3>
        <p className="text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>
          Send the room code to a friend's email
        </p>

        <div className="flex gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="friend@email.com"
            className="flex-1 px-3 py-2.5 rounded-lg text-sm outline-none transition-colors border focus:border-white"
            style={{
              background: 'var(--bg-secondary)',
              borderColor: 'var(--border)',
              color: 'var(--text-primary)',
            }}
            autoFocus
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          />
          <button
            onClick={handleSend}
            disabled={!email.trim() || sent}
            className="btn-primary px-4 py-2.5 text-sm flex items-center gap-2 disabled:opacity-50"
          >
            {sent ? <><CheckIcon /> Sent!</> : <><MailIcon /> Send</>}
          </button>
        </div>

        <button
          onClick={onClose}
          className="mt-3 text-xs w-full text-center py-1.5 rounded transition-colors"
          style={{ color: 'var(--text-tertiary)' }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-secondary)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-tertiary)'; }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

/* ─── Main Component ─── */
export default function FocusRoom() {
  const { user } = useAuth();
  const [roomCode, setRoomCode] = useState('');
  const [roomName, setRoomName] = useState('');
  const [inputCode, setInputCode] = useState('');
  const [inputRoomName, setInputRoomName] = useState('');
  const [userName, setUserName] = useState('');
  const [inRoom, setInRoom] = useState(false);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const pollRef = useRef(null);

  // Auto-fill username from email
  useEffect(() => {
    if (user?.email) {
      setUserName(user.email.split('@')[0]);
    }
  }, [user]);

  // Check for active room on mount
  useEffect(() => {
    checkActiveRoom();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  async function checkActiveRoom() {
    try {
      const result = await window.mindforge.room.getActive();
      if (result?.room) {
        setRoomCode(result.room.id);
        setRoomName(result.room.name);
        setMembers(result.members || []);
        setInRoom(true);
        startPolling(result.room.id);
      }
    } catch (err) {
      console.error('[FocusRoom] checkActiveRoom error:', err);
    }
  }

  function startPolling(code) {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const result = await window.mindforge.room.getMembers(code);
        if (result?.members) setMembers(result.members);
      } catch {}
    }, 5000);
  }

  async function createRoom() {
    if (!userName.trim() || !inputRoomName.trim()) return;
    setLoading(true);
    setError('');
    try {
      const result = await window.mindforge.room.create(inputRoomName.trim(), userName.trim());
      if (result.error) {
        setError(result.error);
        setLoading(false);
        return;
      }
      setRoomCode(result.code);
      setRoomName(inputRoomName.trim());
      setInRoom(true);
      // Fetch members
      const membersResult = await window.mindforge.room.getMembers(result.code);
      setMembers(membersResult?.members || []);
      startPolling(result.code);
    } catch (err) {
      setError(err.message || 'Failed to create room');
    }
    setLoading(false);
  }

  async function joinRoom() {
    if (!userName.trim() || inputCode.length < 6) return;
    setLoading(true);
    setError('');
    try {
      const result = await window.mindforge.room.join(inputCode.trim(), userName.trim());
      if (result.error) {
        setError(result.error);
        setLoading(false);
        return;
      }
      setRoomCode(inputCode.toUpperCase());
      setRoomName(result.room?.name || 'Focus Room');
      setInRoom(true);
      const membersResult = await window.mindforge.room.getMembers(inputCode.toUpperCase());
      setMembers(membersResult?.members || []);
      startPolling(inputCode.toUpperCase());
    } catch (err) {
      setError(err.message || 'Failed to join room');
    }
    setLoading(false);
  }

  async function leaveRoom() {
    if (pollRef.current) clearInterval(pollRef.current);
    try {
      await window.mindforge.room.leave(roomCode);
    } catch {}
    setInRoom(false);
    setRoomCode('');
    setRoomName('');
    setMembers([]);
    setInputCode('');
    setInputRoomName('');
  }

  function copyCode() {
    navigator.clipboard.writeText(roomCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  }

  function copyLink() {
    const link = `mindforge://room/${roomCode}`;
    navigator.clipboard.writeText(roomCode);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  }

  /* ─── Lobby View ─── */
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

          {/* Error */}
          {error && (
            <div className="px-4 py-2.5 rounded-lg text-xs font-medium border animate-slide-up"
              style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--score-red)', borderColor: 'rgba(239,68,68,0.2)' }}>
              {error}
            </div>
          )}

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

          {/* Room name + create */}
          <div>
            <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>
              Room Name
            </label>
            <input
              type="text"
              value={inputRoomName}
              onChange={(e) => setInputRoomName(e.target.value)}
              placeholder="e.g. Study Squad, Final Exam Prep"
              className="w-full px-4 py-3 rounded-lg text-sm outline-none transition-colors border focus:border-white"
              style={{
                background: 'var(--bg-secondary)',
                borderColor: 'var(--border)',
                color: 'var(--text-primary)',
              }}
            />
          </div>

          <button
            onClick={createRoom}
            disabled={!userName.trim() || !inputRoomName.trim() || loading}
            className="btn-primary w-full py-3 text-sm disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? <div className="auth-spinner" /> : 'Create New Room'}
          </button>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
            <span className="text-xs font-medium uppercase tracking-widest" style={{ color: 'var(--text-tertiary)' }}>or join</span>
            <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
          </div>

          {/* Join room */}
          <div className="flex gap-2">
            <input
              type="text"
              value={inputCode}
              onChange={(e) => setInputCode(e.target.value.toUpperCase())}
              maxLength={6}
              placeholder="ROOM CODE"
              className="flex-1 px-4 py-3 rounded-lg text-sm outline-none text-center tracking-widest font-mono uppercase transition-colors border focus:border-white"
              style={{
                background: 'var(--bg-secondary)',
                borderColor: 'var(--border)',
                color: 'var(--text-primary)',
              }}
            />
            <button
              onClick={joinRoom}
              disabled={!userName.trim() || inputCode.length < 6 || loading}
              className="btn-secondary px-6 py-3 text-sm disabled:opacity-50"
            >
              Join
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ─── In-Room View ─── */
  const currentUserId = user?.id;

  return (
    <div className="h-full overflow-y-auto pr-2 pb-6" style={{ scrollbarGutter: 'stable' }}>
      {/* Room header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
            {roomName}
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

      {/* Share & Invite Bar */}
      <div className="premium-card p-4 mb-6">
        <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-tertiary)' }}>
          Share This Room
        </p>
        <div className="flex gap-2 flex-wrap">
          {/* Copy Code */}
          <button
            onClick={copyCode}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all border"
            style={{
              background: copiedCode ? 'rgba(16,185,129,0.1)' : 'var(--bg-secondary)',
              borderColor: copiedCode ? 'rgba(16,185,129,0.3)' : 'var(--border)',
              color: copiedCode ? 'var(--score-green)' : 'var(--text-primary)',
            }}
          >
            {copiedCode ? <><CheckIcon /> Copied!</> : <><CopyIcon /> Copy Code</>}
          </button>

          {/* Copy Invite Link */}
          <button
            onClick={copyLink}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all border"
            style={{
              background: copiedLink ? 'rgba(16,185,129,0.1)' : 'var(--bg-secondary)',
              borderColor: copiedLink ? 'rgba(16,185,129,0.3)' : 'var(--border)',
              color: copiedLink ? 'var(--score-green)' : 'var(--text-primary)',
            }}
          >
            {copiedLink ? <><CheckIcon /> Copied!</> : <><LinkIcon /> Copy Invite Link</>}
          </button>

          {/* Invite via Email */}
          <button
            onClick={() => setShowInviteModal(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all border"
            style={{
              background: 'var(--bg-secondary)',
              borderColor: 'var(--border)',
              color: 'var(--text-primary)',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--border-active)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; }}
          >
            <MailIcon /> Invite via Email
          </button>
        </div>
      </div>

      {/* Members */}
      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
        Members
      </h3>
      <div className="space-y-3">
        {members.map((m) => (
          <MemberCard
            key={m.id || m.user_id}
            member={m}
            isYou={m.user_id === currentUserId}
            onReact={() => {}}
          />
        ))}
        {members.length === 0 && (
          <div className="premium-card p-6 text-center">
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              No members yet. Share the room code to invite friends!
            </p>
          </div>
        )}
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
              .sort((a, b) => (b.score || 0) - (a.score || 0))
              .map((m, i) => {
                const medals = ['🥇', '🥈', '🥉'];
                const medal = i < 3 ? medals[i] : `#${i + 1}`;
                const barWidth = Math.max(10, m.score || 0);
                const statusInfo = getStatusDisplay(m.status, m.score);
                const isYou = m.user_id === currentUserId;

                return (
                  <div
                    key={m.id || m.user_id}
                    className={`flex items-center gap-3 px-4 py-3 transition-colors ${i > 0 ? 'border-t' : ''}`}
                    style={{
                      borderColor: 'var(--border)',
                      background: isYou ? 'rgba(255,255,255,0.03)' : 'transparent',
                    }}
                  >
                    <span className="text-base w-7 text-center">{medal}</span>
                    <div className="flex items-center gap-2 flex-shrink-0 w-28">
                      {/* Status dot */}
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: statusInfo.dot }} />
                      <span
                        className="text-sm font-semibold truncate"
                        style={{ color: isYou ? 'var(--accent-primary)' : 'var(--text-primary)' }}
                      >
                        {m.display_name} {isYou && <span className="text-[10px] text-zinc-500">(You)</span>}
                      </span>
                    </div>
                    <div className="flex-1 h-5 rounded-sm overflow-hidden" style={{ background: 'var(--bg-secondary)' }}>
                      <div
                        className="h-full rounded-sm transition-all duration-700 ease-out"
                        style={{ width: `${barWidth}%`, background: statusInfo.color, opacity: 0.85 }}
                      />
                    </div>
                    <span className="text-sm font-bold tabular-nums w-8 text-right" style={{ color: statusInfo.color }}>
                      {m.score || 0}
                    </span>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Email Invite Modal */}
      {showInviteModal && (
        <InviteModal
          roomCode={roomCode}
          roomName={roomName}
          onClose={() => setShowInviteModal(false)}
        />
      )}
    </div>
  );
}
