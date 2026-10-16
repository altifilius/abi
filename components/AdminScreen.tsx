import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useUnsavedChanges } from '../contexts/NavigationGuard';
import { api } from '../services/api';
import type { User } from '../types';
import {
  buttonClass,
  errorText,
  inputClass,
  panelClass,
  SourceLink,
  timestamp,
  useEvidenceText,
} from './EvidenceUi';
import type { FundingProgram } from './FundingCatalog';
import SourceAdmin from './SourceAdmin';

interface AdminWorkspace {
  id: string;
  name: string;
  kind: string;
  country: string;
  plan: 'free' | 'pro';
  ai_policy: string;
  created_at: string;
  member_count: number;
  project_count: number;
}
interface Credit {
  id: string;
  category: 'chat' | 'write';
  amount: number;
  month: string;
  plan: string;
  reason: string;
  created_at: string;
  granted_by: string | null;
}
interface Ledger {
  credits: Credit[];
  billing_status: string;
  scope: 'user' | 'workspace';
}
interface AdminOperations {
  counts: Record<string, number>;
  operations: { status: string; count: number }[];
  mail: { status: string; count: number }[];
  health: {
    ready: boolean;
    degraded: boolean;
    services: {
      code: string;
      critical: boolean;
      configured: boolean;
      available: boolean | null;
      status: string;
    }[];
    workers: { worker_name: string; checked_at: string; status: string; stale: boolean }[];
    backup: { mode: string; created_at?: string; restored_at?: string };
  };
}

