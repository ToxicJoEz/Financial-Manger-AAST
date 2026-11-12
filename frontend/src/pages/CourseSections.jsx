import { useContext, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { ArrowUpRight, ArrowRight, Layers } from 'lucide-react';
import { AuthContext } from '../context/AuthContext';
import { PageHeading, EmptyState } from '../components/WorkspaceUI';
import { MotionRegion } from '../components/WorkspaceMotion';
import AnimatedNumber from '../components/AnimatedNumber';
import { branchName } from '../utils/access';
import { SECTIONS, useCourseBranch, CourseBranchPicker, openInBranch, countsFor } from '../components/courses/CourseSection';

const whole = n => Math.round(n).toLocaleString();
// The Courses home: two fixed sections, Group and Private, each holding its own umbrellas.
export default function CourseSections() {
  const { user } = useContext(AuthContext);
  const picker = useCourseBranch(user);
  const { branch, ownBranches } = picker;
  const [courses, setCourses] = useState(null),
    [error, setError] = useState(false);
  const load = () =>
    axios
      .get('/courses')
      .then(({ data }) => {
        setCourses(data);
        setError(false);
      })
      .catch(() => setError(true));
  useEffect(() => {
    load();
  }, []);
  // Links into Courses with a status, search or review open go straight to the cycle list.
  const location = useLocation(),
    navigate = useNavigate();
  useEffect(() => {
    const state = location.state;
    if (state?.status || state?.search || state?.openReviewId) navigate('/courses/cycles', { state, replace: true });
  }, [location.state, navigate]);
  const summary = key => {
    const list = (courses || []).filter(c => !c.archivedAt && Boolean(c.isPrivate) === (key === 'private') && openInBranch(c, branch, ownBranches));
    return list.reduce(
      (sum, c) => {
        const n = countsFor(c, branch);
        return { umbrellas: sum.umbrellas + 1, active: sum.active + n.active, completed: sum.completed + n.completed };
      },
      { umbrellas: 0, active: 0, completed: 0 }
    );
  };
  return <div className="courses-page course-sections">
    <PageHeading eyebrow="The course collection" title="Courses" description={branch ? `Group and private courses open in ${branchName(branch)}.` : 'Group and private courses, each in its own place.'}>
      <CourseBranchPicker user={user} {...picker} />
    </PageHeading>
    {user.role === 'user' && !user.branches && <div className="panel empty-state no-branches-note"><h3>No branches assigned yet</h3><p>Ask the main mod or an admin to choose the branches you can view. Courses and students will appear here then.</p></div>}
    {error ? <EmptyState title="Courses could not be loaded" description="Check your connection and try again."><button className="btn-secondary" onClick={load}>Try again</button></EmptyState> : <MotionRegion transitionKey="sections"><div className="section-cards">
      {Object.values(SECTIONS).map(section => {
        const Icon = section.icon;
        const n = summary(section.key);
        const stat = (value, one, many) => <span>{courses ? <strong><AnimatedNumber value={value} format={whole} /></strong> : <strong>–</strong>}{value === 1 ? one : many}</span>;
        return <Link key={section.key} to={section.path} className={`section-card is-${section.key}`}>
          <Icon className="section-watermark" strokeWidth={1.4} aria-hidden="true" focusable="false" />
          <div className="section-card-body">
            <div className="section-card-head"><span className="section-card-icon"><Icon size={24} strokeWidth={1.9} /></span><span className="section-card-count">{courses ? `${n.umbrellas} ${n.umbrellas === 1 ? 'umbrella' : 'umbrellas'}` : '…'}</span><ArrowUpRight size={21} className="section-card-arrow" /></div>
            <h2>{section.label}</h2>
            <p>{section.blurb}</p>
            <div className="section-card-stats" aria-busy={!courses}>
              <Layers size={16} aria-hidden="true" />
              {stat(n.active, ' active cycle', ' active cycles')}
              {stat(n.completed, ' completed', ' completed')}
            </div>
          </div>
          <span className="section-card-footer">Open {section.short.toLowerCase()} courses<ArrowRight size={15} /></span>
        </Link>;
      })}
    </div></MotionRegion>}
    <div className="section-cards-foot"><Link className="text-button" to="/courses/cycles">Every cycle in one list<ArrowUpRight size={15} /></Link></div>
  </div>;
}
