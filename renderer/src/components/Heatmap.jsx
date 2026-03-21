import { useState, useEffect } from 'react';

const API = 'http://localhost:39871';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

function getHeatColor(score) {
  if (score === null || score === undefined) return 'var(--bg-secondary)'; // Empty
  if (score >= 80) return '#10b981'; // emerald-500
  if (score >= 60) return '#059669'; // emerald-600
  if (score >= 40) return '#047857'; // emerald-700
  if (score >= 20) return '#065f46'; // emerald-800
  return '#064e3b'; // emerald-900
}

export default function Heatmap() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hoveredCell, setHoveredCell] = useState(null);

  useEffect(() => {
    fetch(`${API}/scores/heatmap`)
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch((err) => {
        console.error('[Heatmap] Fetch error:', err);
        setLoading(false);
      });
  }, []);

  // Build lookup map
  const scoreMap = {};
  data.forEach((d) => {
    scoreMap[`${d.day}-${d.hour}`] = d.avg_score;
  });

  return (
    <div className="premium-card p-6 h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            Focus Heatmap
          </h3>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
            Average focus score by day &amp; hour — last 7 days
          </p>
        </div>
        {/* Legend */}
        <div className="flex items-center gap-1.5 pt-2">
          <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>Low</span>
          {[0, 20, 40, 60, 80].map((v) => (
            <div
              key={v}
              className="w-3 h-3 rounded-[2px]"
              style={{ background: getHeatColor(v) }}
            />
          ))}
          <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>High</span>
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <span className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Loading heatmap...</span>
        </div>
      ) : (
        <div className="flex-1 overflow-x-auto pb-2">
          <div className="flex gap-1" style={{ minWidth: 500 }}>
            {/* Hour labels */}
            <div className="flex flex-col gap-1 mr-2 pt-5">
              {HOURS.filter((h) => h % 3 === 0).map((h) => (
                <div
                  key={h}
                  className="text-[9px] text-right font-medium pr-1 flex items-center justify-end"
                  style={{
                    color: 'var(--text-tertiary)',
                    height: `${(3 * 100) / 24}%`,
                    minHeight: 12,
                  }}
                >
                  {h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p`}
                </div>
              ))}
            </div>

            {/* Grid columns = days */}
            {DAYS.map((day, dayIdx) => (
              <div key={day} className="flex-1 flex flex-col gap-1">
                <span
                  className="text-[10px] text-center font-semibold mb-1"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  {day}
                </span>
                {HOURS.map((hour) => {
                  const key = `${dayIdx}-${hour}`;
                  const score = scoreMap[key];
                  const isHovered = hoveredCell === key;
                  return (
                    <div
                      key={key}
                      className="rounded-[3px] transition-all duration-150 cursor-pointer relative"
                      style={{
                        background: getHeatColor(score),
                        aspectRatio: '1',
                        opacity: isHovered ? 1 : 0.9,
                        transform: isHovered ? 'scale(1.15)' : 'scale(1)',
                        zIndex: isHovered ? 10 : 1,
                      }}
                      onMouseEnter={() => setHoveredCell(key)}
                      onMouseLeave={() => setHoveredCell(null)}
                    >
                      {isHovered && score !== undefined && (
                        <div
                          className="absolute -top-7 left-1/2 -translate-x-1/2 px-2 py-1 rounded-[4px] text-[10px] font-bold whitespace-nowrap shadow-lg z-20"
                          style={{
                            background: 'var(--bg-card-hover)',
                            border: '1px solid var(--border)',
                            color: 'var(--text-primary)',
                          }}
                        >
                          {score}%
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
