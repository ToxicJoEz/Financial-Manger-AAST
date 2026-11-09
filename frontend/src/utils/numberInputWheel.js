// Browsers change a focused <input type="number"> when the mouse wheel scrolls over it, which silently
// edits amounts. Releasing focus on wheel lets the page scroll instead and keeps the value unchanged.
// Typing and arrow keys still work, and the fields still accept numbers only.
export function guardNumberInputsFromWheel(target = document) {
  const onWheel = event => {
    const input = event.target;
    if (input instanceof HTMLInputElement && input.type === 'number' && input === document.activeElement) input.blur();
  };
  target.addEventListener('wheel', onWheel, { capture: true, passive: true });
  return () => target.removeEventListener('wheel', onWheel, { capture: true });
}
