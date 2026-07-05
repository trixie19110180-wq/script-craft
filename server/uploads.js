import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import multer from "multer";

const cloudinaryCloudName = process.env.CLOUDINARY_CLOUD_NAME;
const cloudinaryApiKey = process.env.CLOUDINARY_API_KEY;
const cloudinaryApiSecret = process.env.CLOUDINARY_API_SECRET;
export const useCloudinary = Boolean(cloudinaryCloudName && cloudinaryApiKey && cloudinaryApiSecret);

function writableUploadDir() {
  const requestedDir = process.env.UPLOAD_DIR || path.join("server", "uploads");
  try {
    fs.mkdirSync(requestedDir, { recursive: true });
    return requestedDir;
  } catch (error) {
    if (process.env.UPLOAD_DIR) console.warn(`Could not use UPLOAD_DIR=${process.env.UPLOAD_DIR}: ${error.message}`);
    const fallbackDir = path.join(os.tmpdir(), "scriptcraft", "uploads");
    fs.mkdirSync(fallbackDir, { recursive: true });
    return fallbackDir;
  }
}

export const uploadDir = writableUploadDir();

const allowedTypes = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"]);
const maxUploadMb = Number(process.env.MAX_UPLOAD_MB || 8);

export const uploadImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxUploadMb * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    if (!allowedTypes.has(file.mimetype)) {
      callback(new Error("Only PNG, JPEG, WebP, GIF, and SVG images are allowed."));
      return;
    }
    callback(null, true);
  }
});

export const uploadProjectFile = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }
});

function extensionForMime(mimeType = "") {
  if (mimeType.includes("svg")) return ".svg";
  if (mimeType.includes("jpeg")) return ".jpg";
  if (mimeType.includes("webp")) return ".webp";
  if (mimeType.includes("gif")) return ".gif";
  return ".png";
}

function localPublicUrl(fileName) {
  return `/uploads/${fileName}`;
}

async function uploadToCloudinary(buffer, mimeType, name, folder = "scriptcraft/assets") {
  const timestamp = Math.floor(Date.now() / 1000);
  const publicId = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}`;
  const signatureSource = `folder=${folder}&public_id=${publicId}&timestamp=${timestamp}${cloudinaryApiSecret}`;
  const signature = crypto.createHash("sha1").update(signatureSource).digest("hex");
  const form = new FormData();
  form.append("file", new Blob([buffer], { type: mimeType || "application/octet-stream" }), name || `asset${extensionForMime(mimeType)}`);
  form.append("api_key", cloudinaryApiKey);
  form.append("timestamp", String(timestamp));
  form.append("folder", folder);
  form.append("public_id", publicId);
  form.append("signature", signature);

  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudinaryCloudName}/auto/upload`, {
    method: "POST",
    body: form
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || "Cloudinary upload failed.");
  return {
    filePath: `cloudinary:${data.public_id}`,
    publicUrl: data.secure_url
  };
}

async function destroyCloudinary(publicId) {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = crypto.createHash("sha1").update(`public_id=${publicId}&timestamp=${timestamp}${cloudinaryApiSecret}`).digest("hex");
  const form = new FormData();
  form.append("api_key", cloudinaryApiKey);
  form.append("timestamp", String(timestamp));
  form.append("public_id", publicId);
  form.append("signature", signature);
  await fetch(`https://api.cloudinary.com/v1_1/${cloudinaryCloudName}/image/destroy`, {
    method: "POST",
    body: form
  }).catch(() => {});
}

export async function storeAssetBuffer(buffer, { originalName = "asset.png", mimeType = "image/png", folder } = {}) {
  if (useCloudinary) {
    return uploadToCloudinary(buffer, mimeType, originalName, folder);
  }
  const safeExt = path.extname(originalName).toLowerCase().replace(/[^a-z0-9.]/g, "") || extensionForMime(mimeType);
  const storedName = `${crypto.randomBytes(18).toString("hex")}${safeExt}`;
  const filePath = path.join(uploadDir, storedName);
  fs.writeFileSync(filePath, buffer);
  return { filePath, publicUrl: localPublicUrl(storedName) };
}

export async function copyStoredAsset(asset) {
  if (String(asset.file_path || "").startsWith("cloudinary:")) {
    const response = await fetch(asset.public_url);
    if (!response.ok) throw new Error("Could not copy remote asset.");
    const buffer = Buffer.from(await response.arrayBuffer());
    return storeAssetBuffer(buffer, {
      originalName: asset.name || "asset.png",
      mimeType: asset.mime_type || response.headers.get("content-type") || "image/png"
    });
  }
  if (!asset.file_path || !fs.existsSync(asset.file_path)) return null;
  const buffer = fs.readFileSync(asset.file_path);
  return storeAssetBuffer(buffer, {
    originalName: path.basename(asset.file_path),
    mimeType: asset.mime_type
  });
}

export async function removeAssetFile(filePath) {
  if (!filePath) return;
  if (useCloudinary && String(filePath).startsWith("cloudinary:")) {
    await destroyCloudinary(String(filePath).replace(/^cloudinary:/, ""));
    return;
  }
  fs.unlink(filePath, () => {});
}
