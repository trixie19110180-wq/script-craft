import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

const usePostgres = Boolean(process.env.DATABASE_URL);
let sqlite = null;
let pool = null;

function writableDbPath() {
  const requestedPath = process.env.DB_PATH || path.join("server", "data", "scriptcraft.sqlite");
  try {
    fs.mkdirSync(path.dirname(requestedPath), { recursive: true });
    return requestedPath;
  } catch (error) {
    if (process.env.DB_PATH) console.warn(`Could not use DB_PATH=${process.env.DB_PATH}: ${error.message}`);
    const fallbackPath = path.join(os.tmpdir(), "scriptcraft", "scriptcraft.sqlite");
    fs.mkdirSync(path.dirname(fallbackPath), { recursive: true });
    return fallbackPath;
  }
}

function toPostgresSql(sql) {
  let index = 0;
  return sql
    .replace(/\?/g, () => `$${++index}`)
    .replace(/COLLATE NOCASE/g, "")
    .replace(/datetime\('now'\)/g, "CURRENT_TIMESTAMP");
}

async function initPostgres() {
  const { Pool } = await import("pg");
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false }
  });
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS projects (
      id BIGSERIAL PRIMARY KEY,
      author_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      data_json TEXT NOT NULL,
      thumbnail_asset_id BIGINT,
      published BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      remix_of_project_id BIGINT REFERENCES projects(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS assets (
      id BIGSERIAL PRIMARY KEY,
      project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK (kind IN ('sprite', 'costume', 'background', 'thumbnail')),
      name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      file_path TEXT NOT NULL,
      public_url TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'projects_thumbnail_asset_id_fkey'
      ) THEN
        ALTER TABLE projects
        ADD CONSTRAINT projects_thumbnail_asset_id_fkey
        FOREIGN KEY (thumbnail_asset_id) REFERENCES assets(id) ON DELETE SET NULL;
      END IF;
    END $$;

    CREATE INDEX IF NOT EXISTS idx_projects_author_id ON projects(author_id);
    CREATE INDEX IF NOT EXISTS idx_projects_published_updated ON projects(published, updated_at);
    CREATE INDEX IF NOT EXISTS idx_assets_project_id ON assets(project_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_lower ON users (LOWER(username));
  `);
}

function initSqlite() {
  sqlite = new Database(writableDbPath());
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      author_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      data_json TEXT NOT NULL,
      thumbnail_asset_id INTEGER,
      published INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (thumbnail_asset_id) REFERENCES assets(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS assets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('sprite', 'costume', 'background', 'thumbnail')),
      name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      file_path TEXT NOT NULL,
      public_url TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_projects_author_id ON projects(author_id);
    CREATE INDEX IF NOT EXISTS idx_projects_published_updated ON projects(published, updated_at);
    CREATE INDEX IF NOT EXISTS idx_assets_project_id ON assets(project_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
  `);

  const projectColumns = sqlite.prepare("PRAGMA table_info(projects)").all().map((column) => column.name);
  if (!projectColumns.includes("remix_of_project_id")) {
    sqlite.exec("ALTER TABLE projects ADD COLUMN remix_of_project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL");
  }
}

if (usePostgres) await initPostgres();
else initSqlite();

export const dbProvider = usePostgres ? "postgres" : "sqlite";

export async function all(sql, params = []) {
  if (usePostgres) return (await pool.query(toPostgresSql(sql), params)).rows;
  return sqlite.prepare(sql).all(...params);
}

export async function get(sql, params = []) {
  if (usePostgres) return (await pool.query(toPostgresSql(sql), params)).rows[0] || null;
  return sqlite.prepare(sql).get(...params) || null;
}

export async function run(sql, params = []) {
  if (usePostgres) {
    const result = await pool.query(toPostgresSql(sql), params);
    return { changes: result.rowCount, lastInsertRowid: result.rows[0]?.id || null, rows: result.rows };
  }
  if (/\bRETURNING\b/i.test(sql)) {
    const row = sqlite.prepare(sql).get(...params);
    return { changes: row ? 1 : 0, lastInsertRowid: row?.id || null, rows: row ? [row] : [] };
  }
  const result = sqlite.prepare(sql).run(...params);
  return { changes: result.changes, lastInsertRowid: result.lastInsertRowid, rows: [] };
}

export function dbBool(value) {
  return usePostgres ? Boolean(value) : value ? 1 : 0;
}

export function projectSummary(row) {
  return {
    id: Number(row.id),
    title: row.title,
    description: row.description,
    published: Boolean(row.published),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    author: row.author,
    thumbnailUrl: row.thumbnail_url || null,
    remixOfProjectId: row.remix_of_project_id ? Number(row.remix_of_project_id) : null,
    remixOfTitle: row.remix_of_title || null,
    remixOfAuthor: row.remix_of_author || null
  };
}

export function assetFromRow(row) {
  return {
    id: Number(row.id),
    projectId: Number(row.project_id),
    kind: row.kind,
    name: row.name,
    mimeType: row.mime_type,
    url: row.public_url,
    createdAt: row.created_at
  };
}

export function projectFromRow(row, assets = []) {
  return {
    ...projectSummary(row),
    data: JSON.parse(row.data_json),
    thumbnailAssetId: row.thumbnail_asset_id ? Number(row.thumbnail_asset_id) : null,
    assets
  };
}

export async function cleanupExpiredSessions() {
  await run("DELETE FROM sessions WHERE expires_at < datetime('now')");
}
