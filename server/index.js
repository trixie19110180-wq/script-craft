import express from "express";
import fs from "node:fs";
import helmet from "helmet";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { adminPassword, adminUsername, attachUser, clearSession, createSession, hashPassword, isAdminUser, publicUser, requireUser, verifyPassword } from "./auth.js";
import { assetFromRow, db, projectFromRow, projectSummary } from "./db.js";
import { importEntryEnt, importScratchSb3, importScriptCraft } from "./importers.js";
import { removeAssetFile, uploadDir, uploadImage, uploadProjectFile } from "./uploads.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const app = express();
const port = Number(process.env.PORT || 3000);

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "same-site" }
  })
);
app.use(express.json({ limit: "1mb" }));
app.use(attachUser);
app.use("/uploads", express.static(uploadDir, { fallthrough: false, maxAge: "7d" }));

const defaultProjectData = {
  stage: {
    width: 480,
    height: 360,
    backgroundColor: "#eef3ff",
    backgroundAssetId: null,
    script: {
      language: "javascript",
      code: "function start() {\n  console.log(\"Background ready\");\n}\n\nfunction update(dt) {\n}"
    }
  },
  variables: [],
  sprites: [
    {
      id: "sprite-1",
      name: "Sprite 1",
      x: 240,
      y: 180,
      size: 72,
      rotation: 0,
      visible: true,
      costumeAssetId: null,
      shape: "logo",
      script: {
        language: "javascript",
        code: "function start() {\n  say(\"Hello from ScriptCraft\", 1800);\n}\n\nfunction update(dt) {\n  if (key(\"ArrowRight\")) changeX(4);\n  if (key(\"ArrowLeft\")) changeX(-4);\n  if (key(\"ArrowUp\")) changeY(4);\n  if (key(\"ArrowDown\")) changeY(-4);\n  bounceOnEdge();\n}"
      }
    }
  ]
};

function validateUsername(username = "") {
  return /^[A-Za-z0-9_]{3,24}$/.test(username);
}

function validateProjectAccess(project, user, res) {
  if (!project) {
    res.status(404).json({ error: "Project not found." });
    return false;
  }
  if (!project.published && (!user || (user.id !== project.author_id && !isAdminUser(user)))) {
    res.status(403).json({ error: "This project is private." });
    return false;
  }
  return true;
}

function requireOwner(projectId, user, res) {
  const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(projectId);
  if (!project) {
    res.status(404).json({ error: "Project not found." });
    return null;
  }
  if (project.author_id !== user.id && !isAdminUser(user)) {
    res.status(403).json({ error: "You can only change your own projects." });
    return null;
  }
  return project;
}

function loadProject(id, user) {
  const row = db
    .prepare(
      `SELECT projects.*, users.username AS author, thumb.public_url AS thumbnail_url,
              original.title AS remix_of_title, original_author.username AS remix_of_author
       FROM projects
       JOIN users ON users.id = projects.author_id
       LEFT JOIN assets AS thumb ON thumb.id = projects.thumbnail_asset_id
       LEFT JOIN projects AS original ON original.id = projects.remix_of_project_id
       LEFT JOIN users AS original_author ON original_author.id = original.author_id
       WHERE projects.id = ?`
    )
    .get(id);
  if (!validateProjectAccess(row, user, { status: () => ({ json: () => {} }) })) return null;
  const assets = db.prepare("SELECT * FROM assets WHERE project_id = ? ORDER BY created_at DESC").all(id).map(assetFromRow);
  return projectFromRow(row, assets);
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, name: "ScriptCraft" });
});

app.get("/api/auth/me", (req, res) => {
  res.json({ user: req.user });
});

