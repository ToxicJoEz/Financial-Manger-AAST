import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { m, useIsPresent, useReducedMotion } from 'framer-motion';
import { MotionSurface } from './WorkspaceMotion';

// Dialog switches may briefly overlap during their exits. Keep the workspace locked
// until the final dialog leaves, and restore the original trigger only then.
let locks = 0;
let savedWorkspace, savedInert, savedOverflow, savedFocus;
function lockWorkspace() {
  if (locks++ === 0) {
    savedWorkspace = document.querySelector('.workspace');
    savedInert = savedWorkspace?.inert;
    savedOverflow = document.body.style.overflow;
    savedFocus = document.activeElement;
    if (savedWorkspace) savedWorkspace.inert = true;
    document.body.style.overflow = 'hidden';
  }
  return () => {
    if (--locks === 0) {
      document.body.style.overflow = savedOverflow;
      if (savedWorkspace) savedWorkspace.inert = savedInert;
      if (savedFocus?.isConnected) savedFocus.focus();
    }
  };
}

export default function Dialog({ title, onClose, children }) {
  const reduced = useReducedMotion();
  const present = useIsPresent();
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  const id = useId();
  closeRef.current = onClose;
  useEffect(() => {
    const unlock = lockWorkspace();
    const dialog = ref.current;
    dialog.querySelectorAll('label').forEach((label, index) => {
      const control = label.querySelector('input, select, textarea, button[role=combobox]') || label.parentElement.querySelector('input, select, textarea, button[role=combobox]');
      if (control && !label.htmlFor) {
        if (!control.id) control.id = id + '-field-' + index;
        label.htmlFor = control.id;
      }
    });
    const controls = () => [...dialog.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')].filter(el => el.getClientRects().length);
    const frame = requestAnimationFrame(() => (controls()[0] || dialog).focus());
    const onKey = e => {
      if (e.key === 'Escape' && !e.target.closest('[role=combobox][aria-expanded=true]')) { e.preventDefault(); closeRef.current(); }
      if (e.key === 'Tab') {
        const items = controls();
        const first = items[0], last = items[items.length - 1];
        if (!first) { e.preventDefault(); return; }
        if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog)) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    dialog.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(frame);
      dialog.removeEventListener('keydown', onKey);
      unlock();
    };
  }, [id]);
  return createPortal(<m.div ref={ref} role="dialog" aria-modal={present} aria-hidden={!present} inert={!present} aria-label={title} tabIndex={-1}
    initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: reduced ? 0 : 0.28 }}
    exit={{ opacity: 0, transition: { duration: reduced ? 0 : 0.18 } }}
    className="modal-overlay flex items-center justify-center" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <MotionSurface className="dialog-motion" distance={14} exit={{ opacity: 0, y: 8, transition: { duration: reduced ? 0 : 0.18 } }}>{children}</MotionSurface>
  </m.div>, document.body);
}

