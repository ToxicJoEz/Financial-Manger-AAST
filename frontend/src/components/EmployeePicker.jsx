import { useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// A searchable dropdown (employees, levels…). The list floats above the page, like the plain dropdowns: it is drawn
// in a layer of its own, so opening and closing it never changes the size of the window or page it sits in.
export default function EmployeePicker({ value, onChange, options = [], placeholder = 'Search employees by name or ID…', required = false, disabled = false, id }) {
  const generated = useId(), inputId = id || generated;
  const input = useRef(null);
  const [query, setQuery] = useState(''), [open, setOpen] = useState(false), [active, setActive] = useState(0), [position, setPosition] = useState(null);
  const selected = options.find(option => String(option.value) === String(value));
  const normalize = text => String(text).normalize('NFC').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').toLowerCase();
  const matching = options.filter(option => normalize(option.label).includes(normalize(query.trim())));
  const choose = option => { onChange(option.value); setQuery(''); setOpen(false); };
  const target = input.current?.closest('[role="dialog"]') || document.body;
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      if (!input.current) return;
      const box = input.current.getBoundingClientRect(), below = window.innerHeight - box.bottom - 12, above = box.top - 12;
      const down = below >= 240 || below >= above;
      setPosition({ left: Math.max(8, Math.min(box.left, window.innerWidth - box.width - 8)), width: Math.min(box.width, window.innerWidth - 16), maxHeight: Math.max(120, Math.min(240, down ? below : above)), ...(down ? { top: box.bottom + 6 } : { bottom: window.innerHeight - box.top + 6 }) });
    };
    place();
    const frame = requestAnimationFrame(place), settled = setTimeout(place, 450);
    window.addEventListener('resize', place);
    document.addEventListener('scroll', place, true);
    return () => { cancelAnimationFrame(frame); clearTimeout(settled); window.removeEventListener('resize', place); document.removeEventListener('scroll', place, true); };
  }, [open]);
  return <div className="employee-search-picker">
    <input ref={input} id={inputId} className="input-field" role="combobox" aria-label={id ? undefined : placeholder} aria-expanded={open} aria-controls={open ? `${inputId}-list` : undefined} aria-autocomplete="list" aria-activedescendant={open && matching[active] ? `${inputId}-${active}` : undefined} autoComplete="off" required={required} disabled={disabled} placeholder={placeholder} value={open ? query : selected?.label || ''}
      onFocus={() => { setOpen(true); setQuery(''); setActive(0); }} onBlur={() => setOpen(false)}
      onChange={e => { setQuery(e.target.value); setActive(0); if (value) onChange(''); }}
      onKeyDown={e => {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(false); }
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setOpen(true); setActive(n => Math.max(0, Math.min(matching.length - 1, n + (e.key === 'ArrowDown' ? 1 : -1)))); }
        if (e.key === 'Enter' && open) { e.preventDefault(); if (matching[active]) choose(matching[active]); }
      }} />
    {open && createPortal(<div role="listbox" id={`${inputId}-list`} className="employee-search-results is-floating" style={{ position: 'fixed', visibility: position ? 'visible' : 'hidden', ...position }} onMouseDown={e => e.preventDefault()}>
      {matching.length ? matching.map((option, index) => <button type="button" role="option" id={`${inputId}-${index}`} key={option.value} aria-selected={option.value === value} className={index === active ? 'is-active' : ''} onMouseDown={e => e.preventDefault()} onClick={() => choose(option)}>{option.label}</button>) : <p>No matches</p>}
    </div>, target)}
    {required && !value && <input className="themed-select-validity" tabIndex={-1} aria-hidden="true" required value="" onChange={() => {}} onInvalid={e => { e.preventDefault(); document.getElementById(inputId)?.focus(); }} />}
  </div>;
}
