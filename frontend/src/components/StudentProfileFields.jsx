export const studentProfileFields = [{
  key: 'englishName',
  label: 'English name',
  type: 'text'
}, {
  key: 'dateOfBirth',
  label: 'Date of birth',
  type: 'date'
}, {
  key: 'nationality',
  label: 'Nationality',
  type: 'text'
}, {
  key: 'placeOfBirth',
  label: 'Place of birth',
  type: 'text'
}];
export default function StudentProfileFields({
  value,
  onChange,
  prefix
}) {
  return studentProfileFields.map(field => <div className="student-form-group" key={field.key}><label htmlFor={`${prefix}-${field.key}`}>{field.label}</label><input className="input-field" id={`${prefix}-${field.key}`} type={field.type} max={field.type === 'date' ? new Date().toISOString().slice(0, 10) : undefined} maxLength={200} value={value[field.key]?.slice?.(0, field.type === 'date' ? 10 : 200) || ''} onChange={e => onChange({
      ...value,
      [field.key]: e.target.value
    })} /></div>);
}
