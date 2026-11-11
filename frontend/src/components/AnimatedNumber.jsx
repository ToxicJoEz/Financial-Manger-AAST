import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { money } from './WorkspaceUI';

// A figure that glides from its old value to the new one instead of snapping (e.g. when the period changes).
export default function AnimatedNumber({ value = 0, format = money, duration = 900 }) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = from.current,
      change = value - start;
    if (!change) return;
    if (reduced) {
      from.current = value;
      setShown(value);
      return;
    }
    let frame;
    const began = performance.now();
    const step = now => {
      const t = Math.min(1, (now - began) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      // Whole numbers stay whole while counting; amounts keep at most two decimals.
      const next = start + change * eased;
      from.current = t === 1 ? value : Number.isInteger(start) && Number.isInteger(value) ? Math.round(next) : Math.round(next * 100) / 100;
      setShown(from.current);
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value, duration, reduced]);
  return <span className="animated-number">{format(shown)}</span>;
}
