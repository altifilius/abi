import { useEffect, useId, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useI18n } from '../i18n';
import { api, errorMessage } from '../services/api';
import type { Profile, Project, Workspace } from '../types';
import type { FundingCall, FundingProgram } from './FundingCatalog';

export interface ProgramRule {
  id: string;
  label: string;
  field: string;
  op: 'eq' | 'in' | 'gte' | 'lte' | 'exists' | 'review';
  value_type: 'boolean' | 'number' | 'string' | 'date' | 'list' | 'object';
  expected: unknown;
  source_url: string;
  source_locator: string;
}
export function profileFieldValue(profile: Profile, path: string): unknown {
  let value: unknown = profile;
  for (const key of path.split('.')) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    value = (value as Record<string, unknown>)[key];
  }
  return value;
}
export function updateProfileField(profile: Profile, path: string, value: unknown): Profile {
  const keys = path.split('.');
  if (
    !['company', 'project', 'team', 'extra'].includes(keys[0]) ||
    keys.some((key) => ['__proto__', 'constructor', 'prototype'].includes(key))
  )
    throw new Error('Unsupported profile field');
  const result = { ...profile } as Record<string, unknown>;
  let cursor = result;
  for (const key of keys.slice(0, -1)) {
    const current = cursor[key];
    cursor[key] =
      current && typeof current === 'object' && !Array.isArray(current) ? { ...current } : {};
    cursor = cursor[key] as Record<string, unknown>;
  }
  if (value === undefined) delete cursor[keys[keys.length - 1]];
  else cursor[keys[keys.length - 1]] = value;
  return result as Profile;
}
type AnswerType = ProgramRule['value_type'];
const answerTypes: AnswerType[] = ['boolean', 'number', 'string', 'date', 'list', 'object'];
const unsafeFieldNames = ['__proto__', 'constructor', 'prototype'];

function answerType(value: unknown): AnswerType {
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';
  if (Array.isArray(value)) return 'list';
  if (value !== null && typeof value === 'object') return 'object';
  return 'string';
}

export function answerInputValue(type: AnswerType, input: string, nested = false): unknown {
  if (input === '') return undefined;
  if (type === 'boolean') return input === 'true';
  return type === 'number' && nested ? Number(input) : input;
}

function AnswerTypeSelect({
  id,
  value,
  onChange,
}: {
  id: string;
  value: AnswerType;
  onChange: (value: AnswerType) => void;
}) {
  const { text } = useI18n();
  const names: Record<AnswerType, string> = {
    boolean: text('Evet / hayır', 'Boolean'),
    number: text('Sayı', 'Number'),
    string: text('Metin', 'Text'),
    date: text('Tarih', 'Date'),
    list: text('Liste', 'List'),
    object: text('Nesne', 'Object'),
  };
  return (
    <div>
      <label htmlFor={id}>{text('Bilgi türü', 'Value type')}</label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value as AnswerType)}
      >
        {answerTypes.map((type) => (
          <option key={type} value={type}>
            {names[type]}
          </option>
        ))}
      </select>
    </div>
  );
}

interface AnswerProps {
  type: AnswerType;
  value: unknown;
  expected: unknown;
  op?: ProgramRule['op'];
  onChange: (value: unknown) => void;
  disabled: boolean;
  id?: string;
  label: string;
  nested?: boolean;
}

interface ListRow {
  id: number;
  type: AnswerType;
  value: unknown;
  expected: unknown;
}

