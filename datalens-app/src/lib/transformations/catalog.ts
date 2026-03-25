import type { ColumnTransform } from '@/lib/pipeline/types';

const DATE_FORMATS = [
  /^(\d{4})-(\d{2})-(\d{2})$/,
  /^(\d{2})\/(\d{2})\/(\d{4})$/,
  /^(\d{2})-(\d{2})-(\d{4})$/,
  /^(\d{1,2})\/(\d{1,2})\/(\d{2})$/,
];

function toIsoDate(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  for (const format of DATE_FORMATS) {
    const match = trimmed.match(format);
    if (!match) continue;

    if (format === DATE_FORMATS[0]) {
      return `${match[1]}-${match[2]}-${match[3]}`;
    }

    const year = match[3].length === 2 ? `20${match[3]}` : match[3];
    return `${year}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
  }

  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

export const catalog: Record<
  ColumnTransform,
  (value: unknown, params?: Record<string, unknown>) => unknown
> = {
  identity: (value) => value,
  parseDate: (value) => {
    if (value == null) return null;
    return toIsoDate(String(value));
  },
  normalizeNumber: (value) => {
    if (value == null) return null;
    const cleaned = String(value)
      .trim()
      .replace(/[$€£¥\s]/g, '')
      .replace(/\.(?=\d{3}(\D|$))/g, '')
      .replace(',', '.');

    if (!cleaned) return null;
    const parsed = Number(cleaned);
    return Number.isNaN(parsed) ? null : parsed;
  },
  normalizePercentage: (value) => {
    if (value == null) return null;
    const cleaned = String(value).replace('%', '').replace(',', '.').trim();
    const parsed = Number(cleaned);
    return Number.isNaN(parsed) ? null : parsed / 100;
  },
  trimSpaces: (value) => {
    if (value == null) return null;
    const trimmed = String(value).trim().replace(/\s+/g, ' ');
    return trimmed || null;
  },
  capitalizeWords: (value) => {
    if (value == null) return null;
    return String(value)
      .trim()
      .toLowerCase()
      .replace(/\b\w/g, (char) => char.toUpperCase());
  },
  fixEncoding: (value) => {
    if (value == null) return null;
    return String(value)
      .replace(/Ã¡/g, 'á')
      .replace(/Ã©/g, 'é')
      .replace(/Ã­/g, 'í')
      .replace(/Ã³/g, 'ó')
      .replace(/Ãº/g, 'ú')
      .replace(/Ã±/g, 'ñ');
  },
  normalizeNull: (value, params) => {
    const nullTokens = new Set(
      ((params?.nullTokens as string[] | undefined) ?? ['', 'null', 'n/a', 'na', '-', '--', 's/d', 'nd']).map((token) =>
        token.toLowerCase()
      )
    );
    const normalized = String(value ?? '').trim().toLowerCase();
    return nullTokens.has(normalized) ? null : value;
  },
  normalizeCategory: (value, params) => {
    if (value == null) return null;
    const mapping = (params?.mapping as Record<string, string> | undefined) ?? {};
    const normalized = String(value).trim().toLowerCase();
    return mapping[normalized] ?? String(value).trim();
  },
  normalizeBoolean: (value) => {
    const normalized = String(value ?? '').trim().toLowerCase();
    if (['true', '1', 'yes', 'si', 'sí', 'x'].includes(normalized)) return true;
    if (['false', '0', 'no', ''].includes(normalized)) return false;
    return null;
  },
  splitField: (value, params) => {
    if (value == null) return null;
    const separator = String(params?.separator ?? ',');
    const targetKeys = (params?.targetKeys as string[] | undefined) ?? [];
    const parts = String(value).split(separator).map((part) => part.trim());
    if (targetKeys.length === 0) return parts;
    return targetKeys.reduce<Record<string, string | null>>((acc, key, index) => {
      acc[key] = parts[index] ?? null;
      return acc;
    }, {});
  },
};

