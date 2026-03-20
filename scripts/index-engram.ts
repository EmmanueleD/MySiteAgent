/**
 * Engram Indexing Script
 *
 * Indexes design tokens, component specs, and design principles into Engram.
 * Uses better-sqlite3 for direct DB access (idempotent via topic_key upsert).
 *
 * Usage: npx tsx scripts/index-engram.ts
 *
 * Required env: ENGRAM_DB_PATH
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// Environment validation
// ---------------------------------------------------------------------------

const ENGRAM_DB_PATH = process.env['ENGRAM_DB_PATH'];
if (!ENGRAM_DB_PATH || ENGRAM_DB_PATH.trim() === '') {
  console.error('ERROR: ENGRAM_DB_PATH environment variable is not set.');
  console.error('Set it to the absolute path of your Engram SQLite database file.');
  console.error('Example: export ENGRAM_DB_PATH=~/.engram/engram.db');
  process.exit(1);
}

if (!fs.existsSync(ENGRAM_DB_PATH)) {
  console.error(`ERROR: ENGRAM_DB_PATH does not point to an existing file: ${ENGRAM_DB_PATH}`);
  process.exit(1);
}

console.log('Starting Engram indexing...');
console.log(`Database: ${ENGRAM_DB_PATH}`);
console.log(`Project root: ${PROJECT_ROOT}`);
console.log('');

// ---------------------------------------------------------------------------
// Database setup
// ---------------------------------------------------------------------------

const db = new Database(ENGRAM_DB_PATH);

// Ensure a stable session exists for our indexing operations
const SESSION_ID = 'index-engram-script';

const existingSession = db
  .prepare('SELECT id FROM sessions WHERE id = ?')
  .get(SESSION_ID) as { id: string } | undefined;

if (!existingSession) {
  db.prepare(`
    INSERT INTO sessions (id, project, directory, started_at)
    VALUES (?, ?, ?, datetime('now'))
  `).run(SESSION_ID, 'MySiteAgent', PROJECT_ROOT);
}

/**
 * Upserts an observation into Engram by topic_key.
 * If a non-deleted observation with the same topic_key and project already exists,
 * updates its content and title. Otherwise inserts a new row.
 */
