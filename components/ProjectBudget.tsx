import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { type ProjectSave, useProjectDraft } from '../hooks/useProjectState';
import { useI18n } from '../i18n';
import { errorMessage } from '../services/api';
import type { Project, Workspace } from '../types';
import BudgetEditor from './BudgetEditor';

export function projectBudgetTotal(items: { amount: string }[]): string | null {
  let total = 0n;
  for (const item of items) {
    if (item.amount.length > 80 || !/^\d+(\.\d+)?$/.test(item.amount)) return null;
    const [whole, fraction = ''] = item.amount.split('.');
    if (whole.replace(/^0+(?=\d)/, '').length > 15 || /[1-9]/.test(fraction.slice(2))) return null;
    total += BigInt(whole) * 100n + BigInt(fraction.slice(0, 2).padEnd(2, '0'));
  }
  return `${total / 100n}.${String(total % 100n).padStart(2, '0')}`;
}
export default function ProjectBudget({
  project,
  workspace,
  save,
  readOnly = false,
}: {
  project: Project;
  workspace: Workspace;
  save: ProjectSave;
  readOnly?: boolean;
}) {
  const { text } = useI18n();
  const [params] = useSearchParams();
  const state = useProjectDraft(project);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const budget = state.draft.profile.budget || {
    currency: workspace.country === 'TR' ? 'TRY' : 'EUR',
    items: [],
  };
  const total = projectBudgetTotal(budget.items);
  return (
    <div className="stack">
      <h2>{text('Proje bütçesi (Pro)', 'Project budget (Pro)')}</h2>
      <p>
        {text(
          'Önce proje bütçesini kaydedin, sonra profili onaylayıp çağrı uygunluğunu değerlendirin. Başvuru bütçesi bundan ayrı bir kayıttır; aktarımı başvuruda açıkça seçersiniz.',
          'Save the project budget first, then confirm the profile and evaluate call eligibility. An application budget is a separate record; its import is explicitly selected in the application.',
        )}
      </p>
      {readOnly && <p className="notice">{text('Salt okunur erişim', 'Read-only access')}</p>}
      {state.conflict && (
        <section className="notice" role="alert">
          <p>
            {text(
              'Kayıt değişti. Bütçe düzenlemeleriniz korunuyor; güncel kaydı yüklemeden üzerine yazılamaz.',
              'The record changed. Budget edits are preserved; they cannot overwrite the newer record.',
            )}
          </p>
          <button
            disabled={busy}
            onClick={() => {
              state.discard();
              setError('');
            }}
          >
            {text(
              'Düzenlemeleri at ve güncel bütçeyi yükle',
              'Discard edits and load the current budget',
            )}
          </button>
        </section>
      )}
      <form
        className="panel stack"
        onSubmit={async (e) => {
          e.preventDefault();
          if (readOnly || busy || state.conflict || !state.dirty || total === null) return;
          setBusy(true);
          setError('');
          try {
            state.accept(
              await save({ profile: { ...state.draft.profile, budget } }, state.base.revision),
            );
          } catch (error) {
            setError(errorMessage(error));
          } finally {
            setBusy(false);
          }
        }}
      >
        <BudgetEditor
          mode="project"
          value={budget}
          disabled={readOnly || busy}
          onChange={(value) =>
            state.setDraft({ ...state.draft, profile: { ...state.draft.profile, budget: value } })
          }
        />
        <p>
          {text('Toplam', 'Total')}: {total ?? text('Geçersiz tutar', 'Invalid amount')}{' '}
          {budget.currency}
        </p>
        {!readOnly && (
          <div className="actions">
            <button
              className="primary"
              disabled={busy || !state.dirty || state.conflict || total === null}
            >
              {text('Proje bütçesini kaydet', 'Save project budget')}
            </button>
            <button
              type="button"
              disabled={busy || !state.dirty}
              onClick={() => {
                state.discard();
                setError('');
              }}
            >
              {text('Değişiklikleri at', 'Discard changes')}
            </button>
            <button
              type="button"
              disabled={
                busy ||
                state.dirty ||
                state.conflict ||
                project.confirmed_revision === project.revision
              }
              onClick={async () => {
                if (state.dirty || busy || state.conflict) return;
                setBusy(true);
                setError('');
                try {
                  state.accept(await save({ confirm_profile: true }, project.revision));
                } catch (error) {
                  setError(errorMessage(error));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {text('Kayıtlı profili ve bütçeyi onayla', 'Confirm saved profile and budget')}
            </button>
          </div>
        )}
      </form>
      <Link
        to={`/w/${workspace.id}/projects/${project.id}/eligibility${params.get('call') ? `?call=${encodeURIComponent(params.get('call')!)}` : ''}`}
      >
        {text('Çağrı uygunluğuna geç', 'Continue to call eligibility')}
      </Link>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </div>
  );
}
