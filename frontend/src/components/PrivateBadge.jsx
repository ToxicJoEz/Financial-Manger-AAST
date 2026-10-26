export default function PrivateBadge({record}){return (record?.isPrivate||record?.parentCourse?.isPrivate)?<span className="private-course-badge">Private</span>:null;}
