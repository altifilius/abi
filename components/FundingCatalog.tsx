import { useEffect, useState } from 'react';
import { api } from '../services/api';
import type { Project, Workspace } from '../types';
import { COUNTRIES } from '../types';
import {
  buttonClass,
  errorText,
  inputClass,
  panelClass,
  SourceLink,
  timestamp,
  useEvidenceText,
} from './EvidenceUi';

export interface FundingCall {
  id: string;
  title: string;
  version: number;
  status: string;
  opens_at: string | null;
  deadline: string | null;
  rule_version: string;
  source_revision_id: string | null;
  language: string;
  portal_url: string | null;
  rules: unknown;
  template: unknown;
  finance: unknown;
}
export interface FundingSource {
  id: string;
  program_id: string;
  version: number;
  source_url: string;
  sha256: string;
  checked_at: string;
  publication_status: string;
  draft_call_ids?: string[];
}
export interface FundingProgram {
  id: string;
  code: string;
  name: string;
  institution: string;
  country: string;
  support_type: string;
  description: string;
  official_url: string;
  catalog_status: string;
  current_call: FundingCall | null;
  calls?: FundingCall[];
  sources?: FundingSource[];
}
export interface FundingCatalogProps {
  workspace?: Workspace;
  project?: Project;
  onSelectCall?: (callId: string) => void;
  onEvaluate?: (call: FundingCall) => void;
  evaluating?: boolean;
}

