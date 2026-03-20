/**
 * Creates the Engram SQLite database schema at ENGRAM_DB_PATH.
 *
 * Run once before index-engram.ts:
 *   ENGRAM_DB_PATH=~/.engram/engram.db npx tsx scripts/setup-engram-db.ts
 */

import Database from 'better-sqlite3';
import { existsSync } from 'node:fs';

const ENGRAM_DB_PATH = process.env['ENGRAM_DB_PATH'];
if (!ENGRAM_DB_PATH || ENGRAM_DB_PATH.trim() === '') {
  console.error('ERROR: ENGRAM_DB_PATH not set.');
  process.exit(1);
}

const isNew = !existsSync(ENGRAM_DB_PATH);
const db = new Database(ENGRAM_DB_PATH);

// Recommended pragmas
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id         TEXT PRIMARY KEY,
    project    TEXT NOT NULL,
    directory  TEXT NOT NULL,
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    ended_at   TEXT,
    summary    TEXT
  );

  CREATE TABLE IF NOT EXISTS observations (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    sync_id         TEXT,
    session_id      TEXT NOT NULL,
    type            TEXT NOT NULL,
    title           TEXT NOT NULL,
    content         TEXT NOT NULL,
    tool_name       TEXT,
    project         TEXT,
    scope           TEXT NOT NULL DEFAULT 'project',
    topic_key       TEXT,
    normalized_hash TEXT,
    revision_count  INTEGER NOT NULL DEFAULT 1,
    duplicate_count INTEGER NOT NULL DEFAULT 1,
    last_seen_at    TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at      TEXT,
    FOREIGN KEY (session_id) REFERENCES sessions(id)
  );

  CREATE INDEX IF NOT EXISTS idx_observations_session_id  ON observations(session_id);
  CREATE INDEX IF NOT EXISTS idx_observations_type        ON observations(type);
  CREATE INDEX IF NOT EXISTS idx_observations_project     ON observations(project);
  CREATE INDEX IF NOT EXISTS idx_observations_created_at  ON observations(created_at);
  CREATE INDEX IF NOT EXISTS idx_observations_scope       ON observations(scope);
  CREATE INDEX IF NOT EXISTS idx_observations_sync_id     ON observations(sync_id);
  CREATE INDEX IF NOT EXISTS idx_observations_topic_key   ON observations(topic_key);
  CREATE INDEX IF NOT EXISTS idx_observations_deleted_at  ON observations(deleted_at);

  CREATE VIRTUAL TABLE IF NOT EXISTS observations_fts USING fts5(
    title,
    content,
    tool_name,
    type,
    project,
    content='observations',
    content_rowid='id'
  );
`);

db.close();

console.log(`Engram DB ${isNew ? 'created' : 'verified'} at: ${ENGRAM_DB_PATH}`);
