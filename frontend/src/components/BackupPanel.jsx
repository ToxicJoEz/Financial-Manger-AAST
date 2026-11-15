import { useContext, useRef, useState } from 'react';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import { DatabaseBackup, Download, Upload, AlertTriangle, ShieldCheck } from 'lucide-react';
import { AuthContext } from '../context/AuthContext';

const size = bytes => (bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);
const when = value => new Date(value).toLocaleString('en-GB', { timeZone: 'Africa/Cairo', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const LABELS = [['User', 'accounts'], ['Course', 'umbrellas'], ['Cycle', 'cycles'], ['Student', 'students'], ['Enrollment', 'enrollments'], ['PaymentEntry', 'tuition payments'], ['PayrollEarning', 'employee earnings'], ['SystemLog', 'log entries']];

// Full backups (everything: accounts, courses, money, payroll, logs) as a file on this computer, and restoring
// one. Files travel in parts because hosting limits each request's size. Manual only: nothing is scheduled.
export default function BackupPanel() {
  const { logout } = useContext(AuthContext);
  const [progress, setProgress] = useState(null),
    [restore, setRestore] = useState(null),
    [understood, setUnderstood] = useState(false);
  const picker = useRef(null);
  const busy = Boolean(progress);

  async function download(label = 'Preparing backup…') {
    setProgress({ label, done: 0, total: 1 });
    try {
      const { data: info } = await axios.post('/backups');
      const parts = [];
      for (let i = 0; i < info.totalChunks; i++) {
        setProgress({ label: 'Downloading backup…', done: i, total: info.totalChunks });
        parts.push((await axios.get(`/backups/${info.id}/chunks/${i}`, { responseType: 'arraybuffer' })).data);
      }
      await axios.delete('/backups/' + info.id).catch(() => {});
      const url = URL.createObjectURL(new Blob(parts, { type: 'application/gzip' }));
      const link = Object.assign(document.createElement('a'), { href: url, download: info.fileName });
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      toast.success(`Backup downloaded (${size(info.size)})`);
      return true;
    } catch (error) {
      toast.error(error.response?.data?.error || 'The backup could not be created.');
      return false;
    } finally {
      setProgress(null);
    }
  }

  async function choose(file) {
    if (!file) return;
    setProgress({ label: 'Uploading backup…', done: 0, total: 1 });
    try {
      const { data: upload } = await axios.post('/backups/uploads', { size: file.size, fileName: file.name });
      for (let i = 0; i < upload.totalChunks; i++) {
        setProgress({ label: 'Uploading backup…', done: i, total: upload.totalChunks });
        const part = await file.slice(i * upload.chunkSize, (i + 1) * upload.chunkSize).arrayBuffer();
        await axios.put(`/backups/uploads/${upload.id}/chunks/${i}`, part, { headers: { 'Content-Type': 'application/octet-stream' } });
      }
      setProgress({ label: 'Checking backup…', done: 1, total: 1 });
      const { data: info } = await axios.get(`/backups/uploads/${upload.id}/check`);
      setUnderstood(false);
      setRestore({ id: upload.id, fileName: file.name, size: file.size, ...info });
    } catch (error) {
      toast.error(error.response?.data?.error || 'That file could not be read as a backup.');
    } finally {
      setProgress(null);
      if (picker.current) picker.current.value = '';
    }
  }

  async function runRestore() {
    setProgress({ label: 'Restoring… do not close this page.', done: 1, total: 1 });
    try {
      const { data } = await axios.post(`/backups/uploads/${restore.id}/restore`, { confirm: true });
      toast.success(data.message || 'Backup restored.', { duration: 8000 });
      setRestore(null);
      await logout();
    } catch (error) {
      toast.error(error.response?.data?.error || 'The backup could not be restored. Nothing was changed.', { duration: 9000 });
    } finally {
      setProgress(null);
    }
  }

  if (restore) return <div className="team-modal-view backup-restore-dialog">
      <h3><AlertTriangle size={20} />Replace everything with this backup?</h3>
      <dl className="backup-facts">
        <div><dt>File</dt><dd>{restore.fileName} · {size(restore.size)}</dd></div>
        <div><dt>Made</dt><dd>{when(restore.createdAt)} by {restore.createdBy}</dd></div>
        {LABELS.map(([key, label]) => <div key={key}><dt>{label[0].toUpperCase() + label.slice(1)}</dt><dd>{(restore.counts?.[key] ?? 0).toLocaleString()}</dd></div>)}
      </dl>
      <p className="alert-error">All current data, including accounts and the activity log, is replaced by this backup. Anything added since it was made is lost. You will be signed out.</p>
      <button type="button" className="text-button" disabled={busy} onClick={() => download('Saving the current data first…')}><Download size={15} />Download the current data first</button>
      <label className="policy-check"><input type="checkbox" checked={understood} onChange={e => setUnderstood(e.target.checked)} />I understand everything will be replaced</label>
      <div className="payment-entry-actions"><button type="button" className="btn-secondary" disabled={busy} onClick={() => setRestore(null)}>Back</button><button type="button" className="btn-primary btn-danger-solid" disabled={busy || !understood} onClick={runRestore}>{busy ? progress.label : 'Restore backup'}</button></div>
    </div>;
  return <section className="team-modal-view backup-panel" aria-labelledby="backup-title">
    <div className="backup-panel-copy">
      <span className="backup-panel-icon"><DatabaseBackup size={22} /></span>
      <div>
        <h2 id="backup-title">Backup &amp; restore</h2>
        <p>Download everything (accounts, umbrellas, cycles, students, money, payroll and the activity log) as one file on this computer. Restoring a file brings the whole workspace back exactly as it was, here or on a new host.</p>
        <p className="backup-panel-warning"><ShieldCheck size={14} />The file holds personal data and password hashes. Keep it somewhere safe.</p>
      </div>
    </div>
    <div className="backup-panel-actions">
      {progress ? <div className="backup-progress" role="status"><span>{progress.label}</span>{progress.total > 1 && <progress max={progress.total} value={progress.done} />}</div> : <>
        <button type="button" className="btn-primary" disabled={busy} onClick={() => download()}><Download size={16} />Download backup</button>
        <button type="button" className="btn-secondary" disabled={busy} onClick={() => picker.current?.click()}><Upload size={16} />Restore from backup</button>
      </>}
      <input ref={picker} type="file" accept=".gz,application/gzip" hidden onChange={e => choose(e.target.files?.[0])} />
    </div>

  </section>;
}
