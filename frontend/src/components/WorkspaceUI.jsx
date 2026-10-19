import { ArrowRight, BookOpen, Wallet, Clock3, Users, CheckCircle2 } from 'lucide-react';

export function Brand() {
  return <span className="brand"><span className="brand-symbol" aria-hidden="true"><i /><i /><i /><i /></span><span className="brand-name">aast<span>finance</span></span></span>;
}

export function PageHeading({ eyebrow, title, description, children }) {
  return <div className="page-heading"><div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h1>{title}</h1>{description && <p>{description}</p>}</div>{children && <div className="page-actions">{children}</div>}</div>;
}

const icons = { blue: BookOpen, peach: Clock3, teal: Wallet, violet: Users };
export function Metric({ label, value, detail, accent, tone = 'blue', icon, children }) {
  const Icon = icon || icons[tone] || Wallet;
  return <div className={`metric tone-${tone} ${accent ? 'metric-accent' : ''}`}><div className="metric-top"><span className="metric-icon"><Icon size={20} strokeWidth={1.8} /></span><span className="metric-label">{label}</span></div><div className="metric-value">{value}</div><div className="metric-detail">{detail}</div>{children}</div>;
}

export function EmptyState({ title, description, icon: Icon = BookOpen, children }) {
  return <div className="empty-state"><span className="empty-icon"><Icon size={28} strokeWidth={1.6} /></span><h3>{title}</h3><p>{description}</p>{children}</div>;
}

export function Status({ complete, children }) {
  return <span className={`status-badge ${complete ? 'status-complete' : 'status-active'}`}>{complete ? <CheckCircle2 size={12} /> : <span />}{children}</span>;
}

export const money = (value = 0) => new Intl.NumberFormat('en-EG', { maximumFractionDigits: 2 }).format(value);
export const localMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
export const initials = (name = '') => name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(n => n[0]).join('').toUpperCase();

