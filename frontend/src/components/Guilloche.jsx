import { useMemo } from 'react';

// Engraved rosette: fine interlaced lines, like the guilloche on certificates and banknotes. Turns slowly behind the
// crest on the sign-in screen; drawn still and faint behind the sidebar.
export default function Guilloche({ className = 'auth-guilloche' }) {
  const waves = useMemo(() => {
    const ring = (radius, depth, lobes, phase) => {
      let d = '';
      for (let i = 0; i <= 720; i++) {
        const t = (i / 720) * Math.PI * 2;
        const r = radius + depth * Math.sin(lobes * t + phase);
        d += `${i ? 'L' : 'M'}${(500 + r * Math.cos(t)).toFixed(1)} ${(500 + r * Math.sin(t)).toFixed(1)}`;
      }
      return d + 'Z';
    };
    return [
      ...Array.from({ length: 8 }, (_, i) => ring(430, 26, 18, (i * Math.PI) / 4)),
      ...Array.from({ length: 6 }, (_, i) => ring(352, 14, 30, (i * Math.PI) / 3))
    ];
  }, []);
  return <svg className={className} viewBox="0 0 1000 1000" aria-hidden="true" focusable="false">
    <g className="auth-guilloche-rosette">{Array.from({ length: 36 }, (_, i) => <ellipse key={i} cx="500" cy="500" rx="300" ry="132" transform={`rotate(${i * 5} 500 500)`} />)}</g>
    <g className="auth-guilloche-bands">{waves.map((d, i) => <path key={i} d={d} />)}</g>
    <circle cx="500" cy="500" r="468" /><circle cx="500" cy="500" r="476" />
  </svg>;
}
