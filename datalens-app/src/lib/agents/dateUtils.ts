/**
 * Shared date parsing and formatting utilities used by both
 * ManagerAgent (detection preview) and CleanerAgent (normalization).
 * Keeping them in one place guarantees the preview shows exactly
 * what the normalization tab will produce.
 */

const MONTH_MAP: Record<string, number> = {
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
    jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
    ene: 1, abr: 4, ago: 8, dic: 12,
};

/**
 * Detects the dominant date format in a column.
 */
export function detectDominantDateFormat(data: Record<string, unknown>[], colName: string): string {
    let slashCount = 0, isoCount = 0, dashNumCount = 0;
    for (const row of data) {
        const val = String(row[colName] ?? '').trim();
        if (/^\d{4}-\d{2}-\d{2}/.test(val)) isoCount++;
        else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(val)) slashCount++;
        else if (/^\d{1,2}-\d{1,2}-\d{4}$/.test(val)) dashNumCount++;
    }
    if (isoCount >= slashCount && isoCount >= dashNumCount) return 'yyyy-mm-dd';
    if (dashNumCount > slashCount) return 'dd-mm-yyyy';
    return 'dd/mm/yyyy';
}

/**
 * Detects the most common 4-digit year in a date column.
 * Used to infer the year for dates that lack one (e.g. "feb-26").
 */
export function detectMostCommonYear(data: Record<string, unknown>[], colName: string): number {
    const yearCounts: Record<number, number> = {};
    for (const row of data) {
        const val = String(row[colName] ?? '').trim();
        const match = val.match(/\b(19\d{2}|20\d{2})\b/);
        if (match) {
            const year = Number(match[1]);
            yearCounts[year] = (yearCounts[year] || 0) + 1;
        }
    }
    const entries = Object.entries(yearCounts).sort((a, b) => b[1] - a[1]);
    return entries.length > 0 ? Number(entries[0][0]) : new Date().getFullYear();
}

/**
 * Formats a Date object as a string in the specified format.
 * Always uses local date parts (no UTC shift).
 */
export function formatDateToString(date: Date, format: string): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    const day = pad(date.getDate());
    const month = pad(date.getMonth() + 1);
    const year = String(date.getFullYear());
    switch (format) {
        case 'yyyy-mm-dd': return `${year}-${month}-${day}`;
        case 'dd-mm-yyyy': return `${day}-${month}-${year}`;
        case 'dd/mm/yyyy':
        default: return `${day}/${month}/${year}`;
    }
}

/**
 * Parses a date string into a Date object.
 * Handles: ISO (yyyy-MM-dd), compact (YYYYMMDD), slash (dd/MM/yyyy),
 * numeric dash (dd-MM-yyyy), and named-month formats (feb-26, 7-feb.).
 * yearContext is used to infer the year for dates that lack one.
 */
export function parseDate(value: string, yearContext: number = new Date().getFullYear()): Date | null {
    const str = value.trim();

    // ISO: yyyy-MM-dd[T...] — parse as local date to avoid UTC offset
    const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
        const d = new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
        return isNaN(d.getTime()) ? null : d;
    }

    // Compact YYYYMMDD: e.g. 20260209
    if (/^\d{8}$/.test(str)) {
        const year = parseInt(str.slice(0, 4), 10);
        const month = parseInt(str.slice(4, 6), 10);
        const day = parseInt(str.slice(6, 8), 10);
        if (year > 1900 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
            const d = new Date(year, month - 1, day);
            return isNaN(d.getTime()) ? null : d;
        }
        return null;
    }

    // Slash-separated: dd/MM/yyyy or MM/dd/yyyy (disambiguate by value > 12)
    const slashMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (slashMatch) {
        const p1 = Number(slashMatch[1]), p2 = Number(slashMatch[2]), year = Number(slashMatch[3]);
        let day: number, month: number;
        if (p1 > 12)      { day = p1; month = p2; }
        else if (p2 > 12) { month = p1; day = p2; }
        else               { day = p1; month = p2; }
        const d = new Date(year, month - 1, day);
        return isNaN(d.getTime()) ? null : d;
    }

    // Numeric dash-separated: dd-MM-yyyy
    const dashNumMatch = str.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
    if (dashNumMatch) {
        const p1 = Number(dashNumMatch[1]), p2 = Number(dashNumMatch[2]), year = Number(dashNumMatch[3]);
        let day: number, month: number;
        if (p1 > 12)      { day = p1; month = p2; }
        else if (p2 > 12) { month = p1; day = p2; }
        else               { day = p1; month = p2; }
        const d = new Date(year, month - 1, day);
        return isNaN(d.getTime()) ? null : d;
    }

    // Named-month formats: "feb-26", "7-feb.", "mar-15", "15-mar"
    const normalized = str.toLowerCase().replace(/\.$/, '').trim();
    const namedA = normalized.match(/^([a-z]{3})-(\d{1,2})$/); // month-day: "feb-26"
    const namedB = normalized.match(/^(\d{1,2})-([a-z]{3})$/); // day-month: "7-feb"
    if (namedA) {
        const month = MONTH_MAP[namedA[1]];
        const day = Number(namedA[2]);
        if (!month) return null;
        const d = new Date(yearContext, month - 1, day);
        return isNaN(d.getTime()) ? null : d;
    }
    if (namedB) {
        const day = Number(namedB[1]);
        const month = MONTH_MAP[namedB[2]];
        if (!month) return null;
        const d = new Date(yearContext, month - 1, day);
        return isNaN(d.getTime()) ? null : d;
    }

    return null;
}
