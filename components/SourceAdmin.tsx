import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../services/api';
import {
  buttonClass,
  errorText,
  inputClass,
  panelClass,
  SourceLink,
  timestamp,
  useEvidenceText,
} from './EvidenceUi';
import type { FundingProgram, FundingSource } from './FundingCatalog';

interface SourceDiff {
  source: FundingSource;
  previous_source_id: string | null;
  diff: string;
  diff_truncated?: boolean;
  draft_call_ids: string[];
  source_contents?: { url: string; sha256: string; media_type?: string }[];
}

export default function SourceAdmin({ isAdmin }: { isAdmin: boolean }) {
  const text = useEvidenceText();
  const [sources, setSources] = useState<FundingSource[]>([]);
  const [diffs, setDiffs] = useState<Record<string, SourceDiff>>({});
  const [acknowledged, setAcknowledged] = useState<Record<string, boolean>>({});
  const [programs, setPrograms] = useState<Record<string, FundingProgram>>({});
  const [definitions, setDefinitions] = useState<Record<string, string>>({});
  const [savedDefinitions, setSavedDefinitions] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const activeLoad = useRef<AbortController | null>(null);

  const load = useCallback(() => {
    activeLoad.current?.abort();
    const controller = new AbortController();
    activeLoad.current = controller;
    const active = () => !controller.signal.aborted;
    setSources([]);
    setDiffs({});
    setPrograms({});
    setDefinitions({});
    setSavedDefinitions({});
    setAcknowledged({});
    setError('');
    if (!isAdmin) return controller;
    setBusy(true);
    api<FundingSource[]>('/admin/sources', { signal: controller.signal })
      .then((data) => {
        if (active()) setSources(data);
      })
      .catch((reason) => {
        if (active()) setError(errorText(reason));
      })
      .finally(() => {
        if (active()) setBusy(false);
      });
    return controller;
  }, [isAdmin]);
  useEffect(() => {
    const controller = load();
    return () => controller.abort();
  }, [load]);

  async function openDiff(id: string) {
    setBusy(true);
    setError('');
    try {
      const diff = await api<SourceDiff>(`/admin/sources/${id}/diff`);
      const program = await api<FundingProgram>(`/programs/${diff.source.program_id}`);
      setDiffs((previous) => ({ ...previous, [id]: diff }));
      setPrograms((previous) => ({ ...previous, [id]: program }));
      const drafts = (program.calls || []).filter((call) => diff.draft_call_ids.includes(call.id));
      setDefinitions((previous) => ({
        ...previous,
        ...Object.fromEntries(
          drafts.map((call) => [
            call.id,
            JSON.stringify(
              {
                title: call.title,
                opens_at: call.opens_at,
                deadline: call.deadline,
                rule_version: call.rule_version,
                rules: call.rules,
                template: call.template,
                finance: call.finance,
                language: call.language,
                portal_url: call.portal_url,
              },
              null,
              2,
            ),
          ]),
        ),
      }));
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setBusy(false);
    }
  }

  async function saveDefinition(callId: string) {
    setBusy(true);
    setError('');
    try {
      const definition: unknown = JSON.parse(definitions[callId]);
      await api(`/admin/calls/${callId}/draft`, {
        method: 'PUT',
        json: { acknowledgement: 'I reviewed the official sources and rules', definition },
      });
      setSavedDefinitions((previous) => ({ ...previous, [callId]: true }));
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setBusy(false);
    }
  }

  async function publish(callId: string) {
    setBusy(true);
    setError('');
    try {
      await api(`/admin/calls/${callId}/publish`, {
        method: 'POST',
        json: { acknowledgement: 'I reviewed the official sources and rules' },
      });
      load();
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setBusy(false);
    }
  }

  if (!isAdmin)
    return (
      <section className={panelClass}>
        <h2>{text('Kaynak yayımlama', 'Source publication')}</h2>
        <p>
          {text(
            'Yalnızca açıkça atanmış sistem yöneticileri erişebilir. İlk kayıt olan kullanıcıya yönetici yetkisi verilmez.',
            'Only explicitly appointed system administrators may access this screen. The first registered user is not granted administrator privileges.',
          )}
        </p>
      </section>
    );

  return (
    <section className="space-y-5">
      <div className={panelClass}>
        <h2 className="text-xl font-semibold">
          {text(
            'İnsan incelemesi: bekleyen resmî kaynaklar',
            'Human review: pending official sources',
          )}
        </h2>
        <p>
          {text(
            'Otomatik kaynak kontrolü yalnızca taslak oluşturur. Kaynak farkı, çağrı kuralları, zorunlu belgeler ve tarihler insan tarafından doğrulanmadan yayınlamayın. Eski değerlendirmeler değiştirilmez.',
            'Automatic source checking creates drafts only. Do not publish before a human verifies source changes, call rules, required documents and dates. Historical evaluations are never rewritten.',
          )}
        </p>
        <button className={buttonClass} disabled={busy} onClick={load}>
          {text('Yenile', 'Refresh')}
        </button>
        {busy && <p role="status">{text('İşlem sürüyor…', 'Operation in progress…')}</p>}
        {error && <p role="alert">{error}</p>}
        {!busy && !error && sources.length === 0 && (
          <p>{text('Bekleyen kaynak yok.', 'No pending sources.')}</p>
        )}
      </div>
      {sources.map((source) => (
        <article className={panelClass} key={source.id}>
          <h3 className="font-semibold">
            {text('Kaynak sürümü', 'Source version')} {source.version} · {source.publication_status}
          </h3>
          <SourceLink url={source.source_url} />
          <p>
            {text('Kontrol zamanı', 'Checked at')}: {timestamp(source.checked_at)}
          </p>
          <p className="break-all">SHA-256: {source.sha256}</p>
          <button className={buttonClass} disabled={busy} onClick={() => openDiff(source.id)}>
            {text('Önceki sürümle farkı göster', 'Inspect diff against previous version')}
          </button>
          {diffs[source.id] && (
            <>
              <p>
                {text('Önceki kaynak', 'Previous source')}:{' '}
                {diffs[source.id].previous_source_id ||
                  text('İlk sürüm — önceki kaynak yok', 'Initial version — no previous source')}
              </p>
              <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words text-sm border border-border-dark rounded-lg p-3">
                {diffs[source.id].diff ||
                  text(
                    'Metin farkı yok; kurallar yine incelenmelidir.',
                    'No textual diff; rules still require review.',
                  )}
              </pre>
              {diffs[source.id].diff_truncated && (
                <p role="status">
                  {text(
                    'Fark görünümü kesildi. Tam resmî kaynakları inceleyin.',
                    'Diff preview was truncated. Review the complete official sources.',
                  )}
                </p>
              )}
              {diffs[source.id].source_contents?.map((content) => (
                <div key={content.url}>
                  <SourceLink url={content.url} />
                  <p className="break-all">
                    {content.media_type} · SHA-256: {content.sha256}
                  </p>
                </div>
              ))}
              {programs[source.id]?.calls
                ?.filter((call) => diffs[source.id].draft_call_ids.includes(call.id))
                .map((call) => (
                  <details key={call.id} open>
                    <summary>
                      {call.title} · v{call.version} · {text('Kural sürümü', 'Rule version')}{' '}
                      {call.rule_version}
                    </summary>
                    <p>
                      {text('Açılış', 'Opens')}: {timestamp(call.opens_at)} ·{' '}
                      {text('Son tarih', 'Deadline')}: {timestamp(call.deadline)}
                    </p>
                    <SourceLink url={call.portal_url} />
                    <h4>{text('Kurallar', 'Rules')}</h4>
                    <pre className="whitespace-pre-wrap break-words text-sm">
                      {JSON.stringify(call.rules, null, 2)}
                    </pre>
                    <h4>
                      {text('Bölümler ve zorunlu belgeler', 'Sections and required documents')}
                    </h4>
                    <pre className="whitespace-pre-wrap break-words text-sm">
                      {JSON.stringify(call.template, null, 2)}
                    </pre>
                    <h4>{text('Finansman koşulları', 'Finance conditions')}</h4>
                    <pre className="whitespace-pre-wrap break-words text-sm">
                      {JSON.stringify(call.finance, null, 2)}
                    </pre>
                    <label className="block">
                      {text('İncelenen çağrı tanımı (JSON)', 'Reviewed call definition (JSON)')}
                      <textarea
                        className={inputClass}
                        rows={14}
                        value={definitions[call.id] || ''}
                        disabled={busy}
                        onChange={(event) => {
                          setDefinitions((previous) => ({
                            ...previous,
                            [call.id]: event.target.value,
                          }));
                          setSavedDefinitions((previous) => ({ ...previous, [call.id]: false }));
                        }}
                      />
                    </label>
                    <p>
                      {text(
                        'Kaynak değişikliğinden sonra kuralları ve tarihleri doğrulayıp bu tanımı kaydedin; kaydetmek yayımlamak değildir.',
                        'After source changes, verify rules and dates and save this definition; saving does not publish it.',
                      )}
                    </p>
                    <button
                      className={buttonClass}
                      disabled={busy || !acknowledged[source.id] || !definitions[call.id]}
                      onClick={() => saveDefinition(call.id)}
                    >
                      {text('İncelenen taslak tanımını kaydet', 'Save reviewed draft definition')}
                    </button>
                  </details>
                ))}
              <label className="flex gap-2">
                <input
                  type="checkbox"
                  checked={acknowledged[source.id] === true}
                  onChange={(event) =>
                    setAcknowledged((previous) => ({
                      ...previous,
                      [source.id]: event.target.checked,
                    }))
                  }
                />
                {text(
                  'Resmî kaynakları ve çağrı kurallarını insan olarak inceledim.',
                  'I personally reviewed the official sources and call rules.',
                )}
              </label>
              {diffs[source.id].draft_call_ids.map((callId) => (
                <div key={callId} className="flex flex-wrap gap-2 items-center">
                  <span className="break-all">
                    {text('Taslak çağrı', 'Draft call')}: {callId}
                  </span>
                  <button
                    className={buttonClass}
                    disabled={busy || !acknowledged[source.id] || !savedDefinitions[callId]}
                    onClick={() => publish(callId)}
                  >
                    {text('İncelenen çağrıyı yayımla', 'Publish reviewed call')}
                  </button>
                </div>
              ))}
              {diffs[source.id].draft_call_ids.length === 0 && (
                <p>
                  {text(
                    'Bu kaynağa bağlı yayımlanabilir taslak çağrı yok.',
                    'No publishable draft calls are linked to this source.',
                  )}
                </p>
              )}
            </>
          )}
        </article>
      ))}
    </section>
  );
}
