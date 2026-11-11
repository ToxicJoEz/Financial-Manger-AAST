import PrivateBadge from '../PrivateBadge';
import { AnimatePresence } from 'framer-motion';
import Dialog from '../Dialog';
import { BookOpen, X } from 'lucide-react';
import { CourseDetail } from './CourseDetail';

export default function CycleDetailsModal(props) {
 const {course,expanded,onExpand}=props;
 return <AnimatePresence>{expanded && <Dialog title={course.name} onClose={onExpand}><div className="modal-content card course-detail-modal"><div className="detail-modal-heading"><span className="course-tile-icon"><BookOpen size={23} /></span><div><span className="eyebrow">{course.branch}</span><h2>{props.editForm ? 'Edit cycle details' : 'Cycle details'}</h2></div><button className="icon-button" aria-label="Close cycle details" onClick={onExpand}><X size={20} /></button></div>{props.editForm ? <div className="cycle-edit-view"><div className="cycle-edit-intro"><h3>{course.name}<PrivateBadge record={course}/></h3><p>Update this cycle’s details, location and schedule.</p></div>{props.editForm}</div> : <CourseDetail {...props} onEdit={props.onEdit} onPermanentDelete={() => { onExpand(); props.onPermanentDelete(); }} onDelete={() => {
            onExpand();
            props.onDelete();
          }} onRevert={() => {
            onExpand();
            props.onRevert();
          }} onReview={pa => {
            onExpand();
            props.onReview(pa);
          }} onFinish={() => {
            onExpand();
            props.onFinish();
          }} onAssign={() => {
            onExpand();
            props.onAssign();
          }} onRemove={id => {
            onExpand();
            props.onRemove(id);
          }} onNextLevel={() => {
            onExpand();
            props.onNextLevel?.();
          }} onEnroll={() => {
            props.onEnroll();
          }} onEditEnrollment={enr => {
            props.onEditEnrollment(enr);
          }} onRemoveEnrollment={enr => {
            props.onRemoveEnrollment(enr);
          }} />}</div></Dialog>}</AnimatePresence>;
}

