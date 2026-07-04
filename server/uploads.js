import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import multer from "multer";

export const uploadDir = process.env.UPLOAD_DIR || path.join("server", "uploads");
fs.mkdirSync(uploadDir, { recursive: true });

const allowedTypes = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"]);
const maxUploadMb = Number(process.env.MAX_UPLOAD_MB || 8);

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => callback(null, uploadDir),
  filename: (_req, file, callback) => {
    const safeExt = path.extname(file.originalname).toLowerCase().replace(/[^a-z0-9.]/g, "") || ".png";
    callback(null, `${crypto.randomBytes(18).toString("hex")}${safeExt}`);
  }
});

export const uploadImage = multer({
  storage,
  limits: { fileSize: maxUploadMb * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    if (!allowedTypes.has(file.mimetype)) {
      callback(new Error("Only PNG, JPEG, WebP, GIF, and SVG images are allowed."));
      return;
    }
    callback(null, true);
  }
});

export function removeAssetFile(filePath) {
  if (!filePath) return;
  fs.unlink(filePath, () => {});
}