export default function FundingCatalog({
  workspace,
  project,
  onSelectCall,
  onEvaluate,
  evaluating,
}: FundingCatalogProps) {
  const text = useEvidenceText();
  const [query, setQuery] = useState('');
  const [country, setCountry] = useState('');
  const [support, setSupport] = useState('');
  const [programs, setPrograms] = useState<FundingProgram[]>([]);
  const [details, setDetails] = useState<Record<string, FundingProgram>>({});
  const [submittedFilters, setSubmittedFilters] = useState({ query: '', country: '', support: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const confirmed = !!project && project.confirmed_revision === project.revision;
  const canEvaluate = ['owner', 'admin', 'reviewer', 'editor'].includes(workspace?.role || '');

  useEffect(() => {
    let active = true;
    setBusy(true);
    setError('');
    setPrograms([]);
    const params = new URLSearchParams();
    if (submittedFilters.query) params.set('q', submittedFilters.query);
    if (submittedFilters.country) params.set('country', submittedFilters.country);
    if (submittedFilters.support) params.set('support_type', submittedFilters.support);
    api<FundingProgram[]>(`/programs?${params.toString()}`)
      .then((data) => {
        if (active) setPrograms(data);
      })
      .catch((reason) => {
        if (active) setError(errorText(reason));
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [submittedFilters]);

  async function loadDetails(id: string) {
    setError('');
    try {
      const result = await api<FundingProgram>(`/programs/${id}`);
      setDetails((previous) => ({ ...previous, [id]: result }));
    } catch (reason) {
      setError(errorText(reason));
    }
  }

  return (
    <section
      className="space-y-5"
      aria-label={text('Resmî destek kataloğu', 'Official funding catalog')}
    >
      <div className={panelClass}>
        <h2 className="text-xl font-semibold">
          {text('Resmî destek kataloğu', 'Official funding catalog')}
        </h2>
        <p>
          {text(
            'Seçilmiş resmî kaynaklar; tüm dünyadaki destekleri kapsamaz. Taslak çağrılar insan incelemesi tamamlanana kadar değerlendirmeye açılamaz.',
            'Selected official sources; not a comprehensive worldwide catalog. Draft calls cannot be evaluated until human publication review is complete.',
          )}
        </p>
        <form
          className="grid gap-3 sm:grid-cols-4"
          onSubmit={(event) => {
            event.preventDefault();
            setSubmittedFilters({ query: query.trim(), country, support });
          }}
        >
          <label>
            {text('Arama', 'Search')}
            <input
              className={inputClass}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <label>
            {text('Ülke', 'Country')}
            <select
              className={inputClass}
              value={country}
              onChange={(event) => setCountry(event.target.value)}
            >
              <option value="">{text('Tümü', 'All')}</option>
              {['EU', ...COUNTRIES].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label>
            {text('Destek türü', 'Support type')}
            <select
              className={inputClass}
              value={support}
              onChange={(event) => setSupport(event.target.value)}
            >
              <option value="">{text('Tümü', 'All')}</option>
              <option value="grant">{text('Hibe', 'Grant')}</option>
              <option value="equity_accelerator">
                {text('Sermaye / hızlandırıcı', 'Equity / accelerator')}
              </option>
              <option value="tax_employment">
                {text('Vergi / istihdam teşviki', 'Tax / employment incentive')}
              </option>
            </select>
          </label>
          <button className={buttonClass} disabled={busy}>
            {text('Ara', 'Search')}
          </button>
        </form>
        {busy && <p role="status">{text('Kaynaklar yükleniyor…', 'Loading sources…')}</p>}
        {error && <p role="alert">{error}</p>}
        {!busy && !error && programs.length === 0 && (
          <p>{text('Bu filtrelerde program bulunamadı.', 'No programs match these filters.')}</p>
        )}
      </div>
      {programs.map((program) => {
        const detail = details[program.id];
        const calls = detail?.calls || (program.current_call ? [program.current_call] : []);
        return (
          <article key={program.id} className={panelClass}>
            <h3 className="text-lg font-semibold">
              {program.code} — {program.name}
            </h3>
            <p>
              {program.institution} · {program.country} · {program.support_type} ·{' '}
              {program.catalog_status}
            </p>
            <p>{program.description}</p>
            <SourceLink url={program.official_url}>
              {text('Resmî program kaynağı', 'Official program source')}
            </SourceLink>
            <button className={buttonClass} onClick={() => loadDetails(program.id)}>
              {text(
                'Çağrı ve kaynak sürümlerini göster / yenile',
                'Show / refresh call and source versions',
              )}
            </button>
            {calls.length === 0 && (
              <p>
                {text(
                  'Yayımlanmış çağrı yok. Bilinen çağrı taslaklarını görmek için sürümleri açın.',
                  'No published call. Open versions to inspect known draft calls.',
                )}
              </p>
            )}
            {calls.map((call) => {
              const closed = !!call.deadline && new Date(call.deadline).getTime() < Date.now();
              const upcoming = !!call.opens_at && new Date(call.opens_at).getTime() > Date.now();
              return (
                <section
                  key={call.id}
                  className="border border-border-dark rounded-lg p-4 space-y-2"
                >
                  <h4 className="font-semibold">{call.title}</h4>
                  <p>
                    {call.status} · {text('Çağrı sürümü', 'Call version')} {call.version} ·{' '}
                    {text('Kural sürümü', 'Rule version')} {call.rule_version}
                  </p>
                  <p>
                    {text('Açılış', 'Opens')}: {timestamp(call.opens_at)} ·{' '}
                    {text('Son tarih', 'Deadline')}:{' '}
                    {call.deadline
                      ? timestamp(call.deadline)
                      : text(
                          'Kaynakta belirtilmemiş; açık olduğu varsayılmaz',
                          'Not specified in source; not assumed open',
                        )}
                  </p>
                  <p>
                    {closed
                      ? text('Son tarih geçti', 'Deadline passed')
                      : upcoming
                        ? text('Henüz açılmadı', 'Not yet open')
                        : text(
                            'Tarih ve diğer koşullar resmî kaynakta doğrulanmalıdır',
                            'Verify dates and other conditions in the official source',
                          )}
                  </p>
                  <p>
                    {text('Kaynak revizyonu', 'Source revision')}:{' '}
                    {call.source_revision_id || text('Eksik', 'Missing')} ·{' '}
                    {text('Başvuru dili', 'Application language')}: {call.language}
                  </p>
                  <SourceLink url={call.portal_url}>
                    {text('Resmî başvuru portalı (manuel)', 'Official application portal (manual)')}
                  </SourceLink>
                  <div className="flex flex-wrap gap-2">
                    {onEvaluate && (
                      <button
                        className={buttonClass}
                        disabled={
                          evaluating ||
                          workspace?.plan !== 'pro' ||
                          !confirmed ||
                          !canEvaluate ||
                          call.status !== 'published'
                        }
                        onClick={() => onEvaluate(call)}
                      >
                        {text('Tüm koşulları değerlendir', 'Evaluate all conditions')}
                      </button>
                    )}
                    {onSelectCall && (
                      <button
                        className={buttonClass}
                        disabled={workspace?.plan !== 'pro' || call.status !== 'published'}
                        onClick={() => onSelectCall(call.id)}
                      >
                        {text('Başvuru çalışma alanı', 'Application workspace')}
                      </button>
                    )}
                  </div>
                </section>
              );
            })}
            {detail?.sources?.map((source) => (
              <section
                key={source.id}
                className="text-sm space-y-1 border-t border-border-dark pt-3"
              >
                <p>
                  {text('Kaynak sürümü', 'Source version')} {source.version} ·{' '}
                  {source.publication_status} · {text('Kontrol', 'Checked')}:{' '}
                  {timestamp(source.checked_at)}
                </p>
                <SourceLink url={source.source_url} />
                <p className="break-all">SHA-256: {source.sha256}</p>
              </section>
            ))}
          </article>
        );
      })}
    </section>
  );
}