function EntitlementEditor({
  workspace,
  onChanged,
}: {
  workspace: AdminWorkspace;
  onChanged: (workspace: AdminWorkspace) => void;
}) {
  const text = useEvidenceText();
  const [plan, setPlan] = useState(workspace.plan);
  const [savedPlan, setSavedPlan] = useState(workspace.plan);
  const [acknowledged, setAcknowledged] = useState(false);
  const [category, setCategory] = useState<'chat' | 'write'>('chat');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const requestAbort = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  useUnsavedChanges(plan !== savedPlan || !!amount || !!reason, () => {
    setPlan(savedPlan);
    setAcknowledged(false);
    setAmount('');
    setReason('');
  });
  const workspaceId = workspace.id;
  const loadLedger = useCallback(async () => {
    requestAbort.current?.abort();
    const controller = new AbortController();
    requestAbort.current = controller;
    setLoading(true);
    setLedger(null);
    setError('');
    try {
      const data = await api<Ledger>(`/admin/workspaces/${workspaceId}/credits`, {
        signal: controller.signal,
      });
      if (!controller.signal.aborted) setLedger(data);
    } catch (reason) {
      if (!controller.signal.aborted) setError(errorText(reason));
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [workspaceId]);
  useEffect(() => {
    void loadLedger();
    return () => requestAbort.current?.abort();
  }, [loadLedger]);
  return (
    <section className={panelClass}>
      <h2>{workspace.name}</h2>
      <dl className="grid grid-cols-2 gap-2">
        <dt>{text('Tür / ülke', 'Kind / country')}</dt>
        <dd>
          {workspace.kind} / {workspace.country}
        </dd>
        <dt>{text('Üyeler / projeler', 'Members / projects')}</dt>
        <dd>
          {workspace.member_count} / {workspace.project_count}
        </dd>
        <dt>{text('AI politikası', 'AI policy')}</dt>
        <dd>{workspace.ai_policy}</dd>
        <dt>{text('Oluşturulma', 'Created')}</dt>
        <dd>{timestamp(workspace.created_at)}</dd>
      </dl>
      <p>
        {text(
          'Yalnızca temel çalışma alanı metaverisi gösterilir. Sistem yöneticiliği kiracının özel projelerini, belgelerini veya yazışmalarını okuma hakkı vermez.',
          'Only basic workspace metadata is shown. System administration does not grant access to a tenant’s private projects, documents or conversations.',
        )}
      </p>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      <form
        className="space-y-3"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!acknowledged || plan === savedPlan || busy) return;
          setBusy(true);
          setError('');
          setMessage('');
          try {
            const response = await api<{ workspace: { plan: 'free' | 'pro' } }>(
              `/admin/workspaces/${workspace.id}/plan`,
              { method: 'POST', json: { plan } },
            );
            setSavedPlan(response.workspace.plan);
            setPlan(response.workspace.plan);
            setAcknowledged(false);
            await loadLedger();
            onChanged({ ...workspace, plan: response.workspace.plan });
            setMessage(
              text(
                'Manuel yetki kaydedildi; ödeme yapılmadı.',
                'Manual entitlement saved; no payment was processed.',
              ),
            );
          } catch (reason) {
            setError(errorText(reason));
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="block">
          {text('Manuel plan yetkisi', 'Manual plan entitlement')}
          <select
            className={inputClass}
            disabled={busy}
            value={plan}
            onChange={(event) => {
              setPlan(event.target.value as AdminWorkspace['plan']);
              setAcknowledged(false);
            }}
          >
            <option value="free">Free</option>
            <option value="pro">Pro</option>
          </select>
        </label>
        <label className="flex gap-2">
          <input
            type="checkbox"
            disabled={busy}
            checked={acknowledged}
            onChange={(event) => setAcknowledged(event.target.checked)}
          />
          {text(
            'Bu işlem abonelik satın alma veya ödeme değildir.',
            'This is not a subscription purchase or payment.',
          )}
        </label>
        <button className={buttonClass} disabled={busy || !acknowledged || plan === savedPlan}>
          {text('Manuel planı kaydet', 'Save manual plan')}
        </button>
      </form>
      <form
        className="space-y-3"
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy || plan !== savedPlan) return;
          setBusy(true);
          setError('');
          setMessage('');
          try {
            await api(`/admin/workspaces/${workspace.id}/credits`, {
              method: 'POST',
              json: { category, amount: Number(amount), reason: reason.trim(), month },
            });
            setAmount('');
            setReason('');
            await loadLedger();
            setMessage(
              text(
                'Manuel kredi kayda eklendi; ödeme yapılmadı.',
                'Manual credit added to the ledger; no payment was processed.',
              ),
            );
          } catch (reason) {
            setError(errorText(reason));
          } finally {
            setBusy(false);
          }
        }}
      >
        <h3>{text('Manuel kullanım kredisi', 'Manual usage credit')}</h3>
        <p>
          {text(
            'Krediler seçili UTC ayı ve planı için geçerlidir. Free kredileri sahibin kullanıcı kapsamındadır; Pro kredileri çalışma alanı kapsamındadır. Fiyatlandırma veya fatura oluşturulmaz.',
            'Credits apply to the selected UTC month and plan. Free credits are scoped to the owner’s user account; Pro credits to the workspace. No pricing or invoice is generated.',
          )}
        </p>
        <fieldset disabled={busy || plan !== savedPlan} className="space-y-3">
          <label className="block">
            {text('Kategori', 'Category')}
            <select
              className={inputClass}
              value={category}
              onChange={(event) => setCategory(event.target.value as 'chat' | 'write')}
            >
              <option value="chat">{text('Sohbet', 'Chat')}</option>
              <option value="write">{text('Yazma', 'Write')}</option>
            </select>
          </label>
          <label className="block">
            {text('Kredi adedi', 'Credit count')}
            <input
              required
              type="number"
              min={1}
              max={100000}
              step={1}
              className={inputClass}
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </label>
          <label className="block">
            {text('Ay (UTC)', 'Month (UTC)')}
            <input
              required
              type="month"
              className={inputClass}
              value={month}
              onChange={(event) => setMonth(event.target.value)}
            />
          </label>
          <label className="block">
            {text('Kayıt gerekçesi', 'Ledger reason')}
            <textarea
              required
              maxLength={500}
              className={inputClass}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          <button className={buttonClass} disabled={!amount || !reason.trim()}>
            {text('Manuel kredi ver', 'Grant manual credits')}
          </button>
        </fieldset>
      </form>
      <h3>{text('Kredi geçmişi', 'Credit history')}</h3>
      {loading && <p role="status">{text('Geçmiş yükleniyor…', 'Loading history…')}</p>}
      {ledger && (
        <>
          <p>
            {text('Kapsam', 'Scope')}: {ledger.scope} · {text('Ödeme durumu', 'Billing status')}:{' '}
            {ledger.billing_status}
          </p>
          {ledger.credits.length === 0 && (
            <p>
              {text('Bu plan kapsamında kredi kaydı yok.', 'No credit records in this plan scope.')}
            </p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr>
                  {[
                    text('Ay', 'Month'),
                    text('Kategori', 'Category'),
                    text('Adet', 'Amount'),
                    text('Gerekçe', 'Reason'),
                    text('Veriliş', 'Granted at'),
                    text('Kaydı veren', 'Granted by'),
                  ].map((label) => (
                    <th key={label} scope="col">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ledger.credits.map((credit) => (
                  <tr key={credit.id}>
                    <td>
                      {credit.month} · {credit.plan}
                    </td>
                    <td>{credit.category}</td>
                    <td>{credit.amount}</td>
                    <td>{credit.reason}</td>
                    <td>{timestamp(credit.created_at)}</td>
                    <td>{credit.granted_by || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

export default function AdminScreen({ user, section }: { user: User; section: string }) {
  const text = useEvidenceText();
  const [params, setParams] = useSearchParams();
  const [workspaces, setWorkspaces] = useState<AdminWorkspace[]>([]);
  const [programs, setPrograms] = useState<FundingProgram[]>([]);
  const [program, setProgram] = useState<FundingProgram | null>(null);
  const [operations, setOperations] = useState<AdminOperations | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const requestAbort = useRef<AbortController | null>(null);
  const selectedWorkspace = params.get('workspace') || '';
  const selectedProgram = params.get('program') || '';
  const workspaceOffset = Math.max(0, Number(params.get('offset')) || 0);
  const load = useCallback(async () => {
    requestAbort.current?.abort();
    if (!user.is_admin || section === 'sources') return;
    const controller = new AbortController();
    requestAbort.current = controller;
    setError('');
    setLoading(true);
    setProgram(null);
    setOperations(null);
    const request =
      section === 'entitlements'
        ? api<AdminWorkspace[]>(`/admin/workspaces?limit=100&offset=${workspaceOffset}`, {
            signal: controller.signal,
          }).then((data) => {
            if (!controller.signal.aborted) setWorkspaces(data);
          })
        : section === 'operations'
          ? api<AdminOperations>('/admin/operations', { signal: controller.signal }).then(
              (data) => {
                if (!controller.signal.aborted) setOperations(data);
              },
            )
          : Promise.all([
              api<FundingProgram[]>('/programs', { signal: controller.signal }).then((data) => {
                if (!controller.signal.aborted) setPrograms(data);
              }),
              selectedProgram
                ? api<FundingProgram>(`/programs/${encodeURIComponent(selectedProgram)}`, {
                    signal: controller.signal,
                  }).then((data) => {
                    if (!controller.signal.aborted) setProgram(data);
                  })
                : Promise.resolve(),
            ]);
    try {
      await request;
    } catch (reason) {
      if (!controller.signal.aborted) setError(errorText(reason));
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [user.is_admin, section, selectedProgram, workspaceOffset]);
  useEffect(() => {
    void load();
    return () => requestAbort.current?.abort();
  }, [load]);
  if (!user.is_admin)
    return (
      <section className={panelClass}>
        <h1>{text('Yönetici erişimi gerekli', 'Administrator access required')}</h1>
        <p>
          {text(
            'Yalnızca açıkça atanmış sistem yöneticileri erişebilir.',
            'Only explicitly appointed system administrators may access this console.',
          )}
        </p>
      </section>
    );
  if (!['sources', 'programs', 'entitlements', 'operations'].includes(section))
    return <p role="alert">{text('Yönetici bölümü bulunamadı.', 'Admin section not found.')}</p>;
  const workspace = workspaces.find((item) => item.id === selectedWorkspace);
  return (
    <div className="space-y-5">
      <section className={panelClass}>
        <h1>{text('Yönetici konsolu', 'Admin console')}</h1>
        <nav className="flex flex-wrap gap-3">
          {[
            ['sources', text('Kaynaklar', 'Sources')],
            ['programs', text('Programlar ve çağrılar', 'Programs and calls')],
            ['entitlements', text('Manuel yetkiler', 'Manual entitlements')],
            ['operations', text('İşletim', 'Operations')],
          ].map(([id, label]) => (
            <Link key={id} to={`/admin/${id}`} aria-current={section === id ? 'page' : undefined}>
              {label}
            </Link>
          ))}
        </nav>
        {error && <p role="alert">{error}</p>}
        {loading && <p role="status">{text('Yükleniyor…', 'Loading…')}</p>}
      </section>
      {section === 'sources' && <SourceAdmin isAdmin />}
      {section === 'programs' && (
        <>
          <section className={panelClass}>
            <h2>{text('Program / çağrı sürümleri', 'Program / call versions')}</h2>
            <label className="block">
              {text('Program', 'Program')}
              <select
                className={inputClass}
                value={selectedProgram}
                onChange={(event) => {
                  const next = new URLSearchParams(params);
                  if (event.target.value) next.set('program', event.target.value);
                  else next.delete('program');
                  setParams(next);
                }}
              >
                <option value="">{text('Program seçin', 'Choose a program')}</option>
                {programs.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <p>
              {text(
                'Çağrı tanımları aşağıdaki resmî kaynak incelemesi üzerinden düzenlenir ve insan onayıyla yayımlanır; yayımlanmış sürümler yerinde değiştirilmez.',
                'Call definitions are edited through the official-source review below and published with human acknowledgement; published versions are not overwritten.',
              )}
            </p>
            {program && (
              <>
                <h3>
                  {program.name} · {program.catalog_status}
                </h3>
                <p>
                  {program.institution} · {program.country}
                </p>
                <SourceLink url={program.official_url} />
                <ul>
                  {(program.calls || []).map((call) => (
                    <li key={call.id}>
                      {call.title} · v{call.version} · {call.status} · {call.language} ·{' '}
                      {text('Son tarih', 'Deadline')}: {timestamp(call.deadline)} ·{' '}
                      {text('Kural sürümü', 'Rule version')}: {call.rule_version}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
          {selectedProgram && (
            <SourceAdmin key={selectedProgram} isAdmin programId={selectedProgram} />
          )}
        </>
      )}
      {section === 'entitlements' && (
        <>
          <section className={panelClass}>
            <h2>
              {text('Manuel yetki ve kredi yönetimi', 'Manual entitlement and credit management')}
            </h2>
            <p>
              {text(
                'Bu konsol ödeme işlemez ve abonelik satmaz.',
                'This console does not process payments or sell subscriptions.',
              )}
            </p>
            <label className="block">
              {text('Çalışma alanı', 'Workspace')}
              <select
                className={inputClass}
                value={selectedWorkspace}
                onChange={(event) => {
                  const next = new URLSearchParams(params);
                  if (event.target.value) next.set('workspace', event.target.value);
                  else next.delete('workspace');
                  setParams(next);
                }}
              >
                <option value="">{text('Çalışma alanı seçin', 'Choose a workspace')}</option>
                {workspaces.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} · {item.plan} · {item.id}
                  </option>
                ))}
              </select>
            </label>
            {!loading && selectedWorkspace && !workspace && (
              <p role="alert">{text('Çalışma alanı bulunamadı.', 'Workspace not found.')}</p>
            )}
          </section>
          {workspace && (
            <EntitlementEditor
              key={workspace.id}
              workspace={workspace}
              onChanged={(updated) =>
                setWorkspaces((current) =>
                  current.map((item) => (item.id === updated.id ? updated : item)),
                )
              }
            />
          )}
        </>
      )}
      {section === 'entitlements' && (
        <div className="flex gap-3">
          {workspaceOffset > 0 && (
            <button
              className={buttonClass}
              disabled={loading}
              onClick={() => {
                const next = new URLSearchParams(params);
                next.set('offset', String(Math.max(0, workspaceOffset - 100)));
                next.delete('workspace');
                setParams(next);
              }}
            >
              {text('Önceki çalışma alanları', 'Previous workspaces')}
            </button>
          )}
          {workspaces.length === 100 && (
            <button
              className={buttonClass}
              disabled={loading}
              onClick={() => {
                const next = new URLSearchParams(params);
                next.set('offset', String(workspaceOffset + 100));
                next.delete('workspace');
                setParams(next);
              }}
            >
              {text('Sonraki çalışma alanları', 'Next workspaces')}
            </button>
          )}
        </div>
      )}
      {section === 'operations' && (
        <section className={panelClass}>
          <h2>{text('İşletim metaverisi', 'Operations metadata')}</h2>
          <p>
            {text(
              'Özel kullanıcı metinleri, belgeler, anahtarlar veya sunucu adresleri gösterilmez.',
              'Private user texts, documents, keys and server addresses are not shown.',
            )}
          </p>
          <button className={buttonClass} disabled={loading} onClick={() => void load()}>
            {text('Yenile', 'Refresh')}
          </button>
          {operations && (
            <>
              <p>
                {operations.health.ready
                  ? text('Kritik hizmetler hazır', 'Critical services ready')
                  : text('Kritik hizmetler hazır değil', 'Critical services not ready')}{' '}
                ·{' '}
                {operations.health.degraded
                  ? text('Bazı hizmetler kullanılamıyor', 'Some services unavailable')
                  : text('Hizmet durumu normal', 'Service status normal')}
              </p>
              <dl className="grid grid-cols-2 gap-2">
                {Object.entries(operations.counts).map(([name, count]) => (
                  <div key={name}>
                    <dt>{name}</dt>
                    <dd>{count}</dd>
                  </div>
                ))}
              </dl>
              <h3>{text('AI işlem durumları', 'AI operation statuses')}</h3>
              <ul>
                {operations.operations.map((item) => (
                  <li key={item.status}>
                    {item.status}: {item.count}
                  </li>
                ))}
              </ul>
              <h3>{text('E-posta kuyruğu', 'Mail queue')}</h3>
              <ul>
                {operations.mail.map((item) => (
                  <li key={item.status}>
                    {item.status}: {item.count}
                  </li>
                ))}
              </ul>
              <h3>{text('Hizmet hazırlığı', 'Service readiness')}</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr>
                      <th scope="col">{text('Hizmet', 'Service')}</th>
                      <th scope="col">{text('Kritik', 'Critical')}</th>
                      <th scope="col">{text('Yapılandırılmış', 'Configured')}</th>
                      <th scope="col">{text('Kullanılabilir', 'Available')}</th>
                      <th scope="col">{text('Durum', 'Status')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {operations.health.services.map((service) => (
                      <tr key={service.code}>
                        <td>{service.code}</td>
                        <td>{service.critical ? text('Evet', 'Yes') : text('Hayır', 'No')}</td>
                        <td>{service.configured ? text('Evet', 'Yes') : text('Hayır', 'No')}</td>
                        <td>
                          {service.available === null
                            ? text('Kontrol edilmedi', 'Unchecked')
                            : service.available
                              ? text('Evet', 'Yes')
                              : text('Hayır', 'No')}
                        </td>
                        <td>{service.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <h3>{text('Arka plan işçileri', 'Background workers')}</h3>
              {operations.health.workers.length === 0 && (
                <p>
                  {text('Kaydedilmiş işçi sinyali yok.', 'No worker heartbeat has been recorded.')}
                </p>
              )}
              <ul>
                {operations.health.workers.map((worker) => (
                  <li key={worker.worker_name}>
                    {worker.worker_name} · {worker.status} · {timestamp(worker.checked_at)} ·{' '}
                    {worker.stale
                      ? text('Sinyal güncel değil', 'Heartbeat stale')
                      : text('Sinyal güncel', 'Heartbeat current')}
                  </li>
                ))}
              </ul>
              <h3>{text('Yedek ve geri yükleme', 'Backup and restore')}</h3>
              <p>
                {text(
                  'İşlemler çevrimdışı CLI ile, uygulama ve işçiler durdurularak yapılır. Aşağıdaki kayıt dosya oluşturma / geri yükleme başarısını gösterir; yedeğin güncel veya kurtarma tatbikatının yapılmış olduğu anlamına gelmez.',
                  'Operations run through the offline CLI after stopping the app and workers. These timestamps record successful archive creation / restore; they do not prove backup freshness or a recovery drill.',
                )}
              </p>
              <dl>
                <div>
                  <dt>{text('Son başarılı yedek oluşturma', 'Last successful backup creation')}</dt>
                  <dd>
                    {operations.health.backup.created_at
                      ? timestamp(operations.health.backup.created_at)
                      : text('Kayıt yok', 'No record')}
                  </dd>
                </div>
                <div>
                  <dt>
                    {text(
                      'Bu depoya son başarılı geri yükleme',
                      'Last successful restore into this storage',
                    )}
                  </dt>
                  <dd>
                    {operations.health.backup.restored_at
                      ? timestamp(operations.health.backup.restored_at)
                      : text('Kayıt yok', 'No record')}
                  </dd>
                </div>
              </dl>
            </>
          )}
        </section>
      )}
    </div>
  );
}
