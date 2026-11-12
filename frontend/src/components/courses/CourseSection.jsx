import { useState } from 'react';
import { Users, UserRound } from 'lucide-react';
import { BRANCHES } from '../../Constants';
import { branchScopeOf, branchName } from '../../utils/access';
import { getBranchColor } from '../../utils/branchColors';
import { getCourseBranch, setCourseBranch } from '../../utils/courseBranch';

// Courses has two fixed sections. Every umbrella belongs to one of them for good.
export const SECTIONS = {
  group: {
    key: 'group',
    label: 'Group courses',
    short: 'Group',
    icon: Users,
    path: '/courses/group',
    blurb: 'Classes for many students. Each umbrella has its own course code and book price.'
  },
  private: {
    key: 'private',
    label: 'Private tuition',
    short: 'Private',
    icon: UserRound,
    path: '/courses/private',
    blurb: 'One-to-one and small groups of up to 3 students, each with their own fee.'
  }
};
export const sectionOf = course => (course?.isPrivate ? SECTIONS.private : SECTIONS.group);

// The top of every page inside a section: tinted in the section's colour, with its name pinned on top.
export function SectionHero({ section, children }) {
  const info = SECTIONS[section] || SECTIONS.group;
  const Icon = info.icon;
  return <header className={`section-hero is-${info.key}`}>
    <span className="section-hero-tag"><Icon size={14} strokeWidth={2.3} aria-hidden="true" />{info.label}</span>
    <Icon className="section-watermark" strokeWidth={1.4} aria-hidden="true" focusable="false" />
    {children}
  </header>;
}

// Which branch the Courses pages show. Branch mods: their own branch, fixed. Users: their own branches.
export function useCourseBranch(user) {
  const scope = branchScopeOf(user);
  const ownBranches = user.role === 'user' ? BRANCHES.filter(b => String(user.branches || '').split(',').includes(b)) : scope ? [scope] : BRANCHES;
  const [picked, setPicked] = useState(() => (ownBranches.includes(getCourseBranch()) ? getCourseBranch() : ''));
  const pickBranch = value => {
    setPicked(value);
    setCourseBranch(value);
  };
  return { scope, ownBranches, branch: scope || picked, pickBranch };
}

export function CourseBranchPicker({ user, scope, ownBranches, branch, pickBranch }) {
  if (scope) return <div className="branch-picker is-fixed" aria-label="Your branch"><span className="active" style={{ '--branch-color': getBranchColor(scope) }}>{branchName(scope)}</span></div>;
  if (!ownBranches.length) return null;
  return <div className="branch-picker" role="group" aria-label="Show branch">
    {ownBranches.length > 1 && <button type="button" className={!branch ? 'active' : ''} aria-pressed={!branch} onClick={() => pickBranch('')}>{user.role === 'user' ? 'All my branches' : 'All branches'}</button>}
    {ownBranches.map(b => <button key={b} type="button" className={branch === b ? 'active' : ''} aria-pressed={branch === b} style={{ '--branch-color': getBranchColor(b) }} onClick={() => pickBranch(branch === b ? '' : b)}>{branchName(b)}</button>)}
  </div>;
}

// An umbrella shows in a branch as soon as it is open for that branch (or already runs cycles there).
export const openInBranch = (course, branch, ownBranches) => {
  const allowed = course.allowedBranches || [];
  if (branch) return allowed.includes(branch) || Boolean(course.byBranch?.[branch]);
  return ownBranches.some(b => allowed.includes(b) || course.byBranch?.[b]);
};
// Counts for the chosen branch, or across every branch shown.
export const countsFor = (course, branch) =>
  branch
    ? { cycles: course.byBranch?.[branch]?.cycles || 0, active: course.byBranch?.[branch]?.active || 0, completed: course.byBranch?.[branch]?.completed || 0, branches: [branch] }
    : { cycles: course.cycleCount, active: course.activeCount, completed: course.completedCount, branches: course.branches };
