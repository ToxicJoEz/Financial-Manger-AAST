// Where a cycle lives in the Courses pages: under its umbrella, or under its private sub-umbrella.
export const cyclePath = cycle =>
  cycle.subCourseId ? `/courses/${cycle.parentCourseId}/sub/${cycle.subCourseId}` : `/courses/${cycle.parentCourseId}`;
