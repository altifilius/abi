import { useEffect, useState } from 'react';
import { useI18n } from '../i18n';
import { errorMessage } from '../services/api';
import { COUNTRIES, type Profile, type Project } from '../types';

interface Props {
  project: Project;
  save: (changes: {
    profile?: Profile;
    title?: string;
    description?: string;
    confirm_profile?: boolean;
  }) => Promise<Project>;
}
const fields: [string, string, string, string, string][] = [
  ['company', 'name', 'Şirket adı (isteğe bağlı)', 'Company name (optional)', 'text'],
  ['company', 'country', 'Şirket ülkesi', 'Company country', 'country'],
  ['company', 'legal_form', 'Hukuki tür', 'Legal form', 'text'],
  ['company', 'is_incorporated', 'Şirket kuruldu mu?', 'Incorporated?', 'boolean'],
  ['company', 'is_sme', 'KOBİ mi?', 'SME?', 'boolean'],
  ['company', 'employee_count', 'Çalışan sayısı', 'Employee count', 'number'],
  ['company', 'annual_turnover', 'Yıllık ciro', 'Annual turnover', 'number'],
  [
    'company',
    'prior_supported_projects',
    'Önceki destekli proje sayısı',
    'Previously supported project count',
    'number',
  ],
  ['company', 'registration_date', 'Kuruluş tarihi', 'Registration date', 'date'],
  ['project', 'sector', 'Sektör', 'Sector', 'text'],
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
];
export default function ProfileScreen({ project, save }: Props) {
  const { text } = useI18n();
  const [profile, setProfile] = useState<Profile>(project.profile);
  const [title, setTitle] = useState(project.title);
  const [description, setDescription] = useState(project.description);
  const [extra, setExtra] = useState(JSON.stringify(project.profile.extra || {}, null, 2));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    setProfile(project.profile);
    setTitle(project.title);
    setDescription(project.description);
    setExtra(JSON.stringify(project.profile.extra || {}, null, 2));
    setSaved(false);
  }, [project]);
  return (
    <div className="stack">
      <h1>{text('Proje profili', 'Project profile')}</h1>
      <p>
        {text(
          'Bilinmeyen alanları boş bırakın; bilinmiyor, hayır anlamına gelmez. Şirket kurulması zorunlu değildir.',
          'Leave unknown fields empty; unknown does not mean no. Incorporation is not required.',
        )}
      </p>
      <p className="notice">
        {text('Revizyon', 'Revision')} {project.revision} ·{' '}
        {project.confirmed_revision === project.revision
          ? text('Onaylandı', 'Confirmed')
          : text(
              'Değerlendirme için profil onayı gerekli',
              'Confirm the profile before evaluation',
            )}
      </p>
      <form
        className="panel"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          setSaved(false);
          try {
            const extraValue: unknown = JSON.parse(extra);
            if (!extraValue || typeof extraValue !== 'object' || Array.isArray(extraValue))
              throw new Error(
                text(
                  'Ek bilgiler bir JSON nesnesi olmalı.',
                  'Additional facts must be a JSON object.',
                ),
              );
            await save({
              title,
              description,
              profile: { ...profile, extra: extraValue as Record<string, unknown> },
            });
            setSaved(true);
          } catch (error) {
            setError(errorMessage(error));
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          {text('Proje adı', 'Project title')}
          <input
            required
            value={title}
            maxLength={200}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label>
          {text('Proje açıklaması / genel taslak', 'Project description / general draft')}
          <textarea rows={8} value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <div className="form-grid">
          {fields.map(([section, key, tr, en, type]) => {
            const group = profile[section as 'company' | 'project' | 'team'] || {};
            const value = group[key];
            const change = (raw: string) => {
              const next = { ...group };
              if (raw === '') delete next[key];
              else
                next[key] =
                  type === 'boolean'
                    ? raw === 'true'
                    : type === 'number'
                      ? key === 'annual_turnover'
                        ? raw
                        : Number(raw)
                      : raw;
              setProfile({ ...profile, [section]: next });
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
                    type={type}
                    min={type === 'number' ? (key === 'trl' ? 1 : 0) : undefined}
                    max={key === 'trl' ? 9 : undefined}
                    step={key === 'annual_turnover' ? '0.01' : undefined}
                    value={String(value ?? '')}
                    onChange={(e) => change(e.target.value)}
                  />
                )}
              </label>
            );
          })}
        </div>
        <label>
          {text('Programa özel ek bilgiler (JSON)', 'Program-specific additional facts (JSON)')}
          <textarea rows={4} value={extra} onChange={(e) => setExtra(e.target.value)} />
        </label>
        <button className="primary" disabled={busy}>
          {text('Değişiklikleri kaydet', 'Save changes')}
        </button>
        {saved && (
          <p role="status">
            {text(
              'Kaydedildi. Şimdi profili onaylayabilirsiniz.',
              'Saved. You can now confirm the profile.',
            )}
          </p>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </form>
      <section className="panel">
        <p>
          {text(
            'Önce değişiklikleri kaydedin. Onay, bu kayıtlı revizyonun doğruluğunu kabul eder. Her düzenleme onayı ve güncel değerlendirmeyi geçersiz kılar.',
            'Save changes first. Confirmation accepts the accuracy of this saved revision. Editing invalidates confirmation and current evaluations.',
          )}
        </p>
        <button
          disabled={busy || project.confirmed_revision === project.revision}
          onClick={async () => {
            setBusy(true);
            setError('');
            try {
              await save({ confirm_profile: true });
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
    </div>
  );
}
