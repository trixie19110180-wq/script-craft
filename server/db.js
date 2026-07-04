import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

function writableDbPath() {
  const requestedPath = process.env.DB_PATH || path.join("server", "data", "scriptcraft.sqlite");
  try {
    fs.mkdirSync(path.dirname(requestedPath), { recursive: true });
    return requestedPath;
  } catch (error) {
    if (process.env.DB_PATH) {
      console.warn(`Could not use DB_PATH=${process.env.DB_PATH}: ${error.message}`);
    }
    const fallbackPath = path.join(os.tmpdir(), "scriptcraft", "scriptcraft.sqlite");
    fs.mkdirSync(path.dirname(fallbackPath), { recursive: true });
    return fallbackPath;
  }
}

export const db = new Database(writableDbPath());
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
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

const projectColumns = db.prepare("PRAGMA table_info(projects)").all().map((column) => column.name);
if (!projectColumns.includes("remix_of_project_id")) {
  db.exec("ALTER TABLE projects ADD COLUMN remix_of_project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL");
}

export function projectSummary(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    published: Boolean(row.published),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    author: row.author,
    thumbnailUrl: row.thumbnail_url || null,
    remixOfProjectId: row.remix_of_project_id || null,
    remixOfTitle: row.remix_of_title || null,
    remixOfAuthor: row.remix_of_author || null
  };
}

export function assetFromRow(row) {
  return {
    id: row.id,
    projectId: row.project_id,
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
    thumbnailAssetId: row.thumbnail_asset_id,
    assets
  };
}

export function cleanupExpiredSessions() {
  db.prepare("DELETE FROM sessions WHERE expires_at < datetime('now')").run();
}
