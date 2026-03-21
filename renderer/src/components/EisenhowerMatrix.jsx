import { useState, useEffect } from 'react';
import { matrixApi, calendarApi } from '../api';

const CARD = { background: '#111', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.08)' };

const QUADRANTS = [
  { id: 'do_first', label: 'Do First', desc: 'Urgent & Important (e.g. exams, deadlines)', color: '#ef4444' }, // red
  { id: 'schedule', label: 'Schedule', desc: 'Not Urgent & Important (e.g. deep work, gym)', color: '#3b82f6' }, // blue
  { id: 'delegate', label: 'Delegate', desc: 'Urgent & Not Important (e.g. emails, admin)', color: '#f59e0b' }, // yellow
  { id: 'eliminate', label: 'Eliminate', desc: 'Not Urgent & Not Important (e.g. scrolling)', color: '#6b7280' }, // gray
];

export default function EisenhowerMatrix() {
  const [tasks, setTasks] = useState([]);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [calAuth, setCalAuth] = useState(false);
  const [classifying, setClassifying] = useState(false);

  useEffect(() => {
    loadTasks();
    checkCal();
  }, []);

  async function loadTasks() {
    try {
      const data = await matrixApi.getTasks();
      setTasks(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function checkCal() {
    try {
      const { authenticated } = await calendarApi.getStatus();
      setCalAuth(authenticated);
    } catch {}
  }

  async function handleSyncCalendar() {
    setSyncing(true);
    try {
      if (!calAuth) {
        const { url } = await calendarApi.getAuthUrl();
        if (url) window.open(url, '_blank');
        return;
      }
      const res = await calendarApi.sync();
      if (res.ok) {
        loadTasks(); // refresh Inbox
      }
    } catch (err) {
      console.error(err);
      if (err.message.includes('401')) {
        setCalAuth(false);
      }
    } finally {
      setSyncing(false);
    }
  }

  async function addTask(e) {
    if (e && e.key !== 'Enter') return;
    if (!newTaskTitle.trim()) return;
    try {
      const res = await matrixApi.createTask(newTaskTitle.trim(), 'inbox');
      if (res.ok) {
        setTasks(prev => [res.task, ...prev]);
        setNewTaskTitle('');
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function handleDrop(e, quadrantId) {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('text/plain');
    if (!taskId) return;

    // Optimistic UI update
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, quadrant: quadrantId } : t));

    try {
      await matrixApi.updateTask(taskId, { quadrant: quadrantId });
    } catch (err) {
      // Revert on error
      loadTasks();
    }
  }

  function handleDragOver(e) {
    e.preventDefault(); // necessary to allow dropping
  }

  function handleDragStart(e, task) {
    e.dataTransfer.setData('text/plain', task.id);
  }

  async function deleteTask(id) {
    setTasks(prev => prev.filter(t => t.id !== id));
    await matrixApi.deleteTask(id);
  }

  const inboxTasks = tasks.filter(t => t.quadrant === 'inbox' && !t.completed);

  async function handleAutoClassify() {
    if (inboxTasks.length === 0) return;
    setClassifying(true);
    try {
      await matrixApi.autoClassify(inboxTasks.map(t => ({ id: t.id, title: t.title })));
      await loadTasks(); // reload the UI
    } catch (err) {
      console.error('Failed to classify:', err);
    } finally {
      setClassifying(false);
    }
  }

  return (
    <div style={{ padding: '40px 60px', width: '100%', boxSizing: 'border-box', overflowY: 'auto' }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <div>
          <h1 style={{ fontSize: '32px', fontWeight: 800, color: '#fff', margin: '0 0 8px 0' }}>Eisenhower Matrix</h1>
          <p style={{ fontSize: '15px', color: '#9ca3af', margin: 0 }}>Filter the noise. Focus on the Schedule quadrant to build your empire.</p>
        </div>
        <button onClick={handleSyncCalendar} disabled={syncing}
          style={{ background: '#1a1a1a', border: '1px solid #2d2d2d', borderRadius: '8px', padding: '10px 16px', color: '#fff', fontSize: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
          {syncing ? 'Syncing...' : calAuth ? '🔄 Sync Calendar' : '🔗 Connect Google Calendar'}
        </button>
      </div>

      <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start' }}>
        
        {/* INBOX (Left sidebar) */}
        <div style={{ ...CARD, width: '300px', flexShrink: 0, padding: '20px', minHeight: 'calc(100vh - 200px)', display: 'flex', flexDirection: 'column' }}
             onDrop={(e) => handleDrop(e, 'inbox')} onDragOver={handleDragOver}>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #2d2d2d', paddingBottom: '12px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#fff', margin: 0 }}>Inbox</h2>
            {inboxTasks.length > 0 && (
              <button 
                onClick={handleAutoClassify} disabled={classifying}
                style={{ background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', padding: '4px 10px', fontSize: '12px', fontWeight: 600, cursor: classifying ? 'not-allowed' : 'pointer' }}>
                {classifying ? '✨ Magic...' : '✨ Auto-Classify'}
              </button>
            )}
          </div>
          
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
            <input 
              value={newTaskTitle} onChange={e => setNewTaskTitle(e.target.value)} onKeyDown={addTask}
              placeholder="Type task name..."
              style={{ flex: 1, background: '#1a1a1a', border: '1px solid #2d2d2d', borderRadius: '8px', padding: '12px', color: '#fff', fontSize: '14px', outline: 'none', minWidth: 0 }}
            />
            <button 
              onClick={() => addTask({ key: 'Enter' })}
              disabled={!newTaskTitle.trim()}
              style={{ background: newTaskTitle.trim() ? '#22c55e' : '#1a1a1a', color: newTaskTitle.trim() ? '#fff' : '#6b7280', border: '1px solid #2d2d2d', borderRadius: '8px', padding: '0 16px', fontSize: '14px', fontWeight: 600, cursor: newTaskTitle.trim() ? 'pointer' : 'not-allowed', transition: 'all 0.2s' }}
            >
              Add
            </button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {inboxTasks.map(t => (
              <TaskCard key={t.id} task={t} onDragStart={handleDragStart} onDelete={() => deleteTask(t.id)} />
            ))}
            {inboxTasks.length === 0 && (
              <p style={{ color: '#4b5563', fontSize: '13px', textAlign: 'center', marginTop: '40px' }}>No unsorted tasks.</p>
            )}
          </div>
        </div>

        {/* MATRIX (2x2 Grid) */}
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          {QUADRANTS.map(q => {
            const qTasks = tasks.filter(t => t.quadrant === q.id && !t.completed);
            return (
              <div key={q.id} style={{ ...CARD, padding: '20px', minHeight: '300px', display: 'flex', flexDirection: 'column', background: '#0a0a0a' }}
                   onDrop={(e) => handleDrop(e, q.id)} onDragOver={handleDragOver}>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: q.color }} />
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#fff' }}>{q.label}</h3>
                </div>
                <p style={{ fontSize: '13px', color: '#6b7280', margin: '0 0 16px 0' }}>{q.desc}</p>
                
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', padding: '12px' }}>
                  {qTasks.map(t => (
                    <TaskCard key={t.id} task={t} onDragStart={handleDragStart} onDelete={() => deleteTask(t.id)} color={q.color} />
                  ))}
                  {qTasks.length === 0 && (
                    <div style={{ margin: 'auto', color: '#374151', fontSize: '13px' }}>Drop tasks here</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function TaskCard({ task, onDragStart, onDelete, color }) {
  return (
    <div 
      draggable 
      onDragStart={(e) => onDragStart(e, task)}
      style={{ background: '#1a1a1a', border: `1px solid ${color ? color+'40' : '#2d2d2d'}`, borderLeft: `3px solid ${color || '#6b7280'}`, borderRadius: '6px', padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'grab' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {task.google_event_id && <span title="From Google Calendar">📅</span>}
        <span style={{ color: '#e5e7eb', fontSize: '14px', fontWeight: 500, userSelect: 'none' }}>{task.title}</span>
      </div>
      <button onClick={onDelete} style={{ background: 'transparent', border: 'none', color: '#4b5563', cursor: 'pointer', fontSize: '16px' }}>&times;</button>
    </div>
  );
}
