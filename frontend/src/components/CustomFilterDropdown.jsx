import EmployeePicker from './EmployeePicker';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import '../styles/_customSelect.scss';
function Dropdown({ value, onChange, options, placeholder = 'Select an option', allowClear = true, id: providedId, required = false, disabled = false, className = '', searchable = false }) {
  const generatedId = useId(), id = providedId || generatedId;
  const trigger = useRef(null), menu = useRef(null), search = useRef({ text: '', time: 0 });
  const [open, setOpen] = useState(false), [active, setActive] = useState(0), [position, setPosition] = useState(null);
  const items = allowClear ? [{ value: '', label: placeholder }, ...options] : options;
  const selected = items.findIndex(item => String(item.value) === String(value ?? ''));
  const target = trigger.current?.closest('[role="dialog"]') || document.body;
  const close = () => setOpen(false);
  const show = () => { if (!disabled) { setActive(Math.max(0, selected)); setOpen(true); } };
  const choose = index => { if (items[index] && !items[index].disabled) { onChange(items[index].value); close(); trigger.current?.focus(); } };
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const box = trigger.current.getBoundingClientRect(), below = window.innerHeight - box.bottom - 12, above = box.top - 12;
      const down = below >= Math.min(280, items.length * 40 + 12) || below >= above;
      const height = Math.max(0, Math.min(280, down ? below : above));
      setPosition({ position: 'fixed', left: Math.max(8, Math.min(box.left, window.innerWidth - box.width - 8)), width: Math.min(box.width, window.innerWidth - 16), maxHeight: height, ...(down ? { top: box.bottom + 6 } : { bottom: window.innerHeight - box.top + 6 }) });
    };
    place();
    // Recheck once the popup entrance has settled; transforms do not trigger resize.
    const frame = requestAnimationFrame(place);
    const settled = window.setTimeout(place, 450);
    const observer = new ResizeObserver(place);
    observer.observe(trigger.current);
    const dismiss = event => { if (!trigger.current?.contains(event.target) && !menu.current?.contains(event.target)) close(); };
    const scroll = event => { if (!menu.current?.contains(event.target)) place(); };
    document.addEventListener('pointerdown', dismiss);
    window.addEventListener('resize', place);
    document.addEventListener('scroll', scroll, true);
    return () => { cancelAnimationFrame(frame); clearTimeout(settled); observer.disconnect(); document.removeEventListener('pointerdown', dismiss); window.removeEventListener('resize', place); document.removeEventListener('scroll', scroll, true); };
  }, [open, items.length]);
  useEffect(() => { if (open) menu.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' }); }, [open, active]);
  function keyDown(event) {
    const key = event.key;
    if (key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); close(); return; }
    if (key === 'Tab') { close(); return; }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(key)) {
      event.preventDefault();
      if (!open) { show(); return; }
      setActive(index => key === 'Home' ? 0 : key === 'End' ? items.length - 1 : (index + (key === 'ArrowDown' ? 1 : -1) + items.length) % items.length);
    } else if (key === 'Enter' || key === ' ') { event.preventDefault(); if (open) choose(active); else show(); }
    else if (key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      const now = Date.now(); search.current.text = (now - search.current.time < 600 ? search.current.text : '') + key.toLowerCase(); search.current.time = now;
      const index = items.findIndex(item => String(item.label).toLowerCase().startsWith(search.current.text));
      if (index >= 0) { if (!open) show(); setActive(index); }
    }
  }
  return <div className={`themed-select ${className}`}>
    <button ref={trigger} id={id} className="select-control themed-select-trigger" type="button" role="combobox" aria-label={providedId ? undefined : placeholder} aria-expanded={open} aria-controls={open ? `${id}-list` : undefined} aria-activedescendant={open ? `${id}-option-${active}` : undefined} aria-haspopup="listbox" aria-required={required || undefined} disabled={disabled} onClick={() => open ? close() : show()} onKeyDown={keyDown} onBlur={event => { if (!menu.current?.contains(event.relatedTarget)) close(); }}>
      <span className={!value ? 'themed-select-placeholder' : ''}>{selected >= 0 ? items[selected].label : placeholder}</span><ChevronDown size={15} className={open ? 'is-open' : ''} />
    </button>
    {required && <input className="themed-select-validity" tabIndex={-1} aria-hidden="true" required disabled={disabled} value={value || ''} onChange={() => {}} onInvalid={event => { event.preventDefault(); trigger.current?.focus(); }} />}
    {/* Fixed from the first render: a portal inside a flex dialog must never affect its layout. */}
    {open && createPortal(<div ref={menu} id={`${id}-list`} role="listbox" aria-label={placeholder} className="themed-select-menu" style={{ position: 'fixed', visibility: position ? 'visible' : 'hidden', ...position }} onMouseDown={event => event.preventDefault()}>{items.map((item, index) => <div id={`${id}-option-${index}`} key={item.value} role="option" data-index={index} aria-selected={String(item.value) === String(value ?? '')} aria-disabled={item.disabled || undefined} className={`themed-select-option ${index === active ? 'is-active' : ''}`} onPointerMove={() => setActive(index)} onClick={() => choose(index)}><span>{item.label}</span>{String(item.value) === String(value ?? '') && <Check size={15} />}</div>)}</div>, target)}
  </div>;
}

export default function CustomFilterDropdown(props){return props.searchable?<EmployeePicker {...props}/>:<Dropdown {...props}/>;}
