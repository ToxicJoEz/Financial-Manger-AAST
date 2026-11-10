import { useContext, useEffect, useState } from 'react';
import axios from 'axios';
import { BookOpen, X } from 'lucide-react';
import Dialog from './Dialog';
import { AuthContext } from '../context/AuthContext';
import { CourseDetail } from './courses/CourseDetail';
import '../styles/_studentDetails.scss';

// A cycle's details in a pop-up (read-only), opened from lists such as Checks.
export default function CycleDetailsDialog({ cycleId, onClose }) {
  const { user } = useContext(AuthContext);
  const [cycle, setCycle] = useState(null),
    [error, setError] = useState(''),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    axios
      .get('/cycles/' + cycleId, { signal: controller.signal })
      .then(({ data }) => setCycle(data))
      .catch(e => {
        if (!controller.signal.aborted) setError(e.response?.data?.error || 'Cycle details could not be loaded.');
      });
    return () => controller.abort();
  }, [cycleId, retry]);
  return <Dialog title="Cycle details" onClose={onClose}><div className="modal-content card course-detail-modal student-profile-modal">
    <div className="detail-modal-heading"><span className="course-tile-icon"><BookOpen size={23} /></span><div><span className="eyebrow">{cycle?.branch || 'CYCLE'}</span><h2>{cycle?.name || 'Cycle details'}</h2></div><button type="button" className="icon-button" aria-label="Close cycle details" onClick={onClose}><X size={20} /></button></div>
    {error ? <div className="empty-state"><p role="alert">{error}</p><button type="button" className="btn-secondary" onClick={() => { setError(''); setCycle(null); setRetry(n => n + 1); }}>Try again</button></div> : !cycle ? <div className="loading-state" role="status"><span className="loading-spinner" />Loading cycle details…</div> : <CourseDetail course={cycle} user={user} readOnly />}
  </div></Dialog>;
}
