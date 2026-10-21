export function classTimeLabel(cycle) {
  if (!cycle.classStartTime || !cycle.classEndTime) return '';
  const label = value => { const [h, m] = value.split(':').map(Number); return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };
  return `${label(cycle.classStartTime)} – ${label(cycle.classEndTime)}`;
}
export default function CycleScheduleFields({ value, onChange }) {
  return <fieldset className="cycle-schedule-fields"><legend>Class location & time <small>Optional</small></legend>
    <label>Venue / room<input className="input-field" maxLength={160} placeholder="e.g. Room 501 or A201" value={value.venue || ''} onChange={e => onChange({ ...value, venue: e.target.value })}/></label>
    <div className="cycle-time-inputs"><label>Class starts<input className="input-field" type="time" required={!!value.classEndTime} value={value.classStartTime || ''} onChange={e => onChange({ ...value, classStartTime: e.target.value })}/></label><label>Class ends<input className="input-field" type="time" required={!!value.classStartTime} min={value.classStartTime || undefined} value={value.classEndTime || ''} onChange={e => onChange({ ...value, classEndTime: e.target.value })}/></label></div>
  </fieldset>;
}
