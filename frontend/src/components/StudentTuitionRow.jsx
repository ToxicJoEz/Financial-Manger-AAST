import { useState } from 'react';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import { BookOpen, RotateCcw, CheckCircle, Clock3, ShieldCheck } from 'lucide-react';
import { Edit2, X, Wallet, Globe, CreditCard } from 'lucide-react';
const money = amount => Number(amount || 0).toLocaleString('en-EG', { maximumFractionDigits: 2 });
const methodName = value => ({ CASH: 'Cash', ONLINE: 'Online', CARD: 'Card', UNSPECIFIED: 'Unspecified' })[value] || 'Unspecified';
export default function StudentTuitionRow({ course, enrollment: row, manager, onEdit, onRemove, onBooksChanged, readOnly = false }) {
  const [bookAction, setBookAction] = useState(null), [bookBusy, setBookBusy] = useState(false);
  const books = row.books || { status: 'UNPAID' }, price = Number(course.parentCourse?.bookPrice || 0);
  const bookStatus = books.status === 'PAID' ? 'paid' : books.status === 'EXEMPT' ? 'exempt' : 'unpaid';
  const BookStatusIcon = bookStatus === 'paid' ? CheckCircle : bookStatus === 'exempt' ? ShieldCheck : Clock3;
  async function saveBooks(status = bookAction) {
    if (bookBusy) return;
    setBookBusy(true);
    try {
      const { data } = await axios.post(`/cycles/${course.id}/enrollments/${row.id}/books`, { status, expectedPrice: price, paymentId: books.id });
      toast.success(data.message); setBookAction(null); await onBooksChanged?.();
    } catch (error) { toast.error(error.response?.data?.error || 'Book status could not be saved.'); }
    finally { setBookBusy(false); }
  }
  const student = row.student || {}, payments = row.paymentSummary || [];
  // Actual spaces prevent Arabic initials from joining into a single word.
  const initials = (student.name || 'ST').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(part => Array.from(part)[0]).join(' ').toUpperCase();
  const archived = Boolean(row.deletedAt || row.financialArchivedAt || student.deletedAt);
  return <article className="student-tuition-card">
    <div className="student-tuition-header">
      <div className="student-tuition-identity"><span className="student-avatar-mini" dir="auto">{initials}</span><div><strong dir="auto">{student.name}</strong>{student.englishName && <small dir="ltr">{student.englishName}</small>}<span className="student-registration" dir="ltr">Registration {student.registrationNumber}</span></div></div>
      <div className="student-tuition-status"><span className={`enrollment-badge ${(row.status || 'unpaid').toLowerCase()}`}>{row.status === 'PAID' ? 'Paid' : row.status === 'PARTIAL' ? 'Partial' : row.status === 'EXEMPT' ? 'Exempt' : 'Unpaid'}</span>{archived && <span className="deleted-tag">{student.deletedAt ? 'Deleted student' : 'Archived enrollment'}</span>}{!readOnly && <div className="student-tuition-actions">{manager && <button type="button" className="icon-button" title="Edit tuition fee" aria-label={`Edit tuition fee for ${student.name}`} onClick={onEdit}><Edit2 size={15} /></button>}<button className="icon-button danger" type="button" title="Remove student from cycle" aria-label={`Remove ${student.name} from cycle`} disabled={Boolean(row.deletedAt)} onClick={onRemove}><X size={15} /></button></div>}</div>
    </div>
    <div className="student-tuition-body">
      <dl className="student-personal-facts"><Fact label="Mobile" value={student.mobile} /><Fact label="Date of birth" value={student.dateOfBirth ? new Date(student.dateOfBirth).toLocaleDateString('en-GB') : null} /><Fact label="Nationality" value={student.nationality} /><Fact label="Place of birth" value={student.placeOfBirth} /></dl>
      <dl className="student-money-facts"><Fact label="Applicable fee" value={`${money(row.effectiveFee ?? row.customFee ?? course.courseFee)} EGP`} /><Fact label="Collected" value={`${money(row.amountPaid)} EGP`} /><Fact label="Remaining" value={`${money(row.remainingBalance)} EGP`} /></dl>
      <div className="student-payment-references">{payments.length ? payments.map(payment => <dl className="student-payment-reference" key={payment.id}><Fact label="Payment method" icon={payment.paymentMethod === 'CASH' ? Wallet : payment.paymentMethod === 'ONLINE' ? Globe : payment.paymentMethod === 'CARD' ? CreditCard : undefined} value={`${methodName(payment.paymentMethod)} · ${payment.kind === 'REFUND' ? 'Refund ' : payment.kind === 'ADJUSTMENT' ? 'Correction ' : ''}${money(payment.amount)} EGP`} /><Fact label="رقم الحافظة" value={payment.receiptNumber || 'Not recorded'} /></dl>) : <dl className="student-payment-reference"><Fact label="Payment method" value={row.amountPaid > 0 ? 'Not recorded' : 'No payment yet'} /><Fact label="رقم الحافظة" value="—" /></dl>}</div>
    </div>
    <div className={`student-books book-state-${bookStatus}`}><div className="student-books-label"><span className="student-book-icon"><BookOpen size={20}/></span><div><div className="student-book-heading"><strong>Books</strong><span className="student-book-status"><BookStatusIcon size={14}/>{bookStatus === 'paid' ? 'Paid' : bookStatus === 'exempt' ? 'Not required' : 'Not paid yet'}</span></div><small>{books.status === 'PAID' ? `${money(books.amount)} EGP · ${new Date(books.recordedAt).toLocaleDateString('en-GB')}` : books.status === 'EXEMPT' ? 'Exempt · No book payment needed' : `${price > 0 ? money(price) + ' EGP at current price' : 'Book price not configured'}`}</small></div></div>
      {!readOnly && <div className="student-book-actions">{bookAction ? <><span>{bookAction === 'PAID' ? `Record ${money(price)} EGP as paid?` : bookAction === 'EXEMPT' ? 'Mark books as not required?' : 'Undo this status and update income?'}</span><button type="button" className="btn-secondary" disabled={bookBusy} onClick={() => setBookAction(null)}>Cancel</button><button type="button" className="btn-primary" disabled={bookBusy} onClick={() => saveBooks()}>{bookBusy ? 'Saving…' : 'Confirm'}</button></> : books.status === 'UNPAID' ? <><button type="button" className="btn-secondary" disabled={bookBusy || archived || price <= 0} onClick={() => saveBooks('PAID')}><CheckCircle size={15}/>{bookBusy ? 'Saving…' : 'Mark books paid'}</button><button type="button" className="btn-secondary" disabled={bookBusy || archived} onClick={() => setBookAction('EXEMPT')}>Not required</button></> : manager && <button type="button" className="text-button" onClick={() => setBookAction('UNPAID')}><RotateCcw size={15}/>Undo book status</button>}</div>}
    </div>
  </article>;
}
function Fact({ label, value, icon: Icon }) { return <div><dt>{label}</dt><dd dir="auto" className={Icon ? 'payment-method-value' : undefined}>{Icon && <Icon size={15} aria-hidden="true" />}{value || '—'}</dd></div>; }
