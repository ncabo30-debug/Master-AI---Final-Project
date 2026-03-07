import type { SchemaMap, EnrichedSchemaField } from './types';

/**
 * Extracts numeric and category columns from a schema that may contain
 * basic (string) or enriched (object) field descriptors.
 *
 * This centralises the filtering logic previously duplicated in
 * ComprehensionAgent and ReportAgent.
 */
export function extractColumnsByType(schema: SchemaMap): {
    numericCols: string[];
    categoryCols: string[];
} {
    const numericCols = Object.keys(schema).filter(k => {
        const field = schema[k];
        return (typeof field === 'object' && (field as EnrichedSchemaField).type === 'number')
            || field === 'number';
    });

    const categoryCols = Object.keys(schema).filter(k => {
        const field = schema[k];
        if (typeof field === 'object') {
            const t = (field as EnrichedSchemaField).type;
            return t === 'string' || t === 'date';
        }
        return field === 'string' || field === 'date';
    });

    return { numericCols, categoryCols };
}
