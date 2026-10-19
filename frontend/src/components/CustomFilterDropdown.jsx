import { useId } from 'react';
export default function CustomFilterDropdown({ value, onChange, options, placeholder = 'Select an option', allowClear = true, id: providedId }) {
  const generatedId = useId();
  const id = providedId || generatedId;
  return <select id={id} className="select-control" aria-label={placeholder} value={value || ''} onChange={e => onChange(e.target.value)}>
    {allowClear && <option value="">{placeholder}</option>}
    {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
  </select>;
}

