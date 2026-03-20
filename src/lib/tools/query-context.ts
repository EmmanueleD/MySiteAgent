import Database from 'better-sqlite3';

export interface ContextResult {
  title: string;
  content: string;
  topic_key: string;
}

type QueryContextResult = { results: ContextResult[] };

interface EngramRow {
  id: number;
  title: string;
  content: string;
  topic_key: string;
}

/**
 * Queries the Engram knowledge base for relevant context using FTS5 full-text search.
 *
 * Uses better-sqlite3 for direct SQLite access (non-fatal if DB is missing or query fails).
 *
 * @param query - Natural language search query
 * @param limit - Maximum number of results to return (default: 5)
 * @returns { results: ContextResult[] } — empty array on failure (non-fatal)
 */
export function queryContextTool(query: string, limit = 5): QueryContextResult {
  const dbPath = (import.meta.env['ENGRAM_DB_PATH'] as string | undefined) ?? process.env['ENGRAM_DB_PATH'];

  if (!dbPath) {
    console.warn('[query_context] ENGRAM_DB_PATH not set — returning empty context');
    return { results: [] };
  }

  try {
    const db = new Database(dbPath, { readonly: true });

    // Sanitize query: wrap each word in double quotes to prevent FTS5 operator injection
    const sanitizedQuery = query
      .trim()
      .split(/\s+/)
      .filter(w => w.length > 0)
      .map(w => `"${w.replace(/"/g, '')}"`)
      .join(' OR ');

    if (!sanitizedQuery) {
      db.close();
      return { results: [] };
    }

    const rows = db.prepare(`
      SELECT o.id, o.title, o.content, o.topic_key
      FROM observations_fts f
      JOIN observations o ON o.id = f.rowid
      WHERE f.observations_fts MATCH ?
        AND o.project = 'MySiteAgent'
        AND o.deleted_at IS NULL
      ORDER BY rank
      LIMIT ?
    `).all(sanitizedQuery, limit) as EngramRow[];

    db.close();

    return {
      results: rows.map(r => ({
        title: r.title,
        content: r.content,
        topic_key: r.topic_key,
      })),
    };
  } catch (err) {
    console.warn(`[query_context] Error querying Engram DB: ${String(err)}`);
    return { results: [] };
  }
}