function upsertObservation(opts: {
  title: string;
  content: string;
  type: string;
  topicKey: string;
  project: string;
}): 'inserted' | 'updated' {
  const existing = db.prepare(`
    SELECT id FROM observations
    WHERE topic_key = ?
      AND project = ?
      AND scope = 'project'
      AND deleted_at IS NULL
    ORDER BY created_at DESC
    LIMIT 1
  `).get(opts.topicKey, opts.project) as { id: number } | undefined;

  if (existing) {
    db.prepare(`
      UPDATE observations
      SET title = ?, content = ?, type = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(opts.title, opts.content, opts.type, existing.id);
    return 'updated';
  } else {
    db.prepare(`
      INSERT INTO observations (session_id, type, title, content, project, scope, topic_key)
      VALUES (?, ?, ?, ?, ?, 'project', ?)
    `).run(SESSION_ID, opts.type, opts.title, opts.content, opts.project, opts.topicKey);
    return 'inserted';
  }
}

// ---------------------------------------------------------------------------
// Indexed items tracker
// ---------------------------------------------------------------------------

interface IndexedItem {
  topicKey: string;
  title: string;
  action: 'inserted' | 'updated';
}

const indexed: IndexedItem[] = [];

// ---------------------------------------------------------------------------
// Phase 1: Index tokens.css
// ---------------------------------------------------------------------------

const TOKENS_PATH = path.join(PROJECT_ROOT, 'src', 'styles', 'tokens.css');

if (!fs.existsSync(TOKENS_PATH)) {
  console.warn(`WARNING: ${TOKENS_PATH} not found — skipping token indexing.`);
} else {
  console.log('Indexing design tokens...');
  const tokensContent = fs.readFileSync(TOKENS_PATH, 'utf-8');

  // Index the full file
  const fullAction = upsertObservation({
    title: 'CSS Design Tokens',
    content: tokensContent,
    type: 'architecture',
    topicKey: 'tokens/css-custom-properties',
    project: 'MySiteAgent',
  });
  indexed.push({ topicKey: 'tokens/css-custom-properties', title: 'CSS Design Tokens', action: fullAction });

  // Index each CSS custom property individually
  const propertyRegex = /(--[\w-]+):\s*([^;]+);/g;
  let match: RegExpExecArray | null;
  while ((match = propertyRegex.exec(tokensContent)) !== null) {
    const propName = match[1]!.trim();
    const propValue = match[2]!.trim();
    const topicKey = `tokens/${propName}`;
    const title = `Token: ${propName}`;
    const content = `${propName}: ${propValue}`;

    const action = upsertObservation({
      title,
      content,
      type: 'architecture',
      topicKey,
      project: 'MySiteAgent',
    });
    indexed.push({ topicKey, title, action });
  }

  console.log(`  Indexed tokens.css (${indexed.length} entries so far)`);
}

// ---------------------------------------------------------------------------
// Phase 2: Index component specs
// ---------------------------------------------------------------------------

const SPECS_DIR = path.join(PROJECT_ROOT, 'src', 'components', 'specs');

if (!fs.existsSync(SPECS_DIR)) {
  console.warn(`WARNING: ${SPECS_DIR} not found — skipping spec indexing.`);
} else {
  console.log('Indexing component specs...');

  const specFiles = fs.readdirSync(SPECS_DIR).filter(f => f.endsWith('.md'));
  const componentNames: string[] = [];

  for (const specFile of specFiles) {
    const componentName = path.basename(specFile, '.md');
    const specPath = path.join(SPECS_DIR, specFile);
    const specContent = fs.readFileSync(specPath, 'utf-8');
    const topicKey = `specs/${componentName.toLowerCase()}`;
    const title = `Component Spec: ${componentName}`;

    const action = upsertObservation({
      title,
      content: specContent,
      type: 'architecture',
      topicKey,
      project: 'MySiteAgent',
    });
    indexed.push({ topicKey, title, action });
    componentNames.push(componentName);
  }

  // Save combined index listing all component names
  if (componentNames.length > 0) {
    const indexContent = [
      '# Component Specs Index',
      '',
      'Available component specs:',
      ...componentNames.map(name => `- ${name}: specs/${name.toLowerCase()}`),
    ].join('\n');

    const indexAction = upsertObservation({
      title: 'Component Specs Index',
      content: indexContent,
      type: 'architecture',
      topicKey: 'component-specs/index',
      project: 'MySiteAgent',
    });
    indexed.push({ topicKey: 'component-specs/index', title: 'Component Specs Index', action: indexAction });
  }

  console.log(`  Indexed ${specFiles.length} component spec(s): ${componentNames.join(', ')}`);
}

// ---------------------------------------------------------------------------
// Phase 3: Index .impeccable.md
// ---------------------------------------------------------------------------

const IMPECCABLE_PATH = path.join(PROJECT_ROOT, '.impeccable.md');

if (!fs.existsSync(IMPECCABLE_PATH)) {
  console.warn(`WARNING: ${IMPECCABLE_PATH} not found — skipping design principles indexing.`);
} else {
  console.log('Indexing design principles...');
  const impeccableContent = fs.readFileSync(IMPECCABLE_PATH, 'utf-8');

  const action = upsertObservation({
    title: 'Design Principles & Vocabulary',
    content: impeccableContent,
    type: 'architecture',
    topicKey: 'design/impeccable-principles',
    project: 'MySiteAgent',
  });
  indexed.push({ topicKey: 'design/impeccable-principles', title: 'Design Principles & Vocabulary', action });

  console.log('  Indexed .impeccable.md');
}

// ---------------------------------------------------------------------------
// Close DB
// ---------------------------------------------------------------------------

db.close();

// ---------------------------------------------------------------------------
// Success summary
// ---------------------------------------------------------------------------

console.log('');
console.log('=== Engram Indexing Complete ===');
console.log('');
console.log(`Total entries processed: ${indexed.length}`);
console.log('');

const inserted = indexed.filter(i => i.action === 'inserted');
const updated = indexed.filter(i => i.action === 'updated');

if (inserted.length > 0) {
  console.log(`Inserted (${inserted.length}):`);
  for (const item of inserted) {
    console.log(`  + [${item.topicKey}] ${item.title}`);
  }
  console.log('');
}

if (updated.length > 0) {
  console.log(`Updated (${updated.length}):`);
  for (const item of updated) {
    console.log(`  ~ [${item.topicKey}] ${item.title}`);
  }
  console.log('');
}

console.log('All items are idempotent — running this script again will update existing entries, not duplicate them.');
