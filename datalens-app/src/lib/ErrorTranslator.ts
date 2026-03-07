/**
 * ErrorTranslator: Maps technical errors to user-friendly messages
 * in business language for non-technical PYME owners.
 *
 * Technical errors are still logged to the console server-side.
 */

interface TranslatedError {
    userMessage: string;
    suggestion: string;
}

const ERROR_PATTERNS: Array<{
    pattern: RegExp;
    message: string;
    suggestion: string;
}> = [
        {
            pattern: /GEMINI_API_KEY/i,
            message: 'Hay un problema de configuración con el servicio de inteligencia artificial.',
            suggestion: 'Contactá al administrador del sistema para verificar la configuración.'
        },
        {
            pattern: /JSON\.parse|Unexpected token|parsing|Invalid JSON/i,
            message: 'Hubo un problema interpretando la respuesta de la inteligencia artificial.',
            suggestion: 'Intentá de nuevo. Si el problema persiste, probá con un archivo más simple.'
        },
        {
            pattern: /timeout|ETIMEDOUT|exceeded.*timeout|timed?\s*out/i,
            message: 'El análisis está tardando más de lo esperado.',
            suggestion: 'Tu archivo puede ser muy grande. Intentá con menos filas o columnas, o probá de nuevo en unos minutos.'
        },
        {
            pattern: /403|401|Unauthorized|Forbidden|API key/i,
            message: 'No se pudo conectar con el servicio de inteligencia artificial.',
            suggestion: 'Contactá al administrador para verificar los permisos del servicio.'
        },
        {
            pattern: /429|Too Many Requests|quota|rate.?limit/i,
            message: 'Estamos recibiendo muchas solicitudes en este momento.',
            suggestion: 'Esperá unos segundos e intentá de nuevo.'
        },
        {
            pattern: /SQLITE|syntax.*error|no such column|no such table/i,
            message: 'No pudimos interpretar tu pregunta como una consulta de datos.',
            suggestion: 'Intentá reformular tu pregunta de forma más simple. Ejemplo: "¿Cuánto vendí en total?"'
        },
        {
            pattern: /encoding|delimiter|CSV|formato.*archivo/i,
            message: 'Parece que tu archivo tiene un formato inesperado.',
            suggestion: 'Verificá que el archivo sea CSV o Excel válido. Si fue exportado de otro sistema, probá guardarlo como "UTF-8 CSV".'
        },
        {
            pattern: /fecha|date.*parse|invalid.*date/i,
            message: 'Detectamos un problema con las fechas del archivo.',
            suggestion: 'Verificá que las fechas tengan formato consistente (ej: DD/MM/YYYY o YYYY-MM-DD).'
        },
        {
            pattern: /ENOMEM|memory|heap/i,
            message: 'El archivo es demasiado grande para procesarlo en este momento.',
            suggestion: 'Intentá con un archivo más pequeño (menos de 50.000 filas).'
        },
        {
            pattern: /column|columna.*no existe|undefined.*property/i,
            message: 'Hay un problema con la estructura de tus datos.',
            suggestion: 'Verificá que tu archivo tenga encabezados en la primera fila y que los datos estén organizados en columnas.'
        }
    ];

const ACTION_DEFAULTS: Record<string, TranslatedError> = {
    clean_data: {
        userMessage: 'Hubo un problema al procesar tu archivo.',
        suggestion: 'Verificá que el archivo sea un CSV o Excel válido e intentá de nuevo.'
    },
    analyze_schema: {
        userMessage: 'No pudimos analizar la estructura de tus datos.',
        suggestion: 'Intentá de nuevo. Si el problema persiste, probá con un archivo más simple.'
    },
    full_pipeline: {
        userMessage: 'Hubo un problema al generar el análisis completo.',
        suggestion: 'Intentá de nuevo. El servicio de IA puede estar ocupado.'
    },
    generate_dashboard: {
        userMessage: 'No pudimos generar el dashboard.',
        suggestion: 'Intentá seleccionando otra visualización, o regenerá las propuestas.'
    },
    chat: {
        userMessage: 'No pudimos responder tu pregunta.',
        suggestion: 'Intentá reformular la pregunta de forma más simple.'
    }
};

export function translateError(error: Error | string, action?: string): TranslatedError {
    const errorMsg = typeof error === 'string' ? error : error.message || String(error);

    // Try to match a specific pattern
    for (const { pattern, message, suggestion } of ERROR_PATTERNS) {
        if (pattern.test(errorMsg)) {
            return { userMessage: message, suggestion };
        }
    }

    // Use action-specific default
    if (action && ACTION_DEFAULTS[action]) {
        return ACTION_DEFAULTS[action];
    }

    // Generic fallback
    return {
        userMessage: 'Ocurrió un error inesperado.',
        suggestion: 'Intentá de nuevo. Si el problema persiste, contactá al soporte.'
    };
}
