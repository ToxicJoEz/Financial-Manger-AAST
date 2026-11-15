import { useContext, useState } from 'react';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import { Building2, Plus, Pencil, Trash2, AlertTriangle, Archive } from 'lucide-react';
import { BranchContext } from '../context/BranchContext';

const PALETTE = ['#2563eb', '#7c3aed', '#c2620a', '#dc2626', '#0e7f99', '#05875f', '#be185d', '#4f46e5', '#0f766e', '#a16207', '#475569', '#9333ea'];

// Admins and the main mod add, rename, recolour and delete branches. Deleting asks what happens to the data:
// keep it (renamed <CODE>-DELETED, as history) or delete it all.
export default function BranchManager() {
  const { branches, reload } = useContext(BranchContext);
  const [editing, setEditing] = useState(null),
    [removing, setRemoving] = useState(null),
    [busy, setBusy] = useState(false);
  const active = branches.filter(b => b.active),
    deleted = branches.filter(b => !b.active);

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    try {
      if (editing.code) await axios.put('/branches/' + editing.code, { name: editing.name, color: editing.color });
      else await axios.post('/branches', { name: editing.name, color: editing.color });
      toast.success(editing.code ? 'Branch updated' : `${editing.name} added`);
      setEditing(null);
      await reload();
    } catch (error) {
      toast.error(error.response?.data?.error || 'The branch could not be saved.');
    } finally {
      setBusy(false);
    }
  }
  async function openRemove(branch) {
    try {
      const { data } = await axios.get(`/branches/${branch.code}/impact`);
      setRemoving({ ...data, mode: data.lockedEarnings ? 'KEEP' : '', confirm: false });
    } catch (error) {
      toast.error(error.response?.data?.error || 'The branch could not be checked.');
    }
  }
  async function remove() {
    setBusy(true);
    try {
      const { data } = await axios.delete('/branches/' + removing.branch.code, { data: { mode: removing.mode, confirm: true } });
      toast.success(data.message, { duration: 8000 });
      setRemoving(null);
      await reload();
    } catch (error) {
      toast.error(error.response?.data?.error || 'The branch could not be deleted.', { duration: 8000 });
    } finally {
      setBusy(false);
    }
  }

  if (editing) return <form className="team-modal-view branch-editor" onSubmit={save}>
      <h3>{editing.code ? `Edit ${editing.code}` : 'Add a branch'}</h3>
      <label htmlFor="branch-name">Name</label>
      <input id="branch-name" className="input-field" required maxLength={60} value={editing.name} placeholder="e.g. Nasr City" autoFocus onChange={e => setEditing(x => ({ ...x, name: e.target.value }))} />
      {!editing.code && <p className="muted">Its code will be {(editing.name || '…').normalize('NFKD').toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '') || '…'}. Codes can’t be changed later.</p>}
      <span className="branch-editor-label">Colour</span>
      <div className="branch-palette" role="radiogroup" aria-label="Colour">{PALETTE.map(c => <button key={c} type="button" role="radio" aria-checked={editing.color === c} aria-label={c} className={editing.color === c ? 'active' : ''} style={{ background: c }} onClick={() => setEditing(x => ({ ...x, color: c }))} />)}<input type="color" aria-label="Custom colour" value={editing.color} onChange={e => setEditing(x => ({ ...x, color: e.target.value }))} /></div>
      <div className="payment-entry-actions"><button type="button" className="btn-secondary" disabled={busy} onClick={() => setEditing(null)}>Back</button><button className="btn-primary" disabled={busy}>{busy ? 'Saving…' : editing.code ? 'Save branch' : 'Add branch'}</button></div>
    </form>;
  if (removing) return <div className="team-modal-view branch-delete-dialog">
      <h3><AlertTriangle size={20} />Delete {removing.branch.name}?</h3>
      <p className="muted">{removing.branch.name} has {removing.cycles} cycles ({removing.activeCycles} running), {removing.enrollments} enrollments and {removing.payments} payment records. It is open in {removing.umbrellas} umbrellas, listed for {removing.employees} employees and {removing.users} users{removing.branchMods.length ? `, and has branch mods: ${removing.branchMods.join(', ')} (their accounts are banned, not deleted)` : ''}.</p>
      <div className="branch-delete-choices" role="radiogroup" aria-label="What happens to the data">
        <button type="button" role="radio" aria-checked={removing.mode === 'KEEP'} className={removing.mode === 'KEEP' ? 'active' : ''} onClick={() => setRemoving(r => ({ ...r, mode: 'KEEP' }))}><strong>Keep the data</strong><span>Its cycles, students’ payments and payroll stay, renamed to {removing.branch.code}-DELETED. Nothing new can be added there.</span></button>
        <button type="button" role="radio" aria-checked={removing.mode === 'DELETE_DATA'} disabled={removing.lockedEarnings > 0} className={removing.mode === 'DELETE_DATA' ? 'active danger' : 'danger'} onClick={() => setRemoving(r => ({ ...r, mode: 'DELETE_DATA' }))}><strong>Delete everything</strong><span>{removing.lockedEarnings ? `Not possible: ${removing.lockedEarnings} employee earnings are in payment batches.` : 'Its cycles, enrollments, payments and students who studied only there are permanently deleted.'}</span></button>
      </div>
      <label className="policy-check"><input type="checkbox" checked={removing.confirm} onChange={e => setRemoving(r => ({ ...r, confirm: e.target.checked }))} />I understand this can’t be undone</label>
      <div className="payment-entry-actions"><button type="button" className="btn-secondary" disabled={busy} onClick={() => setRemoving(null)}>Back</button><button type="button" className="btn-primary btn-danger-solid" disabled={busy || !removing.mode || !removing.confirm} onClick={remove}>{busy ? 'Deleting…' : 'Delete branch'}</button></div>
    </div>;
  return <section className="team-modal-view branch-manager" aria-labelledby="branches-title">
    <header className="branch-manager-head">
      <span className="backup-panel-icon"><Building2 size={22} /></span>
      <div><h2 id="branches-title">Branches</h2><p>Add, rename or recolour branches. A branch’s code (e.g. DOKKI) never changes, because records refer to it.</p></div>
      <button type="button" className="btn-secondary" onClick={() => setEditing({ name: '', color: PALETTE[active.length % PALETTE.length] })}><Plus size={16} />Add branch</button>
    </header>
    <ul className="branch-list">
      {active.map(b => <li key={b.code}>
        <span className="branch-swatch" style={{ background: b.color }} aria-hidden="true" />
        <span className="branch-list-name"><strong>{b.name}</strong><small>{b.code}</small></span>
        <button type="button" className="icon-button" aria-label={'Edit ' + b.name} onClick={() => setEditing({ ...b })}><Pencil size={15} /></button>
        <button type="button" className="icon-button danger" aria-label={'Delete ' + b.name} disabled={active.length <= 1} onClick={() => openRemove(b)}><Trash2 size={15} /></button>
      </li>)}
      {deleted.map(b => <li key={b.code} className="is-deleted">
        <span className="branch-swatch" style={{ background: b.color }} aria-hidden="true" />
        <span className="branch-list-name"><strong>{b.name}</strong><small>{b.code} · kept as history{b.deletedAt ? ' since ' + new Date(b.deletedAt).toLocaleDateString('en-GB') : ''}</small></span>
        <Archive size={15} className="muted" aria-hidden="true" />
      </li>)}
    </ul>

  </section>;
}
