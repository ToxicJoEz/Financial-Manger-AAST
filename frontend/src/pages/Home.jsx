import { useContext, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { ArrowRight, ArrowUpRight, BookOpen, CalendarDays, CheckCheck, Clock3, Plus, Users, Wallet, Building2, CircleHelp } from 'lucide-react';
import { AuthContext } from '../context/AuthContext';
import { PageHeading, Metric, EmptyState, Status, money, localMonth } from '../components/WorkspaceUI';
import { getBranchColor } from '../utils/branchColors';
export default function Home() {
  const {
    user
  } = useContext(AuthContext);
  const manager = ['admin', 'mod'].includes(user.role);
  const [state, setState] = useState({
    courses: [],
    finances: null,
    loading: true,
    error: false
  });
  const month = localMonth();
  const load = async () => {
    setState(s => ({
      ...s,
      loading: true,
      error: false
    }));
    try {
      const [courses, finances] = await Promise.all([axios.get('/cycles'), manager ? axios.get(`/finances?month=${month}`) : Promise.resolve(null)]);
      setState({
        courses: courses.data.filter(course => !course.archivedAt),
        finances: finances?.data,
        loading: false,
        error: false
      });
    } catch {
      setState(s => ({
        ...s,
        loading: false,
        error: true
      }));
    }
  };
  useEffect(() => {
    load();
  }, [manager, month]);
  const {
    courses,
    finances,
    loading,
    error
  } = state;
  const active = courses.filter(c => !c.isFinished);
  const pending = courses.flatMap(c => (c.pendingAssignments || []).filter(p => manager || p.submittedById === user.id).map(p => ({
    ...p,
    course: c
  })));
  const unassigned = active.filter(c => !c.instructors.length);
  const recent = [...courses].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)).slice(0, 5);
  const paid = finances?.summary.totalPaid || 0;
  const total = finances?.summary.totalPayroll || 0;
  const percent = total > 0 ? Math.round(paid / total * 100) : 0;
  const instructors = new Set(courses.flatMap(c => c.instructors.map(i => i.instructorId)));
  const branches = Object.entries(courses.reduce((map, c) => {
    map[c.branch] = (map[c.branch] || 0) + 1;
    return map;
  }, {})).sort((a, b) => b[1] - a[1]);
  const dateLabel = new Date().toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
  const monthLabel = new Date(`${month}-01T12:00:00`).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric'
  });
  const firstName = user.firstName || user.username;
  return <div className="overview-page">
    <PageHeading eyebrow="Your day, at a glance" title={`Welcome back, ${firstName}.`} description="Here’s what’s happening with your courses and payroll.">
      <span className="date-label"><CalendarDays size={16} />{dateLabel}</span>
      {manager && <Link className="btn-primary" to="/courses/cycles" state={{
        create: true
      }}><Plus size={17} />New course</Link>}
    </PageHeading>
    {error ? <section className="panel"><EmptyState title="Let’s try that again" description="We couldn’t load your overview. Check your connection and refresh." icon={CircleHelp}><button className="btn-primary" onClick={load}>Try again</button></EmptyState></section> : loading ? <div className="loading-state"><span className="loading-spinner" />Getting your workspace ready…</div> : <>
      <div className="home-summary">
        <section className="balance-card">
          <div className="balance-top"><span><Wallet size={17} />{manager ? 'Payroll snapshot' : 'Course snapshot'}</span><span className="balance-period">{manager ? monthLabel : 'All branches'}</span></div>
          <div className="balance-body"><div><div className="balance-label">{manager ? 'Total monthly payroll' : 'Cycles across the academy'}</div><div className="balance-amount">{manager ? money(total) : courses.length}<span>{manager ? 'EGP' : 'cycles'}</span></div><Link to={manager ? '/finances' : '/courses'} className="balance-link">{manager ? 'View payroll' : 'Explore courses'}<ArrowUpRight size={17} /></Link></div>
            <div className="payroll-ring" style={{
              '--progress': `${manager ? percent : courses.length ? Math.round((courses.length - active.length) / courses.length * 100) : 0}%`
            }} aria-label={manager ? `${percent}% of payroll paid` : 'Course completion'}><div><strong>{manager ? percent : courses.length ? Math.round((courses.length - active.length) / courses.length * 100) : 0}<small>%</small></strong><span>{manager ? 'paid' : 'completed'}</span></div></div>
          </div>
          <div className="balance-legend"><span><i />{manager ? 'Paid' : 'Completed'}<strong>{manager ? money(paid) + ' EGP' : courses.length - active.length}</strong></span><span><i />{manager ? 'Outstanding' : 'Active'}<strong>{manager ? money(finances?.summary.totalUnpaid) + ' EGP' : active.length}</strong></span></div>
        </section>
        <Metric tone="blue" icon={BookOpen} label="Active courses" value={String(active.length).padStart(2, '0')} detail={`${courses.length} courses in your workspace`}><div className="metric-footer"><span className="micro-bar"><i style={{
                "--runtime-width": `${courses.length ? active.length / courses.length * 100 : 0}%`
              }} className="home-presentation-12" /></span><Link to="/courses/cycles" state={{
              status: 'active'
            }} aria-label="View active courses"><ArrowUpRight size={17} /></Link></div></Metric>
        <Metric tone="peach" icon={Users} label="Teaching team" value={String(instructors.size).padStart(2, '0')} detail="Instructors assigned to courses"><div className="metric-footer"><div className="avatar-stack">{[...new Map(courses.flatMap(c => c.instructors.map(i => [i.instructorId, i.instructor.name]))).values()].slice(0, 3).map((name, index) => <span key={name} style={{
                '--avatar-color': ['#dee5fe', '#ffdfca', '#d3efea'][index]
              }} title={name}>{name.slice(0, 1)}</span>)}</div><Link to={manager ? '/instructors' : '/courses'} aria-label="View teaching team"><ArrowUpRight size={17} /></Link></div></Metric>
      </div>
      <div className={`work-queue ${pending.length || unassigned.length ? 'has-work' : ''}`}><span className="queue-icon">{pending.length || unassigned.length ? <Clock3 size={21} /> : <CheckCheck size={21} />}</span><div><strong>{pending.length ? `${pending.length} assignment request${pending.length === 1 ? '' : 's'} ${manager ? 'ready for review' : 'awaiting review'}` : unassigned.length ? `${unassigned.length} course${unassigned.length === 1 ? '' : 's'} need an instructor` : 'Looking good. You’re all caught up.'}</strong><p>{pending.length ? 'A quick review keeps the teaching team moving.' : unassigned.length ? 'Find the right people for your next course.' : 'No pending assignments. Everything is moving along.'}</p></div><Link className="text-button" to="/courses/cycles" state={pending.length ? {
          status: 'pending',
          openReviewId: manager ? pending[0].id : null
        } : unassigned.length ? {
          status: 'unassigned'
        } : null}>{pending.length ? 'View requests' : 'View courses'}<ArrowRight size={16} /></Link></div>
      <div className="overview-columns">
        <section className="panel course-overview"><div className="panel-heading"><div><h2>Cycle activity</h2><p>The latest across your teaching team</p></div><Link className="subtle-button" to="/courses">View all<ArrowUpRight size={15} /></Link></div>
          {recent.length ? <div className="activity-list">{recent.map((c, index) => <Link key={c.id} className="activity-course" to={`/courses/${c.parentCourseId}`} state={{
              search: c.name
            }}><span className={`course-glyph glyph-${index % 4}`}><BookOpen size={21} strokeWidth={1.7} /></span><div className="activity-course-main"><strong>{c.name}</strong><span>{c.branch.replaceAll('-', ' ')}<i />{c.totalHours || '—'} hours<span className="activity-team"> · {c.instructors.length ? c.instructors.map(i => i.instructor.name).join(', ') : 'Unassigned'}</span></span></div><Status complete={c.isFinished}>{c.isFinished ? 'Completed' : 'In progress'}</Status><ArrowUpRight className="activity-arrow" size={17} /></Link>)}</div> : <EmptyState title="Your next course starts here" description="Create a course, add your teaching team, and keep everything connected."><Link to="/courses" className="btn-primary">Go to courses<ArrowRight size={16} /></Link></EmptyState>}
          <div className="panel-footnote"><span className="status-dot" />{courses.length} cycles · {branches.length} branches<span>Updated from your workspace</span></div>
        </section>
        <section className="panel campus-panel"><div className="panel-heading"><div><h2>Across the academy</h2><p>Cycle distribution by branch</p></div><span className="panel-icon"><Building2 size={19} /></span></div><div className="campus-total"><strong>{branches.length}</strong><span>connected<br />branches</span><div className="campus-pattern" aria-hidden="true"><i /><i /><i /><i /></div></div><div className="campus-bars">{branches.length ? branches.map(([branch, count]) => <Link to="/courses/cycles" state={{
              branch
            }} className="campus-row" key={branch}><div><span><i style={{
                    "--runtime-background": getBranchColor(branch)
                  }} className="home-presentation-13" />{branch.replaceAll('-', ' ')}</span><strong>{count}<small> cycles</small></strong></div><div className="campus-track"><span style={{
                  "--runtime-width": `${count / courses.length * 100}%`,
                  "--runtime-background": getBranchColor(branch)
                }} className="home-presentation-14" /></div></Link>) : <p className="muted">Your branches will appear as courses are added.</p>}</div><div className="campus-footer"><span>One academy. A shared view.</span><ArrowUpRight size={16} /></div></section>
      </div>
      <div className="overview-links"><Link to={manager ? "/courses" : "/courses/cycles"} state={manager ? {
          create: true
        } : {
          status: 'unassigned'
        }}><span className="quick-icon"><Plus size={20} /></span><div><strong>{manager ? 'Make room for what’s next' : 'Find your next assignment'}</strong><p>{manager ? 'Set up a new course in a few simple steps.' : 'Browse courses that need an instructor.'}</p></div><ArrowRight size={18} /></Link><Link to={manager ? '/finances' : '/profile'}><span className="quick-icon teal"><Wallet size={20} /></span><div><strong>{manager ? 'Close the month with clarity' : 'A workspace that feels like you'}</strong><p>{manager ? 'Review teaching hours and settle course payments.' : 'Keep your profile and account details up to date.'}</p></div><ArrowRight size={18} /></Link></div>
    </>}
  </div>;
}
