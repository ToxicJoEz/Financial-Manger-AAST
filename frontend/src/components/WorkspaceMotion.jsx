import { AnimatePresence, LazyMotion, MotionConfig, domAnimation, m, useIsPresent, useReducedMotion } from 'framer-motion';

const ease = [0.25, 0.1, 0.25, 1];
const settled = { opacity: 1, y: 0 };

export function WorkspaceMotion({ children }) {
  return <LazyMotion features={domAnimation} strict>
    <MotionConfig reducedMotion="user" transition={{ duration: 0.42, ease }}>
      {children}
    </MotionConfig>
  </LazyMotion>;
}

// Declarative entrances only: no effect-triggered animation to replay in Strict Mode.
export function MotionSurface({ children, className, enter = true, distance = 12, exit, ...props }) {
  const reduced = useReducedMotion();
  const present = useIsPresent();
  return <m.div {...props} className={className}
    inert={!present}
    initial={enter && !reduced ? { opacity: 0, y: distance } : false}
    animate={settled}
    exit={reduced ? undefined : exit}
    transition={{ duration: reduced ? 0 : 0.42, ease }}>
    {children}
  </m.div>;
}

// Wait for the departing content to finish before mounting the incoming content.
// Routes pass a captured useOutlet() element, never a live <Outlet /> in both trees.
export function MotionRegion({ transitionKey, children, className }) {
  return <AnimatePresence mode="wait" initial={false}>
    <MotionSurface key={transitionKey} className={className}
      exit={{ opacity: 0, y: -6, transition: { duration: 0.18, ease } }}>
    {children}
    </MotionSurface>
  </AnimatePresence>;
}

export function MotionTab({ active, children, onClick }) {
  const reduced = useReducedMotion();
  return <m.button className={active ? 'active motion-tab' : 'motion-tab'}
    aria-pressed={active} onClick={onClick}
    whileTap={reduced ? undefined : { scale: 0.98 }}
    transition={{ duration: reduced ? 0 : 0.12 }}>
    {children}
    {active && <m.i className="motion-tab-indicator" aria-hidden="true"
      initial={reduced ? false : { opacity: 0, scaleX: 0.4 }}
      animate={{ opacity: 1, scaleX: 1 }}
      transition={{ duration: reduced ? 0 : 0.3, ease }} />}
  </m.button>;
}
