import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

function useSplineScript() {
  useEffect(() => {
    if (!document.querySelector('script[src*="spline-viewer"]')) {
      const s = document.createElement('script');
      s.type = 'module';
      s.src = 'https://unpkg.com/@splinetool/viewer@1.12.70/build/spline-viewer.js';
      document.head.appendChild(s);
    }
  }, []);
}

export default function Dashboard() {
  const navigate = useNavigate();
  useSplineScript();

  return (
    <div style={{ width: '100%', height: '100vh', overflowY: 'auto', overflowX: 'hidden', scrollBehavior: 'smooth' }}>

      {/* ── HERO ── */}
      <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: '80px', minHeight: '100vh', width: '100%', position: 'relative', overflow: 'hidden', flexShrink: 0, background: '#000000' }}>
        <div style={{ flex: '0 0 auto', maxWidth: '560px', paddingRight: '40px', zIndex: 10 }}>
          <h1 style={{ fontSize: '72px', fontWeight: 800, color: '#ffffff', lineHeight: 1.1, letterSpacing: '-2px', margin: '0 0 24px 0' }}>
            Design your<br />own focus
          </h1>
          <p style={{ fontSize: '16px', color: '#9ca3af', fontWeight: 400, lineHeight: 1.6, margin: '0 0 40px 0' }}>
            We build systems that process data at the speed of thought.<br />
            Fast, adaptive, and built to scale with the world.
          </p>
          <button onClick={() => navigate('/session')}
            style={{ background: '#ffffff', color: '#000000', borderRadius: '50px', padding: '14px 32px', fontSize: '16px', fontWeight: 600, border: 'none', cursor: 'pointer' }}>
            Get Started
          </button>
        </div>
        <div style={{ flex: '0 0 55%', height: '100vh', position: 'relative', overflow: 'hidden' }}>
          {/* @ts-ignore */}
          <spline-viewer url="https://prod.spline.design/Nv3Hgrs9DL1kFEb1/scene.splinecode" style={{ width: '100%', height: '100%', display: 'block' }} />
          <div style={{ position: 'absolute', bottom: 0, right: 0, width: '220px', height: '60px', background: '#000000', zIndex: 20 }} />
        </div>
      </div>

    </div>
  );
}