app.post("/api/auth/signup", async (req, res) => {
  const username = String(req.body.username || "").trim();
  const password = String(req.body.password || "");
  if (!validateUsername(username)) {
    res.status(400).json({ error: "Use 3-24 letters, numbers, or underscores for your username." });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: "Use a password with at least 8 characters." });
    return;
  }

  try {
    const passwordHash = await hashPassword(password);
    const result = db.prepare("INSERT INTO users (username, password_hash) VALUES (?, ?)").run(username, passwordHash);
    createSession(res, req, result.lastInsertRowid);
    const user = db.prepare("SELECT id, username, created_at FROM users WHERE id = ?").get(result.lastInsertRowid);
    res.status(201).json({ user: publicUser(user) });
  } catch (error) {
    if (String(error.message).includes("UNIQUE")) {
      res.status(409).json({ error: "That username is already taken." });
      return;
    }
    res.status(500).json({ error: "Could not create the account." });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const username = String(req.body.username || "").trim();
  const password = String(req.body.password || "");
  const row = db.prepare("SELECT * FROM users WHERE username = ? COLLATE NOCASE").get(username);
  if (!row || !(await verifyPassword(password, row.password_hash))) {
    res.status(401).json({ error: "Username or password is incorrect." });
    return;
  }
  createSession(res, req, row.id);
  res.json({ user: publicUser(row) });
});

app.post("/api/auth/logout", (req, res) => {
  clearSession(req, res);
  res.json({ ok: true });
});

app.get("/api/projects", (req, res) => {
  const mine = req.query.mine === "1";
  if (mine) {
    if (!req.user) {
      res.status(401).json({ error: "You need to log in first." });
      return;
    }
    const rows = isAdminUser(req.user)
      ? db
          .prepare(
            `SELECT projects.*, users.username AS author, thumb.public_url AS thumbnail_url
             FROM projects
             JOIN users ON users.id = projects.author_id
             LEFT JOIN assets AS thumb ON thumb.id = projects.thumbnail_asset_id
             ORDER BY projects.updated_at DESC`
          )
          .all()
      : db
          .prepare(
            `SELECT projects.*, users.username AS author, thumb.public_url AS thumbnail_url
             FROM projects
             JOIN users ON users.id = projects.author_id
             LEFT JOIN assets AS thumb ON thumb.id = projects.thumbnail_asset_id
             WHERE projects.author_id = ?
             ORDER BY projects.updated_at DESC`
          )
          .all(req.user.id);
    res.json({ projects: rows.map(projectSummary) });
    return;
  }

  const rows = db
    .prepare(
      `SELECT projects.*, users.username AS author, thumb.public_url AS thumbnail_url
       FROM projects
       JOIN users ON users.id = projects.author_id
       LEFT JOIN assets AS thumb ON thumb.id = projects.thumbnail_asset_id
       WHERE projects.published = 1
       ORDER BY projects.updated_at DESC`
    )
    .all();
  res.json({ projects: rows.map(projectSummary) });
});

app.post("/api/projects", requireUser, (req, res) => {
  const title = String(req.body.title || "Untitled Project").trim().slice(0, 80) || "Untitled Project";
  const description = String(req.body.description || "").trim().slice(0, 600);
  const result = db
    .prepare("INSERT INTO projects (author_id, title, description, data_json) VALUES (?, ?, ?, ?)")
    .run(req.user.id, title, description, JSON.stringify(defaultProjectData));
  res.status(201).json({ project: loadProject(result.lastInsertRowid, req.user) });
});

app.post("/api/projects/import", requireUser, uploadProjectFile.single("project"), (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "Choose a Scratch, Entry, or ScriptCraft project file." });
    return;
  }

  try {
    const filename = req.file.originalname || "Imported Project";
    const lower = filename.toLowerCase();
    let projectId;
    if (lower.endsWith(".sb3")) {
      projectId = importScratchSb3(req.user.id, req.file.buffer, filename);
    } else if (lower.endsWith(".ent")) {
      projectId = importEntryEnt(req.user.id, req.file.buffer, filename);
    } else if (lower.endsWith(".scriptcraft") || lower.endsWith(".json")) {
      projectId = importScriptCraft(req.user.id, req.file.buffer.toString("utf8"));
    } else {
      res.status(400).json({ error: "Supported files: .sb3, .ent, .scriptcraft, and .json." });
      return;
    }
    res.status(201).json({ project: loadProject(projectId, req.user) });
  } catch (error) {
    res.status(400).json({ error: error.message || "Could not import that project." });
  }
});