function ListAnswer({
  value,
  expected,
  onChange,
  disabled,
  id,
  label,
}: AnswerProps & { id: string }) {
  const { text } = useI18n();
  const nextId = useRef(0);
  const lastValue = useRef(value);
  const shape = Array.isArray(expected) ? expected : [];
  const makeRow = (item: unknown, index: number): ListRow => {
    const itemShape = shape[index] ?? shape[0];
    return {
      id: nextId.current++,
      type: answerType(itemShape ?? item),
      value: item,
      expected: itemShape,
    };
  };
  const [rows, setRows] = useState<ListRow[]>(() =>
    Array.isArray(value) ? value.map(makeRow) : [],
  );
  const [newType, setNewType] = useState<AnswerType>(() => answerType(shape[0]));
  useEffect(() => {
    if (value === lastValue.current) return;
    lastValue.current = value;
    const nextShape = Array.isArray(expected) ? expected : [];
    setRows((current) =>
      Array.isArray(value)
        ? value.map((item, index) => {
            const previous = current[index];
            const itemShape = nextShape[index] ?? nextShape[0];
            return {
              id: previous?.id ?? nextId.current++,
              type:
                itemShape !== undefined
                  ? answerType(itemShape)
                  : (previous?.type ?? answerType(item)),
              value: item,
              expected: itemShape,
            };
          })
        : [],
    );
  }, [value, expected]);
  const updateRows = (next: ListRow[]) => {
    setRows(next);
    const items = next.filter((row) => row.value !== undefined).map((row) => row.value);
    const answer = items.length ? items : undefined;
    lastValue.current = answer;
    onChange(answer);
  };
  const choices = shape.every((item) => ['string', 'number', 'boolean'].includes(typeof item))
    ? shape
    : [];
  const items = Array.isArray(value) ? value : [];
  return (
    <fieldset id={id} disabled={disabled}>
      <legend>{label}</legend>
      {choices.length ? (
        choices.map((choice) => (
          <label key={JSON.stringify(choice)}>
            <input
              type="checkbox"
              checked={items.includes(choice)}
              onChange={(event) => {
                const next = event.target.checked
                  ? [...items, choice]
                  : items.filter((item) => item !== choice);
                onChange(next.length ? next : undefined);
              }}
            />
            {String(choice)}
          </label>
        ))
      ) : (
        <>
          {rows.map((row, index) => (
            <div key={row.id}>
              <TypedAnswer
                id={`${id}-item-${row.id}`}
                label={`${text('Öğe', 'Item')} ${index + 1}`}
                type={row.type}
                value={row.value}
                expected={row.expected}
                nested
                disabled={disabled}
                onChange={(next) =>
                  updateRows(
                    rows.map((item) => (item.id === row.id ? { ...item, value: next } : item)),
                  )
                }
              />
              <button
                type="button"
                onClick={() => updateRows(rows.filter((item) => item.id !== row.id))}
              >
                {text('Öğeyi kaldır', 'Remove item')}
              </button>
            </div>
          ))}
          {!shape.length && (
            <AnswerTypeSelect id={`${id}-item-type`} value={newType} onChange={setNewType} />
          )}
          <button
            type="button"
            onClick={() => {
              const row = makeRow(undefined, rows.length);
              setRows([...rows, { ...row, type: shape.length ? row.type : newType }]);
            }}
          >
            {text('Öğe ekle', 'Add item')}
          </button>
        </>
      )}
      <button type="button" onClick={() => updateRows([])}>
        {text('Bilinmiyor olarak temizle', 'Clear to unknown')}
      </button>
    </fieldset>
  );
}

