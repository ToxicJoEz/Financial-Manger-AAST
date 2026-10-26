import PrivateBadge from './PrivateBadge';
import { useContext, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { ArrowLeft, BookOpen, CalendarDays, ChevronRight, GraduationCap, MapPin, X } from 'lucide-react';
import Dialog from './Dialog';
import { AuthContext } from '../context/AuthContext';
import { money, Status } from './WorkspaceUI';
import { CourseDetail } from '../pages/Courses';
import { getBranchColor } from '../utils/branchColors';
import '../styles/_studentDetails.scss';
const date = value => value ? new Date(value).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}) : 'Not set';
export default function StudentDetailsDialog({ studentId, onClose }) {
  const { user }=useContext(AuthContext);
  const [data,setData]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[retry,setRetry]=useState(0);
  const [filter,setFilter]=useState('all'),[cycleId,setCycleId]=useState(null),[cycle,setCycle]=useState(null),[cycleLoading,setCycleLoading]=useState(false),[cycleError,setCycleError]=useState('');
  const panel=useRef(null), savedScroll=useRef(0);
  useEffect(()=>{
    const controller=new AbortController();setLoading(true);setError('');
    axios.get('/students/'+studentId,{signal:controller.signal}).then(({data})=>{if(!controller.signal.aborted)setData(data);}).catch(e=>{if(!controller.signal.aborted)setError(e.response?.data?.error || 'Student details could not be loaded.');}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return ()=>controller.abort();
  },[studentId,retry]);
  useEffect(()=>{
    if(!cycleId)return;
    const controller=new AbortController();setCycleLoading(true);setCycleError('');setCycle(null);
    axios.get('/cycles/'+cycleId,{signal:controller.signal}).then(({data})=>{if(!controller.signal.aborted)setCycle(data);}).catch(e=>{if(!controller.signal.aborted)setCycleError(e.response?.data?.error || 'Cycle details could not be loaded.');}).finally(()=>{if(!controller.signal.aborted)setCycleLoading(false);});
    return ()=>controller.abort();
  },[cycleId,retry]);
  const all=data?.enrollments || [];
  const ongoing=row=>!row.course.isFinished && !row.course.archivedAt && !row.course.parentCourse?.archivedAt && !row.deletedAt && !row.financialArchivedAt;
  const rows=all.filter(row=>filter==='all' || (filter==='ongoing' ? ongoing(row) : row.course.isFinished));
  const groups=Object.values(rows.reduce((groups,row)=>{const parent=row.course.parentCourse;const group=groups[parent.id] ||= {parent,rows:[]};group.rows.push(row);return groups;},{}));
  const back=()=>{setCycleId(null);requestAnimationFrame(()=>{if(panel.current){panel.current.scrollTop=savedScroll.current;[...panel.current.querySelectorAll('.student-cycle-link')].find(el=>el.dataset.cycleId===cycleId)?.focus({preventScroll:true});}});};
  const openCycle=id=>{savedScroll.current=panel.current?.scrollTop || 0;setCycleId(id);setCycleLoading(true);if(panel.current)panel.current.scrollTop=0;requestAnimationFrame(()=>panel.current?.querySelector('.student-back-button')?.focus({preventScroll:true}));};
  const person=data?.student;
  return <Dialog title="Student details" onClose={onClose}><div ref={panel} className="modal-content card course-detail-modal student-profile-modal">
    <div className="detail-modal-heading"><span className="course-tile-icon">{cycleId ? <BookOpen size={23}/> : <GraduationCap size={23}/>}</span><div><span className="eyebrow">{cycleId ? cycle?.branch || 'CYCLE' : 'STUDENT RECORD'}</span><h2>{cycleId ? 'Cycle details' : 'Student details'}</h2></div><button type="button" className="icon-button" aria-label="Close student details" onClick={onClose}><X size={20}/></button></div>
    {cycleId ? <><button type="button" className="student-back-button" onClick={back}><ArrowLeft size={16}/>Back to student</button>{cycleLoading ? <div className="loading-state" role="status"><span className="loading-spinner"/>Loading cycle details…</div> : cycleError ? <div className="empty-state"><p role="alert">{cycleError}</p><button type="button" className="btn-secondary" onClick={()=>setRetry(n=>n+1)}>Try again</button></div> : cycle && <CourseDetail course={cycle} user={user} readOnly/>}</> : loading ? <div className="loading-state" role="status"><span className="loading-spinner"/>Loading student details…</div> : error ? <div className="empty-state"><p role="alert">{error}</p><button type="button" className="btn-secondary" onClick={()=>setRetry(n=>n+1)}>Try again</button></div> : person && <>
      <div className="student-profile-identity"><div><span className="eyebrow">REGISTRATION {person.registrationNumber||'Not issued'}</span><h3 dir="auto">{person.name}</h3>{person.englishName && <p>{person.englishName}</p>}</div>{person.deletedAt && <span className="deleted-tag">Archived student</span>}</div>
      <dl className="student-profile-facts">{[['Mobile',person.mobile],['Date of birth',person.dateOfBirth ? date(person.dateOfBirth) : null],['Nationality',person.nationality],['Place of birth',person.placeOfBirth]].map(([label,value])=><div key={label}><dt>{label}</dt><dd dir="auto">{value || 'Not recorded'}</dd></div>)}</dl>
      <div className="student-cycle-heading"><div><h3>Enrolled cycles</h3><p>Explore this student’s courses and enrollment history.</p></div><span>{all.length} {all.length===1?'cycle':'cycles'}</span></div>
      <div className="student-cycle-filters" aria-label="Filter student cycles">{[['all','All',all.length],['ongoing','Ongoing',all.filter(ongoing).length],['completed','Completed',all.filter(row=>row.course.isFinished).length]].map(([value,label,count])=><button type="button" key={value} aria-pressed={filter===value} className={filter===value?'active':''} onClick={()=>setFilter(value)}>{label}<span>{count}</span></button>)}</div>
      {!rows.length ? <div className="empty-state"><BookOpen size={28}/><h3>{all.length ? `No ${filter} cycles` : 'No enrollments yet'}</h3><p>{all.length ? 'Choose another filter to see their other cycles.' : 'This student has not been enrolled in a cycle.'}</p></div> : <div className="student-course-groups">{groups.map(group=><section key={group.parent.id}><div className="student-umbrella-heading"><BookOpen size={18}/><h4>{group.parent.name}<PrivateBadge record={group.parent}/></h4><span>{group.parent.code}</span></div><div className="student-cycle-list">{group.rows.map(row=>{const c=row.course,history=row.deletedAt || row.financialArchivedAt;return <button type="button" className="student-cycle-link" data-cycle-id={c.id} key={row.id} aria-label={`View ${c.name} details`} onClick={()=>openCycle(c.id)}><div className="student-cycle-top"><strong>{c.name}<PrivateBadge record={c}/></strong><Status complete={c.isFinished}>{c.archivedAt || c.parentCourse.archivedAt ? 'Archived' : c.isFinished ? 'Completed' : 'Ongoing'}</Status><ChevronRight size={17}/></div><div className="student-cycle-meta"><span style={{'--branch-color':getBranchColor(c.branch)}}><MapPin size={13}/>{c.branch}</span><span><CalendarDays size={13}/>{date(c.startDate)} – {date(c.endDate)}</span></div><div className="student-cycle-payments"><span>Tuition <b>{money(row.amountPaid)} EGP</b>{row.status==='EXEMPT' && <small>Exempt</small>}</span><span className={`student-book-chip book-${(row.books?.status || 'UNPAID').toLowerCase()}`}>Books: {row.books?.status==='PAID'?`Paid · ${money(row.books.amount)} EGP`:row.books?.status==='EXEMPT'?'Not required':'Not paid yet'}</span>{history && <span className="deleted-tag">{row.financialArchivedAt?'Finances archived':'Removed enrollment'}</span>}</div></button>;})}</div></section>)}</div>}
    </>}
  </div></Dialog>;
}