app.post("/api/projects/:id/remix", requireUser, (req, res) => {
  const original = db.prepare("SELECT * FROM projects WHERE id = ?").get(req.params.id);
  if (!validateProjectAccess(original, req.user, res)) return;
  const originalAssets = db.prepare("SELECT * FROM assets WHERE project_id = ?").all(original.id);
  const data = JSON.parse(original.data_json);
  const result = db
    .prepare("INSERT INTO projects (author_id, title, description, data_json, published, remix_of_project_id) VALUES (?, ?, ?, ?, 0, ?)")
    .run(req.user.id, `Remix of ${original.title}`.slice(0, 80), original.description, JSON.stringify(data), original.id);
  const remixId = result.lastInsertRowid;
  const assetIdMap = new Map();

  for (const asset of originalAssets) {
    const ext = path.extname(asset.file_path) || path.extname(asset.public_url) || ".png";
    const newName = `${Date.now()}-${Math.random().toString(16).slice(2)}${ext}`;
    const newPath = path.join(uploadDir, newName);
    if (!fs.existsSync(asset.file_path)) continue;
    fs.copyFileSync(asset.file_path, newPath);
    const inserted = db
      .prepare("INSERT INTO assets (project_id, kind, name, mime_type, file_path, public_url) VALUES (?, ?, ?, ?, ?, ?)")
      .run(remixId, asset.kind, asset.name, asset.mime_type, newPath, `/uploads/${newName}`);
    assetIdMap.set(asset.id, inserted.lastInsertRowid);
  }

  if (data.stage?.backgroundAssetId) {
    data.stage.backgroundAssetId = assetIdMap.get(data.stage.backgroundAssetId) || null;
  }
  for (const sprite of data.sprites || []) {
    if (sprite.costumeAssetId) sprite.costumeAssetId = assetIdMap.get(sprite.costumeAssetId) || null;
  }
  const thumbnailAssetId = original.thumbnail_asset_id ? assetIdMap.get(original.thumbnail_asset_id) || null : null;
  db.prepare("UPDATE projects SET data_json = ?, thumbnail_asset_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(
    JSON.stringify(data),
    thumbnailAssetId,
    remixId
  );
  res.status(201).json({ project: loadProject(remixId, req.user) });
});

app.get("/api/projects/:id", (req, res) => {
  const row = db
    .prepare(
      `SELECT projects.*, users.username AS author, thumb.public_url AS thumbnail_url,
              original.title AS remix_of_title, original_author.username AS remix_of_author
       FROM projects
       JOIN users ON users.id = projects.author_id
       LEFT JOIN assets AS thumb ON thumb.id = projects.thumbnail_asset_id
       LEFT JOIN projects AS original ON original.id = projects.remix_of_project_id
       LEFT JOIN users AS original_author ON original_author.id = original.author_id
       WHERE projects.id = ?`
    )
    .get(req.params.id);
  if (!validateProjectAccess(row, req.user, res)) return;
  const assets = db.prepare("SELECT * FROM assets WHERE project_id = ? ORDER BY created_at DESC").all(req.params.id).map(assetFromRow);
  res.json({ project: projectFromRow(row, assets) });
});

