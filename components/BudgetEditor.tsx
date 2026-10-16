import { useI18n } from '../i18n';
import type { BudgetItem } from '../types';
export interface Budget {
  currency: string;
  items: BudgetItem[];
}
export default function BudgetEditor({
  value,
  onChange,
  disabled = false,
}: {
  value: Budget;
  onChange: (value: Budget) => void;
  disabled?: boolean;
}) {
  const { text } = useI18n();
  const categories = [
    'personnel',
    'equipment',
    'services',
    'travel',
    'materials',
    'other',
  ] as const;
  return (
    <fieldset disabled={disabled}>
      <legend>{text('Başvuru bütçesi', 'Application budget')}</legend>
      <p>
        {text(
          'Uygun giderler, eş finansman ve kurallar seçili çağrıya göre kontrol edilir. Kur dönüşümü veya muhasebe yapılmaz. Tutarlar ondalık metin olarak saklanır.',
          'Eligible expenses, matching funds and rules are checked against the selected call. No exchange conversion or accounting. Amounts are stored as decimal strings.',
        )}
      </p>
      <label>
        {text('Para birimi', 'Currency')}
        <select
          value={value.currency}
          onChange={(e) => onChange({ ...value, currency: e.target.value })}
        >
          {['TRY', 'EUR', 'GBP', 'USD', 'CAD', 'CHF', 'NOK', 'ISK'].map((currency) => (
            <option key={currency}>{currency}</option>
          ))}
        </select>
      </label>
      <div className="stack">
        {value.items.map((item, index) => (
          <div key={item.id} className="budget-row">
            <label>
              {text('Kategori', 'Category')}
              <select
                value={item.category}
                onChange={(e) =>
                  onChange({
                    ...value,
                    items: value.items.map((row, i) =>
                      i === index
                        ? { ...row, category: e.target.value as BudgetItem['category'] }
                        : row,
                    ),
                  })
                }
              >
                {categories.map((category) => (
                  <option key={category}>{category}</option>
                ))}
              </select>
            </label>
            <label>
              {text('Açıklama', 'Description')}
              <input
                value={item.description}
                onChange={(e) =>
                  onChange({
                    ...value,
                    items: value.items.map((row, i) =>
                      i === index ? { ...row, description: e.target.value } : row,
                    ),
                  })
                }
              />
            </label>
            <label>
              {text('Tutar', 'Amount')}
              <input
                inputMode="decimal"
                pattern="[0-9]+(\.[0-9]{1,2})?"
                value={item.amount}
                onChange={(e) =>
                  onChange({
                    ...value,
                    items: value.items.map((row, i) =>
                      i === index ? { ...row, amount: e.target.value } : row,
                    ),
                  })
                }
              />
            </label>
            <button
              type="button"
              aria-label={text('Gideri kaldır', 'Remove expense')}
              onClick={() =>
                onChange({ ...value, items: value.items.filter((_, i) => i !== index) })
              }
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() =>
          onChange({
            ...value,
            items: [
              ...value.items,
              { id: crypto.randomUUID(), category: 'personnel', description: '', amount: '0.00' },
            ],
          })
        }
      >
        {text('Gider ekle', 'Add expense')}
      </button>
    </fieldset>
  );
}
