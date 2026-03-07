import Database from 'better-sqlite3';

/**
 * SQLiteService: Creates an ephemeral in-memory SQLite database from
 * session data, executes a SQL query, and returns the results.
 *
 * The database is created and destroyed per-query — there is no
 * persistent state between questions.
 */
export class SQLiteService {
    private static readonly TABLE_NAME = 'datos';

    /**
     * Load data into an in-memory SQLite database, execute the query,
     * and return the result rows.
     */
    public static executeQuery(
        data: Record<string, unknown>[],
        sql: string
    ): Record<string, unknown>[] {
        if (!data || data.length === 0) {
            throw new Error('No hay datos disponibles para consultar.');
        }

        const db = new Database(':memory:');

        try {
            // Infer columns and types from the first row
            const columns = Object.keys(data[0]);
            const columnDefs = columns.map(col => {
                const sampleValues = data.slice(0, 50).map(r => r[col]).filter(v => v != null);
                const type = this.inferSQLType(sampleValues);
                // Sanitize column name for SQL (wrap in quotes)
                return `"${col}" ${type}`;
            }).join(', ');

            db.exec(`CREATE TABLE ${this.TABLE_NAME} (${columnDefs})`);

            // Prepare insert statement
            const placeholders = columns.map(() => '?').join(', ');
            const insert = db.prepare(
                `INSERT INTO ${this.TABLE_NAME} (${columns.map(c => `"${c}"`).join(', ')}) VALUES (${placeholders})`
            );

            // Insert all rows in a transaction for performance
            const insertMany = db.transaction((rows: Record<string, unknown>[]) => {
                for (const row of rows) {
                    const values = columns.map(col => {
                        const val = row[col];
                        if (val == null) return null;
                        if (val instanceof Date) return val.toISOString();
                        return val;
                    });
                    insert.run(...values);
                }
            });

            insertMany(data);

            // Execute the user's query
            const stmt = db.prepare(sql);
            const results = stmt.all() as Record<string, unknown>[];
            return results;
        } finally {
            db.close();
        }
    }

    private static inferSQLType(values: unknown[]): string {
        if (values.length === 0) return 'TEXT';

        const numericCount = values.filter(v => {
            const n = Number(v);
            return !isNaN(n) && isFinite(n);
        }).length;

        if (numericCount >= values.length * 0.7) {
            // Check if they're all integers
            const allInts = values.every(v => {
                const n = Number(v);
                return Number.isInteger(n);
            });
            return allInts ? 'INTEGER' : 'REAL';
        }

        return 'TEXT';
    }
}