app.put("/api/projects/:id", requireUser, (req, res) => {
  const project = requireOwner(req.params.id, req.user, res);
  if (!project) return;
  const title = String(req.body.title || project.title).trim().slice(0, 80) || project.title;
  const description = String(req.body.description ?? project.description).trim().slice(0, 600);
  const data = req.body.data || JSON.parse(project.data_json);
  const published = req.body.published === undefined ? project.published : req.body.published ? 1 : 0;
  const thumbnailAssetId = req.body.thumbnailAssetId === undefined ? project.thumbnail_asset_id : req.body.thumbnailAssetId || null;

  if (thumbnailAssetId) {
    const asset = db.prepare("SELECT id FROM assets WHERE id = ? AND project_id = ?").get(thumbnailAssetId, project.id);
    if (!asset) {
      res.status(400).json({ error: "Thumbnail asset does not belong to this project." });
      return;
    }
  }

  db.prepare(
    `UPDATE projects
     SET title = ?, description = ?, data_json = ?, published = ?, thumbnail_asset_id = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  ).run(title, description, JSON.stringify(data), published, thumbnailAssetId, project.id);
  res.json({ project: loadProject(project.id, req.user) });
});

app.delete("/api/projects/:id", requireUser, (req, res) => {
  const project = requireOwner(req.params.id, req.user, res);
  if (!project) return;
  const assets = db.prepare("SELECT file_path FROM assets WHERE project_id = ?").all(project.id);
  db.prepare("DELETE FROM projects WHERE id = ?").run(project.id);
  assets.forEach((asset) => removeAssetFile(asset.file_path));
  res.json({ ok: true });
});

app.post("/api/projects/:id/assets", requireUser, uploadImage.single("image"), (req, res) => {
  const project = requireOwner(req.params.id, req.user, res);
  if (!project) {
    if (req.file) removeAssetFile(req.file.path);
    return;
  }
  if (!req.file) {
    res.status(400).json({ error: "Choose an image to upload." });
    return;
  }
  const kind = String(req.body.kind || "costume");
  if (!["sprite", "costume", "background", "thumbnail"].includes(kind)) {
    removeAssetFile(req.file.path);
    res.status(400).json({ error: "Asset kind must be sprite, costume, background, or thumbnail." });
    return;
  }
  const publicUrl = `/uploads/${path.basename(req.file.path)}`;
  const result = db
    .prepare("INSERT INTO assets (project_id, kind, name, mime_type, file_path, public_url) VALUES (?, ?, ?, ?, ?, ?)")
    .run(project.id, kind, String(req.body.name || req.file.originalname).slice(0, 120), req.file.mimetype, req.file.path, publicUrl);

  if (kind === "thumbnail") {
    db.prepare("UPDATE projects SET thumbnail_asset_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(result.lastInsertRowid, project.id);
  }
  const asset = db.prepare("SELECT * FROM assets WHERE id = ?").get(result.lastInsertRowid);
  res.status(201).json({ asset: assetFromRow(asset), project: loadProject(project.id, req.user) });
});

app.delete("/api/projects/:projectId/assets/:assetId", requireUser, (req, res) => {
  const project = requireOwner(req.params.projectId, req.user, res);
  if (!project) return;
  const asset = db.prepare("SELECT * FROM assets WHERE id = ? AND project_id = ?").get(req.params.assetId, project.id);
  if (!asset) {
    res.status(404).json({ error: "Asset not found." });
    return;
  }
  db.prepare("DELETE FROM assets WHERE id = ?").run(asset.id);
  removeAssetFile(asset.file_path);
  res.json({ ok: true });
});

const distDir = path.join(rootDir, "client", "dist");
app.use(express.static(distDir));
app.get("*", (_req, res) => {
  res.sendFile(path.join(distDir, "index.html"));
});

app.use((error, _req, res, _next) => {
  res.status(400).json({ error: error.message || "Something went wrong." });
});

async function ensureAdminAccount() {
  const passwordHash = await hashPassword(adminPassword);
  const existing = db.prepare("SELECT id FROM users WHERE username = ? COLLATE NOCASE").get(adminUsername);
  if (existing) {
    db.prepare("UPDATE users SET username = ?, password_hash = ? WHERE id = ?").run(adminUsername, passwordHash, existing.id);
    return;
  }
  db.prepare("INSERT INTO users (username, password_hash) VALUES (?, ?)").run(adminUsername, passwordHash);
}

await ensureAdminAccount();

app.listen(port, () => {
  console.log(`ScriptCraft is running on port ${port}`);
});
