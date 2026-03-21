import { useState, useEffect } from 'react';

const API = 'http://localhost:39871';
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

function getHeatColor(score) {
  if (score === null || score === undefined) return '#18181b'; // zinc-900
  if (score >= 80) return '#22c55e'; // green-500
  if (score >= 60) return '#16a34a'; // green-600
  if (score >= 40) return '#15803d'; // green-700
  if (score >= 20) return '#166534'; // green-800
  return '#14532d'; // green-900
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

  const scoreMap = {};
  data.forEach((d) => {
    scoreMap[`${d.day}-${d.hour}`] = d.avg_score;
  });

  return (
    <div className="bg-[#09090b] border border-zinc-800/80 rounded-[1.5rem] p-8 shadow-2xl flex flex-col justify-center overflow-hidden">
      <div className="flex items-center justify-between mb-8 pb-4 border-b border-zinc-800/50">
        <div>
          <h3 className="text-lg font-bold text-white tracking-tight">Focus Matrix</h3>
          <p className="text-[13px] mt-1 text-zinc-500 font-medium">Density map of sustained concentration vs time.</p>
        </div>
        <div className="flex items-center gap-1.5 bg-black/50 px-3 py-1.5 rounded-full border border-zinc-800/50">
          <span className="text-[10px] uppercase tracking-widest text-zinc-500 mr-2">Less</span>
          {[0, 20, 40, 60, 80].map((v) => (
            <div key={v} className="w-3 h-3 rounded-[3px] border border-white/5 shadow-sm" style={{ background: getHeatColor(v) }} />
          ))}
          <span className="text-[10px] uppercase tracking-widest text-zinc-500 ml-2">More</span>
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center p-12">
          <span className="text-sm font-semibold text-zinc-500 animate-pulse tracking-widest uppercase">Syncing matrix data...</span>
        </div>
      ) : (
        <div className="w-full flex justify-center pb-2">
          <div className="flex select-none">
            {/* Y-Axis: Days */}
            <div className="flex flex-col gap-[4px] pr-4 mt-[18px]">
              {DAYS.map((day, i) => (
                <span key={day} className="text-[10px] h-[16px] flex items-center justify-end font-bold tracking-wider text-zinc-500 uppercase">
                  {i % 2 === 0 ? day : ''}
                </span>
              ))}
            </div>

            <div className="flex flex-col">
              {/* X-Axis: Hours Wrapper */}
              <div className="flex gap-[4px] mb-2 pl-1 whitespace-nowrap">
                {HOURS.map((h) => (
                  <div key={h} className="w-[16px] relative flex justify-center">
                    {h % 3 === 0 && (
                      <span className="absolute -left-1 bottom-0 text-[10px] font-bold text-zinc-500">
                        {h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p`}
                      </span>
                    )}
                  </div>
                ))}
              </div>

              {/* Matrix Grid: 7 Rows (Days) x 24 Columns (Hours) */}
              <div className="flex flex-col gap-[4px]">
                {DAYS.map((day, dayIdx) => (
                  <div key={day} className="flex gap-[4px]">
                    {HOURS.map((hour) => {
                      const key = `${dayIdx}-${hour}`;
                      const score = scoreMap[key];
                      const isHovered = hoveredCell === key;

                      return (
                        <div
                          key={key}
                          onMouseEnter={() => setHoveredCell(key)}
                          onMouseLeave={() => setHoveredCell(null)}
                          className="relative w-[16px] h-[16px] rounded-[3px] transition-all duration-200 cursor-crosshair border border-white/5 box-border"
                          style={{
                            backgroundColor: getHeatColor(score),
                            transform: isHovered ? 'scale(1.2)' : 'scale(1)',
                            zIndex: isHovered ? 10 : 1,
                            boxShadow: isHovered ? `0 0 12px ${getHeatColor(score)}90` : 'none',
                          }}
                        >
                           {isHovered && score !== undefined && (
                             <div className="absolute -top-8 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-md bg-white text-black text-[11px] font-black shadow-xl z-50 pointer-events-none before:content-[''] before:absolute before:-bottom-1 before:left-1/2 before:-translate-x-1/2 before:border-l-4 before:border-l-transparent before:border-r-4 before:border-r-transparent before:border-t-4 before:border-t-white">
                               {score}%
                             </div>
                           )}
                           {isHovered && score === undefined && (
                             <div className="absolute -top-8 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-md bg-zinc-800 text-white text-[10px] font-bold uppercase tracking-widest shadow-xl z-50 pointer-events-none before:content-[''] before:absolute before:-bottom-1 before:left-1/2 before:-translate-x-1/2 before:border-l-4 before:border-l-transparent before:border-r-4 before:border-r-transparent before:border-t-4 before:border-t-zinc-800">
                               Blank
                             </div>
                           )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
