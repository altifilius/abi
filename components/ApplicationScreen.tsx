import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n';
import { api, downloadFile, errorMessage } from '../services/api';
import type { Application, Project, Workspace } from '../types';
import BudgetEditor, { type Budget } from './BudgetEditor';

interface Call {
  id: string;
  title: string;
  version: number;
  language: string;
  portal_url?: string;
  finance?: { currency?: string; notes?: string; source_url?: string };
  template: {
    sections: { key: string; label: string; required: boolean; source_url?: string }[];
    documents: { key: string; label: string; required: boolean; source_url?: string }[];
    guidance: { title: string; text: string; url: string }[];
    official_template_url?: string;
  };
}
interface Data {
  sections: Record<string, string>;
  attachments: Record<string, string>;
  budget: Budget;
}
interface Check {
  errors: { code: string; message: string; field?: string }[];
  warnings: ({ code?: string; field?: string; message?: string } | string)[];
  budget?: Record<string, string>;
  ready_for_review: boolean;
}
interface Document {
  id: string;
  original_name: string;
  status: string;
}
export default function ApplicationScreen({
  project,
  workspace,
  selectedCall,
  onDiscover,
  onUsage,
}: {
  project: Project;
  workspace: Workspace;
  selectedCall: string;
  onDiscover: () => void;
  onUsage: () => void;
}) {
  const { text } = useI18n();
  const [apps, setApps] = useState<Application[]>([]);
  const [current, setCurrent] = useState<Application | null>(null);
  const [call, setCall] = useState<Call | null>(null);
  const [data, setData] = useState<Data>({
    sections: {},
    attachments: {},
    budget: { currency: 'EUR', items: [] },
  });
  const [docs, setDocs] = useState<Document[]>([]);
  const [check, setCheck] = useState<Check | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState('');
  const controller = useRef<AbortController | null>(null);
  const [languageAcknowledgedRevision, setLanguageAcknowledgedRevision] = useState<string | null>(
    null,
  );
  const currentRevisionKey = current ? `${current.id}:${current.revision}` : null;
  const languageReviewed =
    currentRevisionKey !== null && languageAcknowledgedRevision === currentRevisionKey;
  useEffect(() => {
    const active = new AbortController();
    controller.current = active;
    setApps([]);
    setCurrent(null);
    setCall(null);
    setCheck(null);
    setError('');
    setBusy(false);
    if (workspace.plan === 'pro') {
      Promise.all([
        api<Application[]>(`/projects/${project.id}/applications`, { signal: active.signal }),
        api<Document[]>(`/projects/${project.id}/documents`, { signal: active.signal }),
      ])
        .then(([items, documents]) => {
          if (!active.signal.aborted) {
            setApps(items);
            setDocs(documents);
          }
        })
        .catch((error) => {
          if (!active.signal.aborted) setError(errorMessage(error));
        });
    }
    return () => active.abort();
  }, [project.id, workspace.plan]);
  useEffect(() => {
    if (!current) return;
    const active = new AbortController();
    setData(current.data as unknown as Data);
    setCheck(null);
    setCall(null);
    api<Call>(`/calls/${current.call_id}`, { signal: active.signal })
      .then((value) => {
        if (!active.signal.aborted)
          setCall({
            ...value,
            template:
              (current as Application & { template?: Call['template'] }).template || value.template,
          });
      })
      .catch((error) => {
        if (!active.signal.aborted) setError(errorMessage(error));
      });
    return () => active.abort();
  }, [current]);
  const action = async (
    kind:
      | 'create'
      | 'save'
      | 'check'
      | 'submit-review'
      | 'approve'
      | 'reject'
      | 'docx'
      | 'pdf'
      | 'zip',
  ) => {
    const active = controller.current;
    if (!active || active.signal.aborted) return;
    setBusy(true);
    setError('');
    try {
      if (kind === 'create') {
        const value = await api<Application>(`/projects/${project.id}/applications`, {
          method: 'POST',
          json: { call_id: selectedCall },
          signal: active.signal,
        });
        if (!active.signal.aborted) {
          setApps((items) => [value, ...items]);
          setCurrent(value);
        }
      } else if (current) {
        if (['docx', 'pdf', 'zip'].includes(kind)) {
          await downloadFile(
            `/applications/${current.id}/export?format=${kind}`,
            `application.${kind}`,
            { signal: active.signal },
          );
        } else if (kind === 'check') {
          const result = await api<Check>(`/applications/${current.id}/check`, {
            method: 'POST',
            signal: active.signal,
          });
          if (!active.signal.aborted) setCheck(result);
        } else {
          const value = await api<Application>(
            `/applications/${current.id}${kind === 'save' ? '' : kind === 'reject' ? '/approve' : `/${kind}`}`,
            {
              method: kind === 'save' ? 'PATCH' : 'POST',
              json:
                kind === 'save'
                  ? { expected_revision: current.revision, data }
                  : kind === 'approve' || kind === 'reject'
                    ? {
                        expected_revision: current.revision,
                        approved: kind === 'approve',
                        notes,
                        ...(kind === 'approve' ? { confirmed_language: call?.language } : {}),
                      }
                    : { expected_revision: current.revision },
              signal: active.signal,
            },
          );
          if (!active.signal.aborted) {
            setCurrent(value);
            setApps((items) => items.map((item) => (item.id === value.id ? value : item)));
          }
        }
      }
    } catch (error) {
      if (!active.signal.aborted) setError(errorMessage(error));
    } finally {
      if (!active.signal.aborted) setBusy(false);
    }
  };
  const writeApplication = async () => {
    const active = controller.current;
    if (!current || !active || active.signal.aborted) return;
    setBusy(true);
    setError('');
    try {
      const value = await api<{ application: Application; requires_review: true }>(
        `/applications/${current.id}/write`,
        { method: 'POST', json: { expected_revision: current.revision }, signal: active.signal },
      );
      if (!active.signal.aborted) {
        setCurrent(value.application);
        setApps((items) =>
          items.map((item) => (item.id === value.application.id ? value.application : item)),
        );
        onUsage();
      }
    } catch (error) {
      if (!active.signal.aborted) setError(errorMessage(error));
    } finally {
      if (!active.signal.aborted) setBusy(false);
    }
  };
  if (workspace.plan !== 'pro')
    return (
      <section className="panel">
        <h1>{text('Başvuru ve bütçe · Pro', 'Application & budget · Pro')}</h1>
        <p>
          {text(
            'Çağrıya özel paket, bütçe kontrolü ve onay Pro gerektirir. Ücretsiz genel proje taslağı ve resmî fon araması kullanılabilir. Ödeme ve fiyatlandırma henüz etkin değildir; sahte ödeme akışı yoktur.',
            'Call-specific packages, budget checks and approval require Pro. Free general drafts and official funding search remain available. Billing and pricing are not enabled; there is no fake checkout.',
          )}
        </p>
        <button onClick={onDiscover}>
          {text('Ücretsiz fonları keşfet', 'Discover funding for free')}
        </button>
      </section>
    );
  return (
    <div className="stack">
      <h1>{text('Başvuru ve bütçe', 'Application & budget')}</h1>
      <p>
        {text(
          'Resmî kaynağa dayalı alan paketi; portalda otomatik gönderim yapılmaz. Çıktı dili çağrının dilidir ve kullanıcı incelemesi gerekir.',
          'Official-source field package; no automatic portal submission. The export language follows the call and requires user review.',
        )}
      </p>
      <section className="panel">
        <label>
          {text('Kayıtlı başvurular', 'Saved applications')}
          <select
            value={current?.id || ''}
            onChange={(e) => setCurrent(apps.find((item) => item.id === e.target.value) || null)}
          >
            <option value="">{text('Seçin', 'Select')}</option>
            {apps.map((item) => (
              <option key={item.id} value={item.id}>
                {item.call_id} · {item.state} · r{item.revision}
              </option>
            ))}
          </select>
        </label>
        <div className="actions">
          <button onClick={onDiscover}>{text('Çağrı seç', 'Select funding call')}</button>
          <button disabled={busy || !selectedCall} onClick={() => void action('create')}>
            {text('Seçili çağrıdan başvuru oluştur', 'Create application from selected call')}
          </button>
        </div>
        {selectedCall && (
          <p>
            {text('Seçili çağrı', 'Selected call')}: {selectedCall}
          </p>
        )}
      </section>
      {current && (
        <>
          <section className="panel">
            <h2>{call?.title || current.call_id}</h2>
            <p>
              {text('Başvuru dili', 'Application language')}: {call?.language || '—'}
            </p>
            <button disabled={busy || !call} onClick={() => void writeApplication()}>
              {text(
                'Çağrı dilinde AI ile yaz / çevir (1 yazım, inceleme gerekli)',
                'AI write / translate in call language (1 writing credit, review required)',
              )}
            </button>
            <p>
              {text('Durum', 'State')}: {current.state} · r{current.revision} ·{' '}
              {text('Profil revizyonu', 'Profile revision')}: {current.profile_revision} /{' '}
              {project.revision} · {text('Çağrı sürümü', 'Call version')}: {current.call_version}
            </p>
            {current.profile_revision !== project.revision && (
              <p className="error">
                {text(
                  'Proje değişti. Bu başvuru tarihsel sürüme bağlıdır; güncel profille yeni başvuru oluşturun.',
                  'Project changed. This application is tied to a historical revision; create a new application with the current profile.',
                )}
              </p>
            )}
            {call?.template.sections.map((section) => (
              <label key={section.key}>
                {section.label}
                {section.required ? ' *' : ''}
                {section.source_url && (
                  <a href={section.source_url} target="_blank" rel="noreferrer">
                    {text('Resmî kaynak', 'Official source')}
                  </a>
                )}
                <textarea
                  rows={5}
                  value={data.sections?.[section.key] || ''}
                  onChange={(e) =>
                    setData({
                      ...data,
                      sections: { ...data.sections, [section.key]: e.target.value },
                    })
                  }
                />
              </label>
            ))}
            {call?.template.documents.map((requirement) => (
              <label key={requirement.key}>
                {requirement.label}
                {requirement.required ? ' *' : ''}
                <select
                  value={data.attachments?.[requirement.key] || ''}
                  onChange={(e) =>
                    setData({
                      ...data,
                      attachments: { ...data.attachments, [requirement.key]: e.target.value },
                    })
                  }
                >
                  <option value="">
                    {text('Doğrulanmış belge seç', 'Select verified document')}
                  </option>
                  {docs
                    .filter((doc) => doc.status === 'verified')
                    .map((doc) => (
                      <option value={doc.id} key={doc.id}>
                        {doc.original_name}
                      </option>
                    ))}
                </select>
              </label>
            ))}
            {data.budget && (
              <BudgetEditor
                value={data.budget}
                onChange={(budget) => setData({ ...data, budget })}
              />
            )}
            {call?.finance?.notes && <p>{call.finance.notes}</p>}
            <div className="actions">
              <button disabled={busy || !call} onClick={() => void action('save')}>
                {text('Alan ve bütçeyi kaydet', 'Save fields & budget')}
              </button>
              <button disabled={busy} onClick={() => void action('check')}>
                {text('Kayıtlı başvuruyu kontrol et', 'Check saved application')}
              </button>
              <button disabled={busy} onClick={() => void action('submit-review')}>
                {text('İncelemeye gönder', 'Submit for review')}
              </button>
            </div>
            <p>
              {text(
                'Kontrol ve onay işlemleri kayıtlı içeriği kullanır. Düzenleme önceki onayı iptal eder.',
                'Checks and approval use saved content. Editing revokes earlier approval.',
              )}
            </p>
          </section>
          {check && (
            <section className="panel">
              <h2>{text('Kontrol sonucu', 'Check result')}</h2>
              <p>
                {check.ready_for_review
                  ? text('İnceleme için hazır', 'Ready for review')
                  : text('Zorunlu eksikler var', 'Required issues remain')}
              </p>
              <ul>
                {check.errors.map((item) => (
                  <li className="error" key={JSON.stringify([item.code, item.field, item.message])}>
                    {item.field}: {item.message}
                  </li>
                ))}
                {check.warnings.map((item) => (
                  <li
                    key={JSON.stringify(
                      typeof item === 'string'
                        ? ['warning', item]
                        : [item.code, item.field, item.message],
                    )}
                  >
                    {typeof item === 'string' ? item : item.message}
                  </li>
                ))}
              </ul>
              {check.budget && (
                <dl>
                  {Object.entries(check.budget).map(([key, value]) => (
                    <div key={key}>
                      <dt>{key}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </section>
          )}
          {['owner', 'admin', 'reviewer'].includes(workspace.role || '') && (
            <section className="panel">
              <h2>{text('İnceleyen onayı', 'Reviewer approval')}</h2>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={languageReviewed}
                  onChange={(e) =>
                    setLanguageAcknowledgedRevision(e.target.checked ? currentRevisionKey : null)
                  }
                />
                {text(
                  'Başvuru içeriğini çağrı dilinde inceledim',
                  'I reviewed application content in the call language',
                )}{' '}
                ({call?.language})
              </label>
              <label>
                {text('İnceleme notu', 'Review notes')}
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
              </label>
              <div className="actions">
                <button
                  disabled={busy || current.state !== 'review_requested' || !languageReviewed}
                  onClick={() => void action('approve')}
                >
                  {text('Onayla', 'Approve')}
                </button>
                <button
                  disabled={busy || current.state !== 'review_requested'}
                  onClick={() => void action('reject')}
                >
                  {text('Reddet / düzenleme iste', 'Reject / request changes')}
                </button>
              </div>
            </section>
          )}
          <section className="panel">
            <h2>{text('Onaylı paketi indir', 'Download approved package')}</h2>
            <div className="actions">
              {(['docx', 'pdf', 'zip'] as const).map((format) => (
                <button
                  key={format}
                  disabled={busy || current.state !== 'approved'}
                  onClick={() => void action(format)}
                >
                  {format.toUpperCase()}
                </button>
              ))}
            </div>
            <p>
              {text(
                'Yalnızca güncel, hatasız ve onaylı sürüm indirilebilir. Resmî portala kendiniz başvurmanız gerekir.',
                'Only the current, error-free, approved revision can be exported. You must submit manually through the official portal.',
              )}
            </p>
            {call?.portal_url && (
              <a href={call.portal_url} target="_blank" rel="noreferrer">
                {text('Resmî başvuru portalı', 'Official application portal')}
              </a>
            )}
            {call?.template.official_template_url && (
              <a href={call.template.official_template_url} target="_blank" rel="noreferrer">
                {text('Resmî şablon', 'Official template')}
              </a>
            )}
            {call?.template.guidance.map((item) => (
              <p key={item.url}>
                <a href={item.url} target="_blank" rel="noreferrer">
                  {item.title}
                </a>{' '}
                · {item.text}
              </p>
            ))}
          </section>
        </>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </div>
  );
}
