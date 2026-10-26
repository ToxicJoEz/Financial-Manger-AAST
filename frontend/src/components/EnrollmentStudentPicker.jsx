import { useEffect, useId, useState } from 'react';
import axios from 'axios';
import { Search, UserCheck, X, Check } from 'lucide-react';
export default function EnrollmentStudentPicker({ courseId, onChange, disabled }) {
  const id = useId();
  const [query,setQuery] = useState(''), [cursor,setCursor] = useState(null), [nextCursor,setNextCursor] = useState(null);
  const [seatFull,setSeatFull]=useState(false);
  const [rows,setRows] = useState([]), [selected,setSelected] = useState(null), [loading,setLoading] = useState(true), [error,setError] = useState(''), [retry,setRetry] = useState(0);
  useEffect(() => {
    if(selected) return;
    const controller = new AbortController();
    setLoading(true); setError('');
    const timer=setTimeout(async()=>{
      try {
        const {data}=await axios.get('/students',{params:{pickerCourseId:courseId,search:query,cursor:cursor || undefined},signal:controller.signal});
        if(controller.signal.aborted) return;
        setRows(previous=>cursor?[...previous,...data.students.filter(row=>!previous.some(old=>old.id===row.id))]:data.students);
        setNextCursor(data.nextCursor);setSeatFull(Boolean(data.seatFull));
      } catch(e) {if(!controller.signal.aborted)setError(e.response?.data?.error || 'Students could not be loaded.');}
      finally {if(!controller.signal.aborted)setLoading(false);}
    },250);
    return ()=>{clearTimeout(timer);controller.abort();};
  },[courseId,query,cursor,selected,retry]);
  return <div className="enrollment-student-picker">
    {selected ? <div className="enrollment-selected-student"><UserCheck size={22}/><div><strong dir="auto">{selected.name}</strong><small>Registration {selected.registrationNumber||'Not issued'}{selected.mobile ? ` · ${selected.mobile}` : ''}</small></div><span className="enrollment-selected-label"><Check size={14}/>Selected</span><button type="button" className="icon-button" disabled={disabled} aria-label="Change selected student" onClick={()=>{setSelected(null);onChange('');setCursor(null);setRows([]);setLoading(true);}}><X size={17}/></button></div> : <>
      <label htmlFor={id}>Find a student <span className="required-star">*</span></label>
      <div className="search-field"><Search size={17}/><input id={id} autoComplete="off" disabled={disabled} placeholder="Search name, registration number or mobile…" value={query} onChange={e=>{setQuery(e.target.value);setCursor(null);setRows([]);setNextCursor(null);setLoading(true);}} /></div>
      <p className="enrollment-picker-hint">Only active students who aren’t already enrolled are shown.</p>
      <div className="enrollment-student-results" aria-label="Matching students" aria-busy={loading}>
        {error ? <div className="enrollment-picker-empty" role="alert">{error}<button type="button" className="text-button" onClick={()=>setRetry(n=>n+1)}>Try again</button></div> : <>{rows.map(student=><button type="button" className="enrollment-student-result" disabled={disabled || loading} key={student.id} onClick={()=>{setSelected(student);onChange(student.id);}}><span className="enrollment-student-avatar" dir="auto">{student.name.trim().split(/\s+/).slice(0,2).map(part=>part[0]).join(' ')}</span><span><strong dir="auto">{student.name}</strong>{student.englishName && <small>{student.englishName}</small>}<small>Reg: {student.registrationNumber||'Not issued'}{student.mobile ? ` · ${student.mobile}` : ''}</small></span><span className="enrollment-pick-label">Select</span></button>)}
        {loading ? <p className="enrollment-picker-empty" role="status">Searching students…</p> : !rows.length ? <p className="enrollment-picker-empty">{seatFull ? 'This private cycle already has a student. Refresh the cycle to review it.' : query.trim() ? 'No matching students. Try their registration number or another spelling.' : 'No students available to enroll.'}</p> : nextCursor && <button type="button" className="enrollment-more-results" onClick={()=>setCursor(nextCursor)}>Show more students</button>}</>}
      </div>
      {!selected && !loading && rows.length>0 && <small className="enrollment-picker-hint">{rows.length} shown{nextCursor ? ' · Refine your search to find someone faster.' : ''}</small>}
    </>}
  </div>;
}
