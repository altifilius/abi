import { useState } from 'react';
import { type ProjectSave, useProjectDraft } from '../hooks/useProjectState';
import { useI18n } from '../i18n';
import { errorMessage } from '../services/api';
import { COUNTRIES, type Profile, type Project, type Workspace } from '../types';
import ProgramQuestions from './ProgramQuestions';

const fields = [
  ['company', 'name', 'Şirket adı (isteğe bağlı)', 'Company name (optional)', 'text'],
  ['company', 'country', 'Şirket ülkesi', 'Company country', 'country'],
  ['company', 'legal_form', 'Hukuki tür', 'Legal form', 'text'],
  ['company', 'is_incorporated', 'Şirket kuruldu mu?', 'Incorporated?', 'boolean'],
  ['company', 'is_sme', 'KOBİ mi?', 'SME?', 'boolean'],
  ['company', 'employee_count', 'Çalışan sayısı', 'Employee count', 'number'],
  ['company', 'annual_turnover', 'Yıllık ciro', 'Annual turnover', 'decimal'],
  [
    'company',
    'prior_supported_projects',
    'Önceki destekli proje sayısı',
    'Previously supported project count',
    'number',
  ],
  ['company', 'registration_date', 'Kuruluş tarihi', 'Registration date', 'date'],
  ['project', 'sector', 'Sektör', 'Sector', 'text'],
  ['project', 'country', 'Proje ülkesi', 'Project country', 'country'],
  ['project', 'stage', 'Aşama', 'Stage', 'stage'],
  [
    'project',
    'trl',
    'Teknoloji hazırlık seviyesi (1–9)',
    'Technology readiness level (1–9)',
    'number',
  ],
  ['project', 'problem', 'Problem', 'Problem', 'textarea'],
  ['project', 'solution', 'Çözüm', 'Solution', 'textarea'],
  ['project', 'innovation', 'Yenilik', 'Innovation', 'textarea'],
  ['project', 'methodology', 'Yöntem', 'Methodology', 'textarea'],
  ['project', 'objectives', 'Amaçlar', 'Objectives', 'textarea'],
  ['project', 'outcomes', 'Çıktılar', 'Outcomes', 'textarea'],
  ['project', 'start_date', 'Başlangıç tarihi', 'Start date', 'date'],
  ['project', 'duration_months', 'Süre (ay)', 'Duration (months)', 'number'],
  ['team', 'description', 'Ekip', 'Team', 'textarea'],
  ['team', 'has_qualified_employee', 'Nitelikli çalışan var mı?', 'Qualified employee?', 'boolean'],
] as const;
export function ProfileFields({
  profile,
  onChange,
  disabled = false,
  group,
}: {
  profile: Profile;
  onChange: (profile: Profile) => void;
  disabled?: boolean;
  group?: 'project' | 'company' | 'team';
}) {
  const { text } = useI18n();
  return (
    <fieldset disabled={disabled} className="form-grid">
      <legend>{text('Proje bilgileri', 'Project facts')}</legend>
      {fields
        .filter(([section]) => !group || section === group)
        .map(([section, key, tr, en, type]) => {
          const group = profile[section] || {};
          const value = group[key];
          const change = (raw: string) => {
            const next = { ...group };
            if (raw === '') delete next[key];
            else
              next[key] =
                type === 'boolean' ? raw === 'true' : type === 'number' ? Number(raw) : raw;
            onChange({ ...profile, [section]: next });
          };
          return (
            <label key={`${section}.${key}`} htmlFor={`profile-${section}-${key}`}>
              {text(tr, en)}
              {type === 'textarea' ? (
                <textarea
                  id={`profile-${section}-${key}`}
                  rows={3}
                  value={String(value ?? '')}
                  onChange={(e) => change(e.target.value)}
                />
              ) : ['boolean', 'country', 'stage'].includes(type) ? (
                <select
                  id={`profile-${section}-${key}`}
                  value={String(value ?? '')}
                  onChange={(e) => change(e.target.value)}
                >
                  <option value="">{text('Bilinmiyor', 'Unknown')}</option>
                  {(type === 'boolean'
                    ? ['true', 'false']
                    : type === 'country'
                      ? [...COUNTRIES]
                      : ['idea', 'mvp', 'scale']
                  ).map((option) => (
                    <option key={option} value={option}>
                      {option === 'true'
                        ? text('Evet', 'Yes')
                        : option === 'false'
                          ? text('Hayır', 'No')
                          : option}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id={`profile-${section}-${key}`}
                  type={type === 'decimal' ? 'number' : type}
                  min={
                    type === 'number'
                      ? key === 'trl' || key === 'duration_months'
                        ? 1
                        : 0
                      : undefined
                  }
                  max={key === 'trl' ? 9 : undefined}
                  step={type === 'decimal' ? '0.01' : type === 'number' ? '1' : undefined}
                  value={String(value ?? '')}
                  onChange={(e) => change(e.target.value)}
                />
              )}
            </label>
          );
        })}
    </fieldset>
  );
}
export default function ProfileScreen({
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
  const state = useProjectDraft(project);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  return (
    <div className="stack">
      <h2>{text('Proje kapsamı', 'Project scope')}</h2>
      <p>
        {text(
          'Bilinmeyen alanları boş bırakın; bilinmiyor, hayır anlamına gelmez. Şirket kurulması zorunlu değildir.',
          'Leave unknown fields empty; unknown does not mean no. Incorporation is not required.',
        )}
      </p>
      {readOnly && <p className="notice">{text('Salt okunur erişim', 'Read-only access')}</p>}
      <details className="quiet-details">
        <summary>{text('Kayıt ve onay bilgisi', 'Revision and confirmation')}</summary>
        <p>
          {text('Revizyon', 'Revision')} {project.revision} ·{' '}
          {project.confirmed_revision === project.revision
            ? text('Kapsam onaylı', 'Scope confirmed')
            : text('Kaydedilmiş kapsamı onayla', 'Confirm the saved scope')}
        </p>
      </details>
      {state.conflict && (
        <section className="notice" role="alert">
          <p>
            {text(
              'Kayıt başka bir işlemde değişti. Düzenlemeleriniz korunuyor; eski revizyon üzerine kaydedemezsiniz.',
              'The record changed in another operation. Your edits are preserved; you cannot save over the newer revision.',
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
              'Düzenlemelerimi at ve güncel kaydı yükle',
              'Discard my edits and load the latest record',
            )}
          </button>
        </section>
      )}
      <form
        className="panel stack"
        onSubmit={async (e) => {
          e.preventDefault();
          if (readOnly || busy || state.conflict || !state.dirty) return;
          setBusy(true);
          setError('');
          setSaved(false);
          try {
            const value = await save(
              {
                title: state.draft.title,
                description: state.draft.description,
                profile: state.draft.profile,
              },
              state.base.revision,
            );
            state.accept(value);
            setSaved(true);
          } catch (error) {
            setError(errorMessage(error));
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset disabled={readOnly || busy}>
          <label>
            {text('Proje adı', 'Project title')}
            <input
              required
              maxLength={200}
              value={state.draft.title}
              onChange={(e) => state.setDraft({ ...state.draft, title: e.target.value })}
            />
          </label>
          <label>
            {text('Kısa proje kapsamı', 'Project scope summary')}
            <textarea
              rows={4}
              maxLength={100000}
              value={state.draft.description}
              onChange={(e) => state.setDraft({ ...state.draft, description: e.target.value })}
            />
          </label>
        </fieldset>
        <ProfileFields
          group="project"
          profile={state.draft.profile}
          disabled={readOnly || busy}
          onChange={(profile) => state.setDraft({ ...state.draft, profile })}
        />
        <details className="scope-additional-facts">
          <summary>{text('Şirket ve ekip bilgileri', 'Company and team facts')}</summary>
          <div className="stack">
            <ProfileFields
              group="company"
              profile={state.draft.profile}
              disabled={readOnly || busy}
              onChange={(profile) => state.setDraft({ ...state.draft, profile })}
            />
            <ProfileFields
              group="team"
              profile={state.draft.profile}
              disabled={readOnly || busy}
              onChange={(profile) => state.setDraft({ ...state.draft, profile })}
            />
          </div>
        </details>
        {workspace.plan === 'pro' && (
          <details className="scope-additional-facts">
            <summary>{text('Desteklere özel ek bilgiler', 'Additional funding facts')}</summary>
            <ProgramQuestions
              workspace={workspace}
              project={project}
              profile={state.draft.profile}
              disabled={readOnly || busy}
              onChange={(profile) => state.setDraft({ ...state.draft, profile })}
            />
          </details>
        )}
        {!readOnly && (
          <div className="actions">
            <button className="primary" disabled={busy || !state.dirty || state.conflict}>
              {text('Değişiklikleri kaydet', 'Save changes')}
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
          </div>
        )}
        {saved && !state.dirty && (
          <p role="status">
            {text(
              'Kaydedildi. Şimdi kayıtlı profili onaylayabilirsiniz.',
              'Saved. You can now confirm the saved profile.',
            )}
          </p>
        )}
      </form>
      {!readOnly && (
        <section className="panel">
          <p>
            {text(
              'Önce tüm değişiklikleri kaydedin. Onay, yalnızca kayıtlı revizyonun doğruluğunu kabul eder. Her düzenleme güncel değerlendirmeyi geçersiz kılar.',
              'Save every change first. Confirmation accepts only this saved revision. Editing invalidates current evaluations.',
            )}
          </p>
          <button
            disabled={
              busy ||
              state.dirty ||
              state.conflict ||
              project.confirmed_revision === project.revision
            }
            onClick={async () => {
              if (state.dirty || state.conflict || busy) return;
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
            {text('Kayıtlı profili onayla', 'Confirm saved profile')}
          </button>
        </section>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </div>
  );
}
