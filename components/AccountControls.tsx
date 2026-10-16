import { useState } from 'react';
import { useI18n } from '../i18n';
import { api, downloadFile, errorMessage } from '../services/api';
import type { User, Workspace } from '../types';
export default function AccountControls({
  workspace,
  user,
  onUsage,
  onWorkspaceChanged,
  onDeleted,
}: {
  workspace: Workspace | null;
  user: User;
  onUsage: () => void;
  onWorkspaceChanged: () => Promise<void>;
  onDeleted: () => void;
}) {
  const { text } = useI18n();
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('chat');
  const [reason, setReason] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <div className="stack">
      {user.is_admin && workspace && (
        <form
          className="panel"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError('');
            try {
              await api(`/admin/workspaces/${workspace.id}/credits`, {
                method: 'POST',
                json: { category, amount: Number(amount), reason },
              });
              onUsage();
              setStatus(
                text(
                  'Manuel kredi kaydı oluşturuldu; ödeme değildir.',
                  'Manual credit recorded; this is not payment.',
                ),
              );
              setAmount('');
              setReason('');
            } catch (error) {
              setError(errorMessage(error));
            } finally {
              setBusy(false);
            }
          }}
        >
          <h2>{text('Yönetici: manuel ekstra kredi', 'Admin: manual extra credits')}</h2>
          <p>
            {text(
              'Yalnızca yönetici defteri; fiyatlandırma veya satın alma yok. Free kredi kullanıcıya, Pro kredi çalışma alanına uygulanır.',
              'Admin ledger only; no pricing or purchase. Free credits apply to the user, Pro credits to the workspace.',
            )}
          </p>
          <label>
            {text('Tür', 'Category')}
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="chat">{text('Sohbet', 'Chat')}</option>
              <option value="write">{text('Yazım', 'Writing')}</option>
            </select>
          </label>
          <label>
            {text('Kredi sayısı', 'Credit count')}
            <input
              required
              type="number"
              min={1}
              step={1}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
          <label>
            {text('Gerekçe', 'Reason')}
            <input
              required
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <button disabled={busy}>
            {text('Manuel kredi ver (ödeme değil)', 'Grant manual credits (not payment)')}
          </button>
        </form>
      )}
      <section className="panel">
        <h2>{text('Veri dışa aktarımı ve silme', 'Data export and deletion')}</h2>
        <p>
          {text(
            'Silme geri alınamaz. Yedekleri ve ekip ihtiyaçlarını kontrol edin. Son sahibi olduğunuz çalışma alanını silmeden veya sahipliği devretmeden hesap silinemez.',
            'Deletion is irreversible. Check backups and team needs. An account cannot be deleted while it is the last owner of a workspace; delete the workspace or transfer ownership first.',
          )}
        </p>
        {workspace?.role === 'owner' && (
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError('');
              try {
                await downloadFile(`/workspaces/${workspace.id}/export`, 'workspace-data.json');
              } catch (error) {
                setError(errorMessage(error));
              } finally {
                setBusy(false);
              }
            }}
          >
            {text('Çalışma alanı verisini indir (JSON)', 'Export workspace data (JSON)')}
          </button>
        )}
        <label>
          {text('Silme onayı: DELETE yazın', 'Deletion confirmation: type DELETE')}
          <input
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            autoComplete="off"
          />
        </label>
        {workspace?.role === 'owner' && (
          <button
            disabled={busy || confirmation !== 'DELETE'}
            onClick={async () => {
              setBusy(true);
              setError('');
              try {
                await api(`/workspaces/${workspace.id}`, { method: 'DELETE' });
                await onWorkspaceChanged();
                setConfirmation('');
              } catch (error) {
                setError(errorMessage(error));
              } finally {
                setBusy(false);
              }
            }}
          >
            {text('Bu çalışma alanını kalıcı sil', 'Permanently delete this workspace')}
          </button>
        )}
        <label>
          {text('Hesap silmek için mevcut parola', 'Current password for account deletion')}
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <button
          disabled={busy || confirmation !== 'DELETE' || !password}
          onClick={async () => {
            setBusy(true);
            setError('');
            try {
              await api('/auth/account', {
                method: 'DELETE',
                json: { password, confirmation: 'DELETE' },
              });
              onDeleted();
            } catch (error) {
              setError(errorMessage(error));
            } finally {
              setBusy(false);
            }
          }}
        >
          {text('Hesabımı kalıcı sil', 'Permanently delete my account')}
        </button>
      </section>
      {status && <p role="status">{status}</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
