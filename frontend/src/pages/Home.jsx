import { canSeePayroll } from '../utils/access';
import { cyclePath } from '../utils/cyclePath';
import PrivateBadge from '../components/PrivateBadge';
import '../styles/_yearOverview.scss';
import { useContext, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { ArrowRight, ArrowUpRight, BookOpen, CalendarDays, CheckCheck, Clock3, Plus, Users, Wallet, Building2, CircleHelp, ClipboardCheck, AlertTriangle } from 'lucide-react';
import { AuthContext } from '../context/AuthContext';
import { PageHeading, Metric, EmptyState, Status, money, localMonth } from '../components/WorkspaceUI';
import { getBranchColor } from '../utils/branchColors';
export default function Home() {
  const {
    user
  } = useContext(AuthContext);
  const manager = ['admin', 'mod'].includes(user.role);
  // Payroll figures are for admins and the main mod; branch mods see the course snapshot.
  const payroll = canSeePayroll(user);
  const [state, setState] = useState({
    overview: null,
    attention: null,
    finances: null,
    loading: true,
    error: false
  });
  const month = localMonth();
  const year = month.slice(0,4);
  const load = async () => {
    setState(s => ({
      ...s,
      loading: true,
      error: false
    }));
    try {
      const [courses, attention, finances] = await Promise.all([axios.get('/cycles/overview'), axios.get('/attention'), manager ? axios.get('/finances/overview', {params:{year}}) : Promise.resolve(null)]);
      setState({
        overview: courses.data,
        attention: attention.data,
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
    overview,
    attention,
    finances,
    loading,
    error
  } = state;
  // Figures come from /cycles/overview, computed in the database.
  const ov = overview || { total: 0, active: 0, completed: 0, instructorCount: 0, instructorNames: [], branches: [], recent: [], pending: { count: 0, firstId: null }, unassigned: 0 };
  const recent = ov.recent, branches = ov.branches;
  // "Needs your attention": only what applies to this user, only when there is something to do.
  const at = attention || {};
  const attentionCards = [
    payroll && at.pendingApprovals > 0 && { key: 'approvals', tone: 'accent', icon: ClipboardCheck, value: at.pendingApprovals, label: `request${at.pendingApprovals === 1 ? '' : 's'} to review`, to: '/courses/cycles', state: { status: 'pending' } },
    !payroll && at.myPendingRequests > 0 && { key: 'mine', tone: 'accent', icon: Clock3, value: at.myPendingRequests, label: `your request${at.myPendingRequests === 1 ? '' : 's'} awaiting review`, to: '/courses/cycles', state: { status: 'pending' } },
    at.moneyChecks && (at.moneyChecks.unchecked.count > 0 || at.moneyChecks.changed.count > 0) && { key: 'checks', tone: at.moneyChecks.changed.count ? 'danger' : 'warning', icon: AlertTriangle, value: `${money(at.moneyChecks.unchecked.amount)} EGP`, label: `Fouad money to check (${at.moneyChecks.unchecked.count} records${at.moneyChecks.changed.count ? `, ${at.moneyChecks.changed.count} changed` : ''})`, to: '/finances/checks' },
    payroll && at.processingPayments?.count > 0 && { key: 'processing', tone: 'warning', icon: Wallet, value: `${money(at.processingPayments.amount)} EGP`, label: 'salary waiting for payment confirmation', to: '/finances/payroll' },
    payroll && at.payrollDueCycles > 0 && { key: 'due', tone: 'warning', icon: Wallet, value: at.payrollDueCycles, label: `completed cycle${at.payrollDueCycles === 1 ? '' : 's'} not yet in a payment batch`, to: '/finances/payroll' },
    at.unassignedCycles > 0 && { key: 'unassigned', tone: 'accent', icon: Users, value: at.unassignedCycles, label: `active cycle${at.unassignedCycles === 1 ? '' : 's'} without an employee`, to: '/courses/cycles', state: { status: 'unassigned' } }
  ].filter(Boolean);
  const paid = finances?.payroll.totalPaid || 0;
  const dateLabel = new Date().toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit'
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
      <div className="attention-strip" aria-label="Needs your attention">{attentionCards.length ? attentionCards.map(card => <Link key={card.key} className={`attention-card tone-${card.tone}`} to={card.to} state={card.state}><span className="attention-icon"><card.icon size={19} /></span><div><strong>{card.value}</strong><span>{card.label}</span></div></Link>) : <div className="attention-card is-clear tone-accent"><span className="attention-icon"><CheckCheck size={19} /></span><div><strong>All caught up</strong><span>Nothing is waiting for you right now.</span></div></div>}</div>
      <div className={`home-summary ${manager ? 'has-year-finances' : ''}`}>
        <section className="balance-card">
          <div className="balance-top"><span><Wallet size={17} />{payroll ? 'Payroll snapshot' : 'Course snapshot'}</span><span className="balance-period">{payroll ? year : 'All branches'}</span></div>
          <div className="balance-body"><div><div className="balance-label">{payroll ? `Salary paid in ${year}` : 'Cycles across the academy'}</div><div className="balance-amount">{payroll ? money(paid) : ov.total}<span>{payroll ? 'EGP' : 'cycles'}</span></div><Link to={payroll ? '/finances/payroll' : '/courses'} className="balance-link">{payroll ? 'View payroll' : 'Explore courses'}<ArrowUpRight size={17} /></Link></div>
            {payroll ? <div className="annual-payroll-mark"><CalendarDays size={25}/><strong>{year}</strong><span>Actual payment year</span></div> : (<div className="payroll-ring" style={{
              '--progress': `${ov.total ? Math.round((ov.completed) / ov.total * 100) : 0}%`
            }} aria-label={'Course completion'}><div><strong>{ov.total ? Math.round((ov.completed) / ov.total * 100) : 0}<small>%</small></strong><span>completed</span></div></div>)}
          </div>
          <div className="balance-legend"><span><i/>{payroll ? "Employees paid" : 'Completed'}<strong>{payroll ? finances?.payroll.instructorsPaid || 0 : ov.total-ov.active}</strong></span><span><i/>{payroll ? 'Cycles paid' : 'Active'}<strong>{payroll ? finances?.payroll.cyclesPaid || 0 : ov.active}</strong></span></div>
        </section>
        {payroll && <section className="balance-card year-income-card"><div className="balance-top"><span><Wallet size={17}/>Income snapshot</span><span className="balance-period">{year}</span></div><div className="balance-body"><div><div className="balance-label">Income from cycles starting in {year}</div><div className="balance-amount">{money(finances?.income.total || 0)}<span>EGP</span></div><Link to="/finances/income" className="balance-link">View income<ArrowUpRight size={17}/></Link></div></div><div className="balance-legend"><span><i/>Tuition<strong>{money(finances?.income.tuition || 0)} EGP</strong></span><span><i/>Books<strong>{money(finances?.income.books || 0)} EGP</strong></span></div></section>}
        <Metric tone="blue" icon={BookOpen} label="Active courses" value={String(ov.active).padStart(2, '0')} detail={`${ov.total} courses in your workspace`}><div className="metric-footer"><span className="micro-bar"><i style={{
                "--runtime-width": `${ov.total ? ov.active / ov.total * 100 : 0}%`
              }} className="home-presentation-12" /></span><Link to="/courses/cycles" state={{
              status: 'active'
            }} aria-label="View active courses"><ArrowUpRight size={17} /></Link></div></Metric>
        <Metric tone="peach" icon={Users} label="Teaching team" value={String(ov.instructorCount).padStart(2, '0')} detail="Employees assigned to courses"><div className="metric-footer"><div className="avatar-stack">{ov.instructorNames.slice(0, 3).map((name, index) => <span key={name} style={{
                '--avatar-color': ['#dee5fe', '#ffdfca', '#d3efea'][index]
              }} title={name}>{name.slice(0, 1)}</span>)}</div><Link to={manager ? '/employees' : '/courses'} aria-label="View teaching team"><ArrowUpRight size={17} /></Link></div></Metric>
      </div>
      <div className="overview-columns">
        <section className="panel course-overview"><div className="panel-heading"><div><h2>Cycle activity</h2><p>The latest across your teaching team</p></div><Link className="subtle-button" to="/courses">View all<ArrowUpRight size={15} /></Link></div>
          {recent.length ? <div className="activity-list">{recent.map((c, index) => <Link key={c.id} className="activity-course" to={cyclePath(c)} state={{
              search: c.name
            }}><span className={`course-glyph glyph-${index % 4}`}><BookOpen size={21} strokeWidth={1.7} /></span><div className="activity-course-main"><strong>{c.name}<PrivateBadge record={c}/></strong><span>{c.branch.replaceAll('-', ' ')}<i />{c.totalHours || '—'} hours<span className="activity-team"> · {c.instructors.length ? c.instructors.map(i => i.instructor.name).join(', ') : 'Unassigned'}</span></span></div><Status complete={c.isFinished}>{c.isFinished ? 'Completed' : 'In progress'}</Status><ArrowUpRight className="activity-arrow" size={17} /></Link>)}</div> : <EmptyState title="Your next course starts here" description="Create a course, add your teaching team, and keep everything connected."><Link to="/courses" className="btn-primary">Go to courses<ArrowRight size={16} /></Link></EmptyState>}
          <div className="panel-footnote"><span className="status-dot" />{ov.total} cycles · {branches.length} branches<span>Updated from your workspace</span></div>
        </section>
        <section className="panel campus-panel"><div className="panel-heading"><div><h2>Across the academy</h2><p>Cycle distribution by branch</p></div><span className="panel-icon"><Building2 size={19} /></span></div><div className="campus-total"><strong>{branches.length}</strong><span>connected<br />branches</span><div className="campus-pattern" aria-hidden="true"><i /><i /><i /><i /></div></div><div className="campus-bars">{branches.length ? branches.map(([branch, count]) => <Link to="/courses/cycles" state={{
              branch
            }} className="campus-row" key={branch}><div><span><i style={{
                    "--runtime-background": getBranchColor(branch)
                  }} className="home-presentation-13" />{branch.replaceAll('-', ' ')}</span><strong>{count}<small> cycles</small></strong></div><div className="campus-track"><span style={{
                  "--runtime-width": `${count / ov.total * 100}%`,
                  "--runtime-background": getBranchColor(branch)
                }} className="home-presentation-14" /></div></Link>) : <p className="muted">Your branches will appear as courses are added.</p>}</div><div className="campus-footer"><span>One academy. A shared view.</span><ArrowUpRight size={16} /></div></section>
      </div>
      <div className="overview-links"><Link to={manager ? "/courses" : "/courses/cycles"} state={manager ? {
          create: true
        } : {
          status: 'unassigned'
        }}><span className="quick-icon"><Plus size={20} /></span><div><strong>{manager ? 'Make room for what’s next' : 'Find your next assignment'}</strong><p>{manager ? 'Set up a new course in a few simple steps.' : "Browse courses that need an employee."}</p></div><ArrowRight size={18} /></Link><Link to={payroll ? '/finances/payroll' : '/profile'}><span className="quick-icon teal"><Wallet size={20} /></span><div><strong>{payroll ? "Keep employee payments moving" : 'A workspace that feels like you'}</strong><p>{payroll ? 'Review teaching hours and settle course payments.' : 'Keep your profile and account details up to date.'}</p></div><ArrowRight size={18} /></Link></div>
    </>}
  </div>;
}
