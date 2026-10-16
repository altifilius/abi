import type { ReactNode } from 'react';
import { useI18n } from '../i18n';

export function useEvidenceText() {
  const { language } = useI18n();
  return (tr: string, en: string) => (language === 'tr' ? tr : en);
}

export const panelClass =
  'rounded-xl border border-border-dark bg-surface p-5 space-y-4 text-text-primary';
export const buttonClass =
  'rounded-lg border border-border-dark px-4 py-2 text-text-primary hover:border-primary disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary';
export const inputClass =
  'w-full rounded-lg border border-border-dark bg-background p-2 text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary';

export function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function timestamp(value: string | null | undefined) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : `${date.toLocaleString(undefined, { timeZone: 'UTC' })} UTC`;
}

export function SourceLink({ url, children }: { url?: string | null; children?: ReactNode }) {
  if (!url) return null;
  try {
    if (new URL(url).protocol !== 'https:') return <span>{url}</span>;
  } catch {
    return <span>{url}</span>;
  }
  return (
    <a
      className="text-primary underline break-all"
      href={url}
      target="_blank"
      rel="noopener noreferrer"
    >
      {children || url}
    </a>
  );
}
