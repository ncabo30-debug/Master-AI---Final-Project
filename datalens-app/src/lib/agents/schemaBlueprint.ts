import type {
    EnrichedSchemaField,
    SchemaBlueprint,
    SchemaBlueprintColumn,
    SchemaFieldSource,
    SchemaMap,
} from './types';

function normalizeFieldType(type: string): SchemaBlueprintColumn['type'] {
    if (type === 'number' || type === 'date') return type;
    return 'string';
}

function getDefaultSemanticRole(type: SchemaBlueprintColumn['type']): EnrichedSchemaField['semantic_role'] {
    if (type === 'number') return 'metric';
    if (type === 'date') return 'timeline';
    return 'dimension';
}

function toBlueprintColumn(name: string, field: string | EnrichedSchemaField, source: SchemaFieldSource): SchemaBlueprintColumn {
    if (typeof field === 'object') {
        return {
            name,
            type: field.type,
            semantic_role: field.semantic_role,
            domain: field.domain,
            analysis_variables: field.analysis_variables,
            source,
        };
    }

    const normalizedType = normalizeFieldType(field);
    return {
        name,
        type: normalizedType,
        semantic_role: getDefaultSemanticRole(normalizedType),
        domain: '',
        analysis_variables: [],
        source,
    };
}

export function schemaToBlueprint(sessionId: string, schema: SchemaMap, version = 1): SchemaBlueprint {
    return {
        sessionId,
        version,
        columns: Object.entries(schema).map(([name, field]) => toBlueprintColumn(name, field, 'ai')),
        updatedAt: new Date().toISOString(),
    };
}

export function blueprintToSchema(blueprint: SchemaBlueprint): SchemaMap {
    return blueprint.columns.reduce<SchemaMap>((acc, column) => {
        acc[column.name] = {
            type: column.type,
            semantic_role: column.semantic_role,
            domain: column.domain,
            analysis_variables: column.analysis_variables,
        };
        return acc;
    }, {});
}

export function applyBlueprintOverride(
    blueprint: SchemaBlueprint,
    columnName: string,
    semanticRole: EnrichedSchemaField['semantic_role']
): SchemaBlueprint {
    return {
        ...blueprint,
        version: blueprint.version + 1,
        updatedAt: new Date().toISOString(),
        columns: blueprint.columns.map((column) =>
            column.name === columnName
                ? {
                    ...column,
                    semantic_role: semanticRole,
                    source: 'user_override',
                }
                : column
        ),
    };
}
