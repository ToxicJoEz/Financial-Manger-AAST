// The branch picked on the Courses page, carried into the cycle lists while moving around Courses.
const KEY = 'aast-course-branch';
export const getCourseBranch = () => {
  try {
    return sessionStorage.getItem(KEY) || '';
  } catch {
    return '';
  }
};
export const setCourseBranch = branch => {
  try {
    if (branch) sessionStorage.setItem(KEY, branch);
    else sessionStorage.removeItem(KEY);
  } catch {
    // Private windows may block storage; the filter then simply isn't remembered.
  }
};
