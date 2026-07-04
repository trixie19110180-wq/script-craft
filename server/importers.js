import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import AdmZip from "adm-zip";
import { assetFromRow, db } from "./db.js";
import { uploadDir } from "./uploads.js";

const imageTypes = new Map([
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".gif", "image/gif"],
  [".svg", "image/svg+xml"]
]);

function safeName(name, fallback) {
  return String(name || fallback || "Imported Project").trim().slice(0, 80) || fallback;
}

function writeAsset(projectId, kind, name, fileName, buffer, mimeType) {
  const ext = path.extname(fileName || "").toLowerCase() || extensionForMime(mimeType);
  const storedName = `${crypto.randomBytes(18).toString("hex")}${ext}`;
  const filePath = path.join(uploadDir, storedName);
  fs.writeFileSync(filePath, buffer);
  const result = db
    .prepare("INSERT INTO assets (project_id, kind, name, mime_type, file_path, public_url) VALUES (?, ?, ?, ?, ?, ?)")
    .run(projectId, kind, safeName(name, "Asset"), mimeType || imageTypes.get(ext) || "application/octet-stream", filePath, `/uploads/${storedName}`);
  return assetFromRow(db.prepare("SELECT * FROM assets WHERE id = ?").get(result.lastInsertRowid));
}

function extensionForMime(mimeType = "") {
  if (mimeType.includes("svg")) return ".svg";
  if (mimeType.includes("jpeg")) return ".jpg";
  if (mimeType.includes("webp")) return ".webp";
  if (mimeType.includes("gif")) return ".gif";
  return ".png";
}

function dataUrlToAsset(projectId, asset) {
  const match = String(asset.dataUrl || "").match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return writeAsset(projectId, asset.kind, asset.name, asset.fileName || asset.name, Buffer.from(match[2], "base64"), match[1]);
}

function defaultData() {
  return {
    stage: { width: 640, height: 360, backgroundColor: "#eef3ff", backgroundAssetId: null },
    variables: [],
    sprites: []
  };
}

function scratchX(x = 0) {
  return 320 + Number(x || 0) * (640 / 480);
}

function scratchY(y = 0) {
  return 180 - Number(y || 0);
}

function describeScratchBlocks(blocks = {}) {
  const counts = {};
  for (const block of Object.values(blocks)) {
    if (block?.opcode) counts[block.opcode] = (counts[block.opcode] || 0) + 1;
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([opcode, count]) => `// ${opcode} x${count}`)
    .join("\n");
}

function importedScript(source, notes) {
  const header = notes ? `${notes}\n\n` : "";
  return {
    language: "javascript",
    code: `${header}function start() {\n  say("Imported from ${source}", 1.5);\n}\n\nfunction update(dt) {\n  // Rebuild imported block behavior here with ScriptCraft code.\n}`
  };
}

function createBaseProject(userId, title, description) {
  const result = db
    .prepare("INSERT INTO projects (author_id, title, description, data_json) VALUES (?, ?, ?, ?)")
    .run(userId, safeName(title, "Imported Project"), String(description || "").slice(0, 600), JSON.stringify(defaultData()));
  return result.lastInsertRowid;
}

export function importScriptCraft(userId, json) {
  const payload = typeof json === "string" ? JSON.parse(json) : json;
  const projectId = createBaseProject(userId, payload.title, payload.description || "Imported ScriptCraft project");
  const importedAssets = new Map();
  for (const asset of payload.assets || []) {
    const saved = dataUrlToAsset(projectId, asset);
    if (saved) importedAssets.set(asset.id, saved.id);
  }

  const data = payload.data || defaultData();
  if (data.stage?.backgroundAssetId) data.stage.backgroundAssetId = importedAssets.get(data.stage.backgroundAssetId) || null;
  for (const sprite of data.sprites || []) {
    if (sprite.costumeAssetId) sprite.costumeAssetId = importedAssets.get(sprite.costumeAssetId) || null;
  }
  const thumbnailAssetId = payload.thumbnailAssetId ? importedAssets.get(payload.thumbnailAssetId) || null : null;
  db.prepare("UPDATE projects SET data_json = ?, thumbnail_asset_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(
    JSON.stringify(data),
    thumbnailAssetId,
    projectId
  );
  return projectId;
}

export function importScratchSb3(userId, buffer, fallbackTitle) {
  const zip = new AdmZip(buffer);
  const projectEntry = zip.getEntry("project.json");
  if (!projectEntry) throw new Error("Scratch file is missing project.json.");
  const scratch = JSON.parse(projectEntry.getData().toString("utf8"));
  const projectId = createBaseProject(userId, fallbackTitle?.replace(/\.sb3$/i, ""), "Imported from Scratch .sb3");
  const data = defaultData();
  data.stage.backgroundColor = "#ffffff";

  for (const target of scratch.targets || []) {
    if (target.isStage) {
      const costume = (target.costumes || [])[target.currentCostume || 0] || (target.costumes || [])[0];
      const asset = importScratchAsset(zip, projectId, "background", costume);
      if (asset) data.stage.backgroundAssetId = asset.id;
      continue;
    }

    const costume = (target.costumes || [])[target.currentCostume || 0] || (target.costumes || [])[0];
    const asset = importScratchAsset(zip, projectId, "costume", costume);
    data.sprites.push({
      id: `sprite-${target.name || crypto.randomBytes(4).toString("hex")}`,
      name: safeName(target.name, "Scratch Sprite"),
      x: scratchX(target.x),
      y: scratchY(target.y),
      size: Math.max(16, Number(target.size || 100) * 0.72),
      rotation: Number(target.direction || 90) - 90,
      visible: target.visible !== false,
      costumeAssetId: asset?.id || null,
      color: "#f97316",
      script: importedScript("Scratch", describeScratchBlocks(target.blocks))
    });
  }

  if (!data.sprites.length) data.sprites.push(fallbackSprite("Scratch"));
  db.prepare("UPDATE projects SET data_json = ?, thumbnail_asset_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(
    JSON.stringify(data),
    null,
    projectId
  );
  return projectId;
}

