import { useState, useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import { branchScopeOf } from '../utils/access';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import { BookOpen, RotateCcw, CheckCircle, Clock3, ShieldCheck } from 'lucide-react';
import { Edit2, X, Wallet, Globe, CreditCard } from 'lucide-react';
const money = amount => Number(amount || 0).toLocaleString('en-EG', { maximumFractionDigits: 2 });
const methodName = value => ({ CASH: 'Cash', ONLINE: 'Online', CARD: 'Card', UNSPECIFIED: 'Unspecified' })[value] || 'Unspecified';
export default function StudentTuitionRow({ course, enrollment: row, manager, onEdit, onRemove, onBooksChanged, readOnly = false }) {
  const { user } = useContext(AuthContext);
  // Users only view; books are changed by admins and mods.
  const canManageBooks = manager;
  // Branch mods can change money only until the main mod confirms it; users never change or remove it.
  const branchMod = Boolean(branchScopeOf(user));
  const LOCKED = 'Confirmed by the main mod. Ask the main mod or an admin to change it.';
  const moneyLocked = branchMod && Boolean(row.moneyConfirmed);
  const [bookAction, setBookAction] = useState(null), [bookBusy, setBookBusy] = useState(false);
  // Unpaid students (carried into a next level) are marked paid in one step: full, discounted or exempt.
  // There are no instalments. An older part-paid record can only be completed by paying what is left.
  const [paying, setPaying] = useState(null), [payBusy, setPayBusy] = useState(false);
  const standardFee = Number(course.courseFee || 0);
  const unpaid = Number(row.amountPaid) === 0 && Number(row.remainingBalance) > 0;
  async function savePayment(e) {
    e.preventDefault();
    if (payBusy) return;
    setPayBusy(true);
    try {
      const extra = { paymentMethod: paying.paymentMethod, receiptNumber: paying.receiptNumber || null, idempotencyKey: paying.key };
      if (unpaid) await axios.post(`/cycles/${course.id}/enrollments/${row.id}/settle`, { tuitionType: paying.type, customFee: paying.type === 'DISCOUNTED' ? paying.amount : undefined, ...extra });
      else await axios.post(`/cycles/${course.id}/enrollments/${row.id}/payments`, { amount: row.remainingBalance, kind: 'PAYMENT', note: 'Remaining tuition paid in full', ...extra });
      toast.success(paying.type === 'EXEMPT' ? 'Marked exempt' : 'Tuition marked paid');
      setPaying(null);
      await onBooksChanged?.();
    } catch (error) { toast.error(error.response?.data?.error || 'Tuition could not be saved.'); }
    finally { setPayBusy(false); }
  }
  const books = row.books || { status: 'UNPAID' }, price = Number(course.effectiveBookPrice ?? (course.parentCourse?.isPrivate ? course.bookPrice : course.parentCourse?.bookPrice) ?? 0);
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
      <div className="student-tuition-identity"><span className="student-avatar-mini" dir="auto">{initials}</span><div><strong dir="auto">{student.name}</strong>{student.englishName && <small dir="ltr">{student.englishName}</small>}<span className="student-registration" dir="ltr">Registration {student.registrationNumber||'Not issued'}</span></div></div>
      <div className="student-tuition-status"><span className={`enrollment-badge ${(row.status || 'unpaid').toLowerCase()}`}>{row.status === 'PAID' ? 'Paid' : row.status === 'PARTIAL' ? 'Partial' : row.status === 'EXEMPT' ? 'Exempt' : 'Unpaid'}</span>{row.moneyConfirmed && <span className="money-confirmed-tag" title="The main mod checked this student's money"><ShieldCheck size={12} />Confirmed</span>}{archived && <span className="deleted-tag">{student.deletedAt ? 'Archived student' : 'Archived enrollment'}</span>}{!readOnly && <div className="student-tuition-actions">{manager && <button type="button" className="icon-button" title={moneyLocked ? LOCKED : 'Edit tuition fee'} aria-label={`Edit tuition fee for ${student.name}`} disabled={moneyLocked} onClick={onEdit}><Edit2 size={15} /></button>}{manager && <button className="icon-button danger" type="button" title={moneyLocked ? LOCKED : 'Remove student from cycle'} aria-label={`Remove ${student.name} from cycle`} disabled={Boolean(row.deletedAt) || moneyLocked} onClick={onRemove}><X size={15} /></button>}</div>}</div>
    </div>
    <div className="student-tuition-body">
      <dl className="student-personal-facts"><Fact label="Mobile" value={student.mobile} /><Fact label="Date of birth" value={student.dateOfBirth ? new Date(student.dateOfBirth).toLocaleDateString('en-GB',{day:'2-digit',month:'2-digit',year:'2-digit',timeZone:'UTC'}) : null} /><Fact label="Nationality" value={student.nationality} /><Fact label="Place of birth" value={student.placeOfBirth} /></dl>
      <dl className="student-money-facts"><Fact label="Applicable fee" value={`${money(row.effectiveFee ?? row.customFee ?? course.courseFee)} EGP`} />{row.amountPaid !== undefined && <><Fact label="Collected" value={`${money(row.amountPaid)} EGP`} /><Fact label="Remaining" value={`${money(row.remainingBalance)} EGP`} /></>}</dl>
      {/* Users see the fee and paid / not paid only: no amounts, methods or receipts. */}
      {row.amountPaid !== undefined && <div className="student-payment-references">{payments.length ? payments.map(payment => <dl className="student-payment-reference" key={payment.id}><Fact label="Payment method" icon={payment.paymentMethod === 'CASH' ? Wallet : payment.paymentMethod === 'ONLINE' ? Globe : payment.paymentMethod === 'CARD' ? CreditCard : undefined} value={`${methodName(payment.paymentMethod)} · ${payment.kind === 'REFUND' ? 'Refund ' : payment.kind === 'ADJUSTMENT' ? 'Correction ' : ''}${money(payment.amount)} EGP`} /><Fact label="رقم الحافظة" value={payment.receiptNumber || 'Not recorded'} /></dl>) : <dl className="student-payment-reference"><Fact label="Payment method" value={row.amountPaid > 0 ? 'Not recorded' : 'No payment yet'} /><Fact label="رقم الحافظة" value="—" /></dl>}</div>}
    </div>
    {!readOnly && manager && !archived && Number(row.remainingBalance) > 0 && (paying ? <form className="student-pay-form" onSubmit={savePayment}>
      {unpaid ? <div className="student-pay-types" role="radiogroup" aria-label="Tuition">{[['FULL', `Full · ${money(standardFee)} EGP`], ['DISCOUNTED', 'Discounted'], ['EXEMPT', 'Exempt']].map(([type, text]) => <button key={type} type="button" role="radio" aria-checked={paying.type === type} className={paying.type === type ? 'active' : ''} onClick={() => setPaying(p => ({ ...p, type }))}>{text}</button>)}</div> : <p className="student-pay-left">Pay the remaining <strong>{money(row.remainingBalance)} EGP</strong> in full.</p>}
      {unpaid && paying.type === 'DISCOUNTED' && <label>Discounted fee, paid in full (EGP)<input className="input-field" type="number" min="0.01" step="0.01" max={standardFee - 0.01} required value={paying.amount} onChange={e => setPaying(p => ({ ...p, amount: e.target.value }))} /></label>}
      {paying.type !== 'EXEMPT' && <><label>Method<select className="input-field" value={paying.paymentMethod} onChange={e => setPaying(p => ({ ...p, paymentMethod: e.target.value }))}><option value="CASH">Cash</option><option value="ONLINE">Online</option><option value="CARD">Card</option><option value="UNSPECIFIED">Unspecified</option></select></label><label>رقم الحافظة<input className="input-field" maxLength={100} value={paying.receiptNumber} onChange={e => setPaying(p => ({ ...p, receiptNumber: e.target.value }))} /></label></>}
      <div className="student-pay-actions"><button type="button" className="btn-secondary" disabled={payBusy} onClick={() => setPaying(null)}>Cancel</button><button className="btn-primary" disabled={payBusy}>{payBusy ? 'Saving…' : paying.type === 'EXEMPT' ? 'Mark exempt' : 'Mark paid'}</button></div>
    </form> : <div className="student-pay-cta"><span>{unpaid ? 'Tuition not paid yet' : `${money(row.remainingBalance)} EGP still to pay`}</span><button type="button" className="btn-secondary" onClick={() => setPaying({ type: 'FULL', amount: '', paymentMethod: 'CASH', receiptNumber: '', key: crypto.randomUUID() })}><Wallet size={15} />Mark tuition paid</button></div>)}
    <div className={`student-books book-state-${bookStatus}`}><div className="student-books-label"><span className="student-book-icon"><BookOpen size={20}/></span><div><div className="student-book-heading"><strong>Books</strong><span className="student-book-status"><BookStatusIcon size={14}/>{bookStatus === 'paid' ? 'Paid' : bookStatus === 'exempt' ? 'Not required' : 'Not paid yet'}</span></div><small>{books.status === 'PAID' ? `${money(books.amount)} EGP · ${new Date(books.recordedAt).toLocaleDateString('en-GB',{day:'2-digit',month:'2-digit',year:'2-digit',timeZone:'UTC'})}` : books.status === 'EXEMPT' ? 'Exempt · No book payment needed' : `${price > 0 ? money(price) + ' EGP at current price' : 'Book price not configured'}`}</small></div></div>
      {!readOnly && canManageBooks && <div className="student-book-actions">{bookAction ? <><span>{bookAction === 'PAID' ? `Record ${money(price)} EGP as paid?` : bookAction === 'EXEMPT' ? 'Mark books as not required?' : 'Undo this status and update income?'}</span><button type="button" className="btn-secondary" disabled={bookBusy} onClick={() => setBookAction(null)}>Cancel</button><button type="button" className="btn-primary" disabled={bookBusy} onClick={() => saveBooks()}>{bookBusy ? 'Saving…' : 'Confirm'}</button></> : books.status === 'UNPAID' ? <><button type="button" className="btn-secondary" disabled={bookBusy || archived || price <= 0} onClick={() => saveBooks('PAID')}><CheckCircle size={15}/>{bookBusy ? 'Saving…' : 'Mark books paid'}</button><button type="button" className="btn-secondary" disabled={bookBusy || archived} onClick={() => setBookAction('EXEMPT')}>Not required</button></> : manager ? <button type="button" className="text-button" disabled={branchMod && Boolean(books.confirmed)} title={branchMod && books.confirmed ? LOCKED : undefined} onClick={() => setBookAction('UNPAID')}><RotateCcw size={15}/>Undo book status</button> : null}</div>}
    </div>
  </article>;
}
function Fact({ label, value, icon: Icon }) { return <div><dt>{label}</dt><dd dir="auto" className={Icon ? 'payment-method-value' : undefined}>{Icon && <Icon size={15} aria-hidden="true" />}{value || '—'}</dd></div>; }