export function TypedAnswer({
  type,
  value,
  expected,
  op,
  onChange,
  disabled,
  id,
  label,
  nested = false,
}: AnswerProps) {
  const { text } = useI18n();
  const generatedId = useId();
  const controlId = id || generatedId;
  const [key, setKey] = useState('');
  const [newType, setNewType] = useState<AnswerType>('string');
  const [fieldTypes, setFieldTypes] = useState<Record<string, AnswerType>>({});
  if (op === 'in' && Array.isArray(expected))
    return (
      <div>
        <label htmlFor={controlId}>{label}</label>
        <select
          id={controlId}
          disabled={disabled}
          value={value === undefined ? '' : JSON.stringify(value)}
          onChange={(e) => onChange(e.target.value === '' ? undefined : JSON.parse(e.target.value))}
        >
          <option value="">{text('Bilinmiyor', 'Unknown')}</option>
          {expected.map((choice) => (
            <option key={JSON.stringify(choice)} value={JSON.stringify(choice)}>
              {typeof choice === 'object' ? JSON.stringify(choice) : String(choice)}
            </option>
          ))}
        </select>
      </div>
    );
  if (type === 'boolean')
    return (
      <div>
        <label htmlFor={controlId}>{label}</label>
        <select
          id={controlId}
          disabled={disabled}
          value={typeof value === 'boolean' ? String(value) : ''}
          onChange={(e) => onChange(answerInputValue(type, e.target.value, nested))}
        >
          <option value="">{text('Bilinmiyor', 'Unknown')}</option>
          <option value="true">{text('Evet', 'Yes')}</option>
          <option value="false">{text('Hayır', 'No')}</option>
        </select>
      </div>
    );
  if (type === 'object') {
    const record =
      value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};
    const shape =
      expected && typeof expected === 'object' && !Array.isArray(expected)
        ? (expected as Record<string, unknown>)
        : {};
    const keys = [
      ...new Set([...Object.keys(shape), ...Object.keys(record), ...Object.keys(fieldTypes)]),
    ];
    const fieldName = key.trim();
    return (
      <fieldset id={controlId} disabled={disabled}>
        <legend>{label}</legend>
        {keys.map((name) => (
          <TypedAnswer
            key={name}
            id={`${controlId}-field-${encodeURIComponent(name)}`}
            label={name}
            type={
              shape[name] !== undefined && shape[name] !== null
                ? answerType(shape[name])
                : (fieldTypes[name] ?? answerType(record[name]))
            }
            value={record[name]}
            expected={shape[name]}
            nested
            disabled={disabled}
            onChange={(next) => {
              const copy = { ...record };
              if (next === undefined) delete copy[name];
              else copy[name] = next;
              onChange(Object.keys(copy).length ? copy : undefined);
            }}
          />
        ))}
        <div>
          <label htmlFor={`${controlId}-field-name`}>
            {text('Bilgi / kanıt alanı adı', 'Fact / evidence field name')}
          </label>
          <input
            id={`${controlId}-field-name`}
            value={key}
            onChange={(e) => setKey(e.target.value)}
          />
        </div>
        <AnswerTypeSelect id={`${controlId}-field-type`} value={newType} onChange={setNewType} />
        <button
          type="button"
          disabled={!fieldName || unsafeFieldNames.includes(fieldName) || keys.includes(fieldName)}
          onClick={() => {
            setFieldTypes({ ...fieldTypes, [fieldName]: newType });
            setKey('');
          }}
        >
          {text('Alan ekle', 'Add field')}
        </button>
        <button type="button" onClick={() => onChange(undefined)}>
          {text('Bilinmiyor olarak temizle', 'Clear to unknown')}
        </button>
      </fieldset>
    );
  }
  if (type === 'list')
    return (
      <ListAnswer
        id={controlId}
        label={label}
        type={type}
        value={value}
        expected={expected}
        onChange={onChange}
        disabled={disabled}
      />
    );
  return (
    <div>
      <label htmlFor={controlId}>{label}</label>
      <input
        id={controlId}
        disabled={disabled}
        type={type === 'date' ? 'date' : type === 'number' ? 'number' : 'text'}
        step={type === 'number' ? 'any' : undefined}
        value={String(value ?? '')}
        onChange={(e) => onChange(answerInputValue(type, e.target.value, nested))}
      />
    </div>
  );
}
export default function ProgramQuestions({
  workspace,
  project,
  profile,
  onChange,
  disabled = false,
}: {
  workspace: Workspace;
  project: Project;
  profile: Profile;
  onChange: (profile: Profile) => void;
  disabled?: boolean;
}) {
  const { text } = useI18n();
  const [params, setParams] = useSearchParams();
  const callId = params.get('call') || '';
  const [calls, setCalls] = useState<FundingCall[]>([]);
  const [selected, setSelected] = useState<FundingCall | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    api<FundingProgram[]>('/programs', { signal: controller.signal })
      .then((programs) => {
        if (!controller.signal.aborted)
          setCalls(
            programs.flatMap((program) =>
              program.current_call?.status === 'published' ? [program.current_call] : [],
            ),
          );
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(errorMessage(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setSelected(null);
    if (callId)
      api<FundingCall>(`/calls/${callId}`, { signal: controller.signal })
        .then((call) => {
          if (!controller.signal.aborted) setSelected(call);
        })
        .catch((error) => {
          if (!controller.signal.aborted) setError(errorMessage(error));
        });
    return () => controller.abort();
  }, [callId]);
  const rules =
    selected?.status === 'published' && Array.isArray(selected.rules)
      ? (selected.rules as ProgramRule[])
      : [];
  return (
    <section className="panel stack">
      <h2>{text('Çağrıya özel bilgiler (Pro)', 'Call-specific facts (Pro)')}</h2>
      <p>
        {text(
          'Yayımlanmış kaynağın koşullarını yanıtlayın. Boş yanıt bilinmiyor anlamına gelir; koşulu sağladığınızı varsaymaz.',
          'Answer conditions from the published source. An empty answer means unknown; it never assumes compliance.',
        )}
      </p>
      <label>
        {text('Çağrı seçin', 'Select call')}
        <select
          value={callId}
          onChange={(e) => {
            const next = new URLSearchParams(params);
            if (e.target.value) next.set('call', e.target.value);
            else next.delete('call');
            setParams(next);
          }}
        >
          <option value="">
            {loading
              ? text('Kaynaklar yükleniyor…', 'Loading sources…')
              : text('Çağrı seçin', 'Select call')}
          </option>
          {selected && !calls.some((call) => call.id === selected.id) && (
            <option value={selected.id}>{selected.title}</option>
          )}
          {calls.map((call) => (
            <option key={call.id} value={call.id}>
              {call.title} · v{call.version}
            </option>
          ))}
        </select>
      </label>
      {selected && selected.status !== 'published' && (
        <p className="notice">
          {text(
            'Bu çağrı yayımlanmamış; sorular değerlendirmeye hazır değil.',
            'This call is not published; its questions are not ready for evaluation.',
          )}
        </p>
      )}
      {rules
        .filter((rule) => rule.field.startsWith('extra.'))
        .map((rule) => (
          <div className="panel" key={`${callId}:${rule.id}`}>
            <TypedAnswer
              id={`question-${rule.id}`}
              label={rule.label}
              type={rule.value_type}
              op={rule.op}
              value={profileFieldValue(profile, rule.field)}
              expected={rule.expected}
              disabled={disabled}
              onChange={(value) => onChange(updateProfileField(profile, rule.field, value))}
            />
            <small>
              {text('Kaynak koşulu', 'Source condition')}: {rule.op}
              {rule.expected !== null && rule.expected !== undefined
                ? ` ${typeof rule.expected === 'object' ? JSON.stringify(rule.expected) : String(rule.expected)}`
                : ''}
            </small>
            <p>
              <a href={rule.source_url} target="_blank" rel="noreferrer">
                {text('Resmî kaynak', 'Official source')}
              </a>{' '}
              · {rule.source_locator}
            </p>
          </div>
        ))}
      {rules.some((rule) => rule.field.startsWith('budget.')) && (
        <p>
          <Link
            to={`/w/${workspace.id}/projects/${project.id}/budget?call=${encodeURIComponent(callId)}`}
          >
            {text(
              'Bu çağrı bütçe bilgisi gerektiriyor: proje bütçesini girin',
              'This call needs budget facts: enter the project budget',
            )}
          </Link>
        </p>
      )}
      {rules.length > 0 && !rules.some((rule) => rule.field.startsWith('extra.')) && (
        <p>
          {text(
            'Bu çağrının ek bilgi sorusu yok; temel profil ve bütçe alanlarını tamamlayın.',
            'This call has no additional questions; complete the core profile and budget.',
          )}
        </p>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </section>
  );
}
