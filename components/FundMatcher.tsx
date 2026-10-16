import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../services/api';
import type { Project, Workspace } from '../types';
import {
  buttonClass,
  errorText,
  inputClass,
  panelClass,
  SourceLink,
  timestamp,
  useEvidenceText,
} from './EvidenceUi';
import FundingCatalog, { type FundingCall } from './FundingCatalog';

interface Condition {
  id: string;
  label: string;
  status: string;
  field?: string;
  actual: unknown;
  expected: unknown;
  source_url: string;
  source_locator?: string;
  review?: { actor_id: string; approved: boolean; notes: string; reviewed_at: string };
}
interface Evaluation {
  id: string;
  project_id: string;
  profile_revision: number;
  call_id: string;
  call_version: number;
  source_revision_id: string;
  rule_version: string;
  evaluated_at: string;
  stale: boolean;
  result: {
    eligibility: string;
    conditions: Condition[];
    ranking: { score: number; explanation: string };
    reviewed_from?: string;
  };
}
interface FundMatcherProps {
  project: Project;
  workspace: Workspace;
  onSelectCall?: (callId: string) => void;
}

export default function FundMatcher({ project, workspace, onSelectCall }: FundMatcherProps) {
  const text = useEvidenceText();
  const [evaluationList, setEvaluationList] = useState<{
    projectId: string;
    items: Evaluation[];
  } | null>(null);
  const evaluations = evaluationList?.projectId === project.id ? evaluationList.items : [];
  const scope = useRef<{ projectId: string; controller: AbortController } | null>(null);
  const listRequest = useRef<AbortController | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [decisions, setDecisions] = useState<Record<string, { approved: boolean; notes: string }>>(
    {},
  );
  const canReview = ['owner', 'admin', 'reviewer'].includes(workspace.role || '');

  const loadEvaluations = useCallback(async () => {
    const active = scope.current;
    if (active?.projectId !== project.id || active.controller.signal.aborted) return;
    listRequest.current?.abort();
    const request = new AbortController();
    listRequest.current = request;
    setError('');
    setLoading(true);
    try {
      const data = await api<Evaluation[]>(`/projects/${project.id}/evaluations`, {
        signal: request.signal,
      });
      if (request.signal.aborted || active.controller.signal.aborted) return;
      setEvaluationList({
        projectId: project.id,
        items: data.map((evaluation) => ({
          ...evaluation,
          stale: evaluation.stale || evaluation.profile_revision !== project.revision,
        })),
      });
    } catch (reason) {
      if (!request.signal.aborted && !active.controller.signal.aborted) setError(errorText(reason));
    } finally {
      if (!request.signal.aborted && !active.controller.signal.aborted) setLoading(false);
    }
  }, [project.id, project.revision]);

  useEffect(() => {
    const active = { projectId: project.id, controller: new AbortController() };
    scope.current = active;
    setDecisions({});
    setBusy(false);
    void loadEvaluations();
    return () => {
      active.controller.abort();
      listRequest.current?.abort();
    };
  }, [project.id, loadEvaluations]);

  async function evaluate(call: FundingCall) {
    const active = scope.current;
    if (active?.projectId !== project.id || active.controller.signal.aborted) return;
    const signal = active.controller.signal;
    setBusy(true);
    setError('');
    try {
      await api<Evaluation>(`/projects/${project.id}/evaluate`, {
        method: 'POST',
        signal,
        json: { call_id: call.id },
      });
      if (!signal.aborted) await loadEvaluations();
    } catch (reason) {
      if (!signal.aborted) setError(errorText(reason));
    } finally {
      if (!signal.aborted) setBusy(false);
    }
  }

  async function review(evaluation: Evaluation) {
    const active = scope.current;
    if (active?.projectId !== project.id || active.controller.signal.aborted) return;
    const signal = active.controller.signal;
    setBusy(true);
    setError('');
    const selected = evaluation.result.conditions.filter(
      (condition) => condition.status === 'review' && decisions[`${evaluation.id}:${condition.id}`],
    );
    if (!selected.length) {
      setError(text('En az bir inceleme kararı seçin.', 'Select at least one review decision.'));
      setBusy(false);
      return;
    }
    try {
      await api<Evaluation>(`/evaluations/${evaluation.id}/review`, {
        method: 'POST',
        signal,
        json: {
          decisions: selected.map((condition) => ({
            condition_id: condition.id,
            ...decisions[`${evaluation.id}:${condition.id}`],
          })),
        },
      });
      if (!signal.aborted) await loadEvaluations();
    } catch (reason) {
      if (!signal.aborted) setError(errorText(reason));
    } finally {
      if (!signal.aborted) setBusy(false);
    }
  }

  const labels: Record<string, string> = {
    eligible: text('Koşullar sağlandı', 'Conditions satisfied'),
    ineligible: text('Uygun değil', 'Ineligible'),
    information_missing: text('Bilgi eksik', 'Information missing'),
    review_required: text('İnsan incelemesi gerekli', 'Human review required'),
    closed: text('Kapalı', 'Closed'),
    pass: text('Sağlandı', 'Pass'),
    fail: text('Sağlanmadı', 'Fail'),
    missing: text('Bilinmiyor / eksik bilgi', 'Unknown / missing information'),
    review: text('Yorum gerektirir', 'Interpretation required'),
  };

  return (
    <div className="space-y-6">
      <section className={panelClass}>
        <h2 className="text-xl font-semibold">
          {text('Kaynak temelli uygunluk', 'Source-grounded eligibility')}
        </h2>
        <p>
          {text(
            'Uygunluk, sıralama puanından ayrıdır. Eksik bilgiler “hayır” sayılmaz; insan yorumu ayrı inceleme gerektirir. Bu, resmî hibe veya kabul kararı değildir.',
            'Eligibility is separate from ranking. Missing facts are not treated as “no”; interpretation requires human review. This is not an official award or acceptance decision.',
          )}
        </p>
        {workspace.plan !== 'pro' && (
          <p>
            {text(
              'Kaynak kataloğu Free ile açıktır. Uygunluk değerlendirmesi ve başvuru paketleri Pro gerektirir. Ödeme etkinleştirilmiş değildir.',
              'The source catalog is available on Free. Eligibility evaluation and application packages require Pro. Payment activation is not implemented.',
            )}
          </p>
        )}
        {project.confirmed_revision !== project.revision && (
          <p>
            {text(
              'Değerlendirmeden önce mevcut profil sürümünü profil ekranında onaylayın.',
              'Confirm the current profile revision in the profile editor before evaluation.',
            )}
          </p>
        )}
        <p>
          {text('Mevcut profil sürümü', 'Current profile revision')}: {project.revision} ·{' '}
          {text('Onaylı sürüm', 'Confirmed revision')}: {project.confirmed_revision ?? '—'}
        </p>
        {error && <p role="alert">{error}</p>}
      </section>
      <FundingCatalog
        workspace={workspace}
        project={project}
        onSelectCall={onSelectCall}
        onEvaluate={evaluate}
        evaluating={busy}
      />
      <section className={panelClass}>
        <div className="flex flex-wrap justify-between gap-2">
          <h2 className="text-xl font-semibold">
            {text('Değerlendirme geçmişi — tüm sonuçlar', 'Evaluation history — all results')}
          </h2>
          <button
            className={buttonClass}
            disabled={loading || busy}
            onClick={() => void loadEvaluations()}
          >
            {text('Yenile', 'Refresh')}
          </button>
        </div>
        {loading && <p role="status">{text('Geçmiş yükleniyor…', 'Loading history…')}</p>}
        {!loading && !error && evaluations.length === 0 && (
          <p>{text('Henüz kayıtlı değerlendirme yok.', 'No saved evaluations yet.')}</p>
        )}
        {evaluations.map((evaluation) => (
          <article
            key={evaluation.id}
            className="border border-border-dark rounded-lg p-4 space-y-3"
          >
            <h3 className="font-semibold">
              {labels[evaluation.result.eligibility] || evaluation.result.eligibility}
            </h3>
            {(evaluation.stale || evaluation.profile_revision !== project.revision) && (
              <p role="status">
                {text(
                  'ESKİ: Profil değişti. Tarihsel kayıt korunur; mevcut profil için yeniden değerlendirin.',
                  'STALE: The profile changed. Historical evidence is retained; evaluate the current profile again.',
                )}
              </p>
            )}
            <p>
              {timestamp(evaluation.evaluated_at)} · {text('Profil', 'Profile')}{' '}
              {evaluation.profile_revision} · {text('Çağrı', 'Call')} {evaluation.call_id} / v
              {evaluation.call_version}
            </p>
            <p>
              {text('Kaynak revizyonu', 'Source revision')}: {evaluation.source_revision_id} ·{' '}
              {text('Kural sürümü', 'Rule version')}: {evaluation.rule_version}
            </p>
            <p>
              {text('Ayrı sıralama puanı', 'Separate ranking score')}:{' '}
              {evaluation.result.ranking.score} — {evaluation.result.ranking.explanation}
            </p>
            {evaluation.result.reviewed_from && (
              <p>
                {text('İncelenen önceki kayıt', 'Reviewed prior record')}:{' '}
                {evaluation.result.reviewed_from}
              </p>
            )}
            {evaluation.result.conditions.map((condition) => {
              const key = `${evaluation.id}:${condition.id}`;
              return (
                <section key={condition.id} className="border-t border-border-dark pt-3 space-y-2">
                  <h4 className="font-semibold">
                    {condition.label} — {labels[condition.status] || condition.status}
                  </h4>
                  <p>
                    {text('Alan', 'Field')}: {condition.field || '—'}
                  </p>
                  <p className="break-all">
                    {text('Mevcut değer', 'Actual')}:{' '}
                    {condition.actual === null || condition.actual === undefined
                      ? text('Bilinmiyor', 'Unknown')
                      : JSON.stringify(condition.actual)}
                  </p>
                  <p className="break-all">
                    {text('Beklenen', 'Expected')}: {JSON.stringify(condition.expected) ?? '—'}
                  </p>
                  <SourceLink url={condition.source_url} />
                  <p>{condition.source_locator}</p>
                  {condition.review && (
                    <p>
                      {text('İnceleyen', 'Reviewed by')}: {condition.review.actor_id} ·{' '}
                      {timestamp(condition.review.reviewed_at)} ·{' '}
                      {condition.review.approved
                        ? text('Onaylandı', 'Approved')
                        : text('Reddedildi', 'Rejected')}{' '}
                      · {condition.review.notes}
                    </p>
                  )}
                  {condition.status === 'review' &&
                    workspace.plan === 'pro' &&
                    canReview &&
                    !(evaluation.stale || evaluation.profile_revision !== project.revision) && (
                      <div className="space-y-2">
                        <label>
                          {text('İnsan kararı', 'Human decision')}
                          <select
                            className={inputClass}
                            value={decisions[key] ? String(decisions[key].approved) : ''}
                            onChange={(event) =>
                              setDecisions((previous) => {
                                const next = { ...previous };
                                if (!event.target.value) delete next[key];
                                else
                                  next[key] = {
                                    approved: event.target.value === 'true',
                                    notes: next[key]?.notes || '',
                                  };
                                return next;
                              })
                            }
                          >
                            <option value="">{text('Karar seçin', 'Choose a decision')}</option>
                            <option value="true">
                              {text('Koşul sağlandı', 'Condition satisfied')}
                            </option>
                            <option value="false">
                              {text('Koşul sağlanmadı', 'Condition not satisfied')}
                            </option>
                          </select>
                        </label>
                        {decisions[key] && (
                          <label>
                            {text(
                              'İnceleme gerekçesi (en az 10 karakter)',
                              'Review rationale (at least 10 characters)',
                            )}
                            <textarea
                              className={inputClass}
                              minLength={10}
                              maxLength={3000}
                              required
                              value={decisions[key].notes}
                              onChange={(event) =>
                                setDecisions((previous) => ({
                                  ...previous,
                                  [key]: { ...previous[key], notes: event.target.value },
                                }))
                              }
                            />
                          </label>
                        )}
                      </div>
                    )}
                </section>
              );
            })}
            {workspace.plan === 'pro' &&
              canReview &&
              !evaluation.stale &&
              evaluation.profile_revision === project.revision &&
              evaluation.result.conditions.some((condition) => condition.status === 'review') && (
                <button
                  className={buttonClass}
                  disabled={
                    busy ||
                    !evaluation.result.conditions.some(
                      (condition) =>
                        condition.status === 'review' &&
                        decisions[`${evaluation.id}:${condition.id}`],
                    ) ||
                    evaluation.result.conditions.some(
                      (condition) =>
                        condition.status === 'review' &&
                        decisions[`${evaluation.id}:${condition.id}`] &&
                        decisions[`${evaluation.id}:${condition.id}`].notes.trim().length < 10,
                    )
                  }
                  onClick={() => review(evaluation)}
                >
                  {text(
                    'İncelemeyi yeni tarihsel kayıt olarak kaydet',
                    'Save review as a new historical record',
                  )}
                </button>
              )}
          </article>
        ))}
      </section>
    </div>
  );
}