function importScratchAsset(zip, projectId, kind, costume) {
  if (!costume?.md5ext) return null;
  const entry = zip.getEntry(costume.md5ext);
  if (!entry) return null;
  const ext = path.extname(costume.md5ext).toLowerCase();
  if (!imageTypes.has(ext)) return null;
  return writeAsset(projectId, kind, costume.name, costume.md5ext, entry.getData(), imageTypes.get(ext));
}

export function importEntryEnt(userId, buffer, fallbackTitle) {
  const entries = readEntryPackage(buffer);
  const projectBytes = entries.get("temp/project.json") || entries.get("project.json");
  if (!projectBytes) throw new Error("Entry file is missing project.json.");
  const entryProject = JSON.parse(projectBytes.toString("utf8"));
  const projectId = createBaseProject(userId, entryProject.name || fallbackTitle?.replace(/\.ent$/i, ""), "Imported from Entry .ent");
  const data = defaultData();
  data.stage.backgroundColor = "#ffffff";

  for (const object of entryProject.objects || []) {
    const picture = object.sprite?.pictures?.find((item) => item.id === object.selectedPictureId) || object.sprite?.pictures?.[0];
    if (object.name === "Stage") {
      const asset = importEntryPicture(entries, projectId, "background", picture);
      if (asset) data.stage.backgroundAssetId = asset.id;
      continue;
    }
    const asset = importEntryPicture(entries, projectId, "costume", picture);
    data.sprites.push({
      id: `sprite-${object.id || crypto.randomBytes(4).toString("hex")}`,
      name: safeName(object.name, "Entry Sprite"),
      x: 320 + Number(object.entity?.x || 0),
      y: 180 - Number(object.entity?.y || 0),
      size: Math.max(16, Number(object.entity?.width || picture?.dimension?.width || 72) * Math.abs(Number(object.entity?.scaleX || 1))),
      rotation: Number(object.entity?.rotation || 0),
      visible: object.entity?.visible !== false,
      costumeAssetId: asset?.id || null,
      color: "#16a34a",
      script: importedScript("Entry", describeEntryScript(object.script))
    });
  }

  if (!data.sprites.length) data.sprites.push(fallbackSprite("Entry"));
  db.prepare("UPDATE projects SET data_json = ?, thumbnail_asset_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(
    JSON.stringify(data),
    null,
    projectId
  );
  return projectId;
}

function importEntryPicture(entries, projectId, kind, picture) {
  if (!picture?.fileurl) return null;
  const bytes = entries.get(picture.fileurl);
  const ext = path.extname(picture.fileurl).toLowerCase();
  if (!bytes || !imageTypes.has(ext)) return null;
  return writeAsset(projectId, kind, picture.name, picture.fileurl, bytes, imageTypes.get(ext));
}

function describeEntryScript(script = "[]") {
  try {
    const groups = JSON.parse(script);
    const counts = {};
    for (const group of groups) {
      for (const block of group || []) {
        if (block?.type) counts[block.type] = (counts[block.type] || 0) + 1;
      }
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([type, count]) => `// ${type} x${count}`)
      .join("\n");
  } catch {
    return "// Entry script metadata could not be read.";
  }
}

function fallbackSprite(source) {
  return {
    id: "sprite-1",
    name: `${source} Sprite`,
    x: 320,
    y: 180,
    size: 72,
    rotation: 0,
    visible: true,
    costumeAssetId: null,
    color: "#f97316",
    script: importedScript(source, "")
  };
}

function readEntryPackage(buffer) {
  let tarBytes = buffer;
  try {
    tarBytes = zlib.gunzipSync(buffer);
  } catch {
    const text = buffer.toString("utf8");
    if (text.trim().startsWith("{")) return new Map([["project.json", Buffer.from(text)]]);
    throw new Error("Entry file must be a .ent gzip package or project JSON.");
  }
  return readTar(tarBytes);
}

function readTar(buffer) {
  const entries = new Map();
  let offset = 0;
  while (offset + 512 <= buffer.length) {
    const header = buffer.subarray(offset, offset + 512);
    offset += 512;
    if (header.every((byte) => byte === 0)) break;
    const name = header.toString("utf8", 0, 100).replace(/\0.*$/, "");
    const sizeText = header.toString("utf8", 124, 136).replace(/\0.*$/, "").trim();
    const size = Number.parseInt(sizeText || "0", 8);
    const data = buffer.subarray(offset, offset + size);
    offset += Math.ceil(size / 512) * 512;
    if (name && !name.includes("PaxHeader")) entries.set(name, Buffer.from(data));
  }
  return entries;
}
