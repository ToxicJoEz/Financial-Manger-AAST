export default function PrivateBadge({ record }) {
  if (!record) return null;
  const isPrivate = Boolean(record.isPrivate || record.parentCourse?.isPrivate);
  return isPrivate ? (
    <span className="private-course-badge">
      <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', backgroundColor: '#7c3aed', marginInlineEnd: 4 }} />
      Private
    </span>
  ) : (
    <span className="group-course-badge">
      <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', backgroundColor: '#047857', marginInlineEnd: 4 }} />
      Group
    </span>
  );
}
