import { useState } from 'react';

function generateCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

const INPUT_STYLE = {
  width: '100%',
  height: '44px',
  background: 'transparent',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: '10px',
  padding: '0 16px',
  color: '#ffffff',
  fontSize: '15px',
  outline: 'none',
  boxSizing: 'border-box',
};

const BTN_STYLE = {
  width: '100%',
  height: '44px',
  background: '#3730a3',
  color: '#ffffff',
  border: 'none',
  borderRadius: '10px',
  fontSize: '15px',
  fontWeight: 600,
  cursor: 'pointer',
  marginTop: '12px',
};

const CARD_STYLE = {
  background: '#111418',
  borderRadius: '16px',
  padding: '28px 32px 32px',
  border: '1px solid rgba(255,255,255,0.07)',
  width: '340px',
};

export default function FocusRoom() {
  const [userName, setUserName] = useState('');
  const [inputCode, setInputCode] = useState('');
  const [inRoom, setInRoom] = useState(false);
  const [roomCode, setRoomCode] = useState('');
  const [members, setMembers] = useState([]);

  const DEMO = [
    { id: '1', name: 'Alice', score: 82 },
    { id: '2', name: 'Bob', score: 61 },
    { id: '3', name: 'Charlie', score: 45 },
  ];

  function createRoom() {
    if (!userName.trim()) return;
    const code = generateCode();
    setRoomCode(code);
    setInRoom(true);
    setMembers([{ id: 'self', name: userName, score: 75 }, ...DEMO]);
  }

  function joinRoom() {
    if (!userName.trim() || inputCode.length < 4) return;
    setRoomCode(inputCode.toUpperCase());
    setInRoom(true);
    setMembers([{ id: 'self', name: userName, score: 75 }, ...DEMO]);
  }

  /* ── LOBBY / JOIN ── */
  if (!inRoom) {
    return (
      <div style={{ width: '100%', minHeight: 'calc(100vh - 60px)', background: '#000000', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>

        {/* Title */}
        <h1 style={{ color: '#ffffff', fontSize: '36px', fontWeight: 500, margin: '0 0 56px 0', letterSpacing: '-0.5px' }}>
          Focus <span style={{ color: '#9ca3af', fontWeight: 300 }}>Room</span>
        </h1>

        {/* Two cards + OR */}
        <div style={{ display: 'flex', alignItems: 'stretch', gap: '0' }}>

          {/* LEFT: Your Name + Create */}
          <div style={CARD_STYLE}>
            <div style={{ fontSize: '11px', letterSpacing: '2px', textTransform: 'uppercase', color: '#6b7280', marginBottom: '16px', fontWeight: 600 }}>YOUR NAME</div>
            <input
              type="text"
              value={userName}
              onChange={e => setUserName(e.target.value)}
              placeholder="Enter your name"
              style={INPUT_STYLE}
            />
            <button onClick={createRoom} style={BTN_STYLE}>Create New Room</button>
          </div>

          {/* OR divider */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '60px', flexShrink: 0 }}>
            <span style={{ color: '#6b7280', fontSize: '13px', fontWeight: 500 }}>OR</span>
          </div>

          {/* RIGHT: Room Code + Join */}
          <div style={CARD_STYLE}>
            <div style={{ fontSize: '11px', letterSpacing: '2px', textTransform: 'uppercase', color: '#6b7280', marginBottom: '16px', fontWeight: 600 }}>ROOM CODE</div>
            <input
              type="text"
              value={inputCode}
              onChange={e => setInputCode(e.target.value.toUpperCase())}
              placeholder="Room Code"
              maxLength={6}
              style={{ ...INPUT_STYLE, letterSpacing: '3px', fontFamily: 'monospace' }}
            />
            <button onClick={joinRoom} style={BTN_STYLE}>Join</button>
          </div>

        </div>
      </div>
    );
  }

  /* ── IN ROOM VIEW ── */
  return (
    <div style={{ width: '100%', minHeight: 'calc(100vh - 60px)', background: '#000000', padding: '48px', boxSizing: 'border-box', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '32px' }}>
        <div>
          <h2 style={{ color: '#ffffff', fontSize: '24px', fontWeight: 700, margin: '0 0 4px 0' }}>Focus Room</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', padding: '2px 10px', color: '#ffffff', fontSize: '13px', fontFamily: 'monospace', letterSpacing: '3px' }}>{roomCode}</span>
            <span style={{ color: '#6b7280', fontSize: '13px' }}>{members.length} Members</span>
          </div>
        </div>
        <button onClick={() => { setInRoom(false); setMembers([]); }} style={{ background: '#1a1a1a', color: '#9ca3af', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '8px 16px', fontSize: '13px', cursor: 'pointer' }}>
          Leave Room
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '600px' }}>
        {members.map(m => {
          const color = m.score >= 70 ? '#22c55e' : m.score >= 50 ? '#f59e0b' : '#ef4444';
          const label = m.score >= 70 ? '📚 Studying' : m.score >= 50 ? '☕ Break' : '😵 Distracted';
          return (
            <div key={m.id} style={{ background: '#111418', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '12px', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#222', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: '14px' }}>
                  {m.name[0].toUpperCase()}
                </div>
                <div>
                  <div style={{ color: '#fff', fontSize: '14px', fontWeight: 600 }}>{m.name}{m.id === 'self' && <span style={{ color: '#6b7280', fontSize: '11px', marginLeft: '6px' }}>(You)</span>}</div>
                  <div style={{ color, fontSize: '12px', marginTop: '2px' }}>{label}</div>
                </div>
              </div>
              <span style={{ color, fontSize: '22px', fontWeight: 700 }}>{m.score}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
