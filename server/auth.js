import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { cleanupExpiredSessions, db } from "./db.js";

const cookieName = process.env.SESSION_COOKIE_NAME || "scriptcraft_session";
const sessionDays = Number(process.env.SESSION_DAYS || 14);

function parseCookies(header = "") {
  return Object.fromEntries(
    header
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        if (index < 0) return [decodeURIComponent(part), ""];
        return [decodeURIComponent(part.slice(0, index)), decodeURIComponent(part.slice(index + 1))];
      })
  );
}

function cookieOptions(req) {
  const secure = process.env.NODE_ENV === "production" || req.headers["x-forwarded-proto"] === "https";
  return [
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    `Max-Age=${sessionDays * 24 * 60 * 60}`,
    secure ? "Secure" : ""
  ]
    .filter(Boolean)
    .join("; ");
}

export function publicUser(row) {
  return row ? { id: row.id, username: row.username, createdAt: row.created_at } : null;
}

export async function hashPassword(password) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

export function createSession(res, req, userId) {
  cleanupExpiredSessions();
  const id = crypto.randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + sessionDays * 24 * 60 * 60 * 1000).toISOString().replace("T", " ").slice(0, 19);
  db.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)").run(id, userId, expires);
  res.setHeader("Set-Cookie", `${cookieName}=${encodeURIComponent(id)}; ${cookieOptions(req)}`);
}

export function clearSession(req, res) {
  const sid = parseCookies(req.headers.cookie || "")[cookieName];
  if (sid) {
    db.prepare("DELETE FROM sessions WHERE id = ?").run(sid);
  }
  res.setHeader("Set-Cookie", `${cookieName}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
}

export function attachUser(req, _res, next) {
  const sid = parseCookies(req.headers.cookie || "")[cookieName];
  if (!sid) {
    req.user = null;
    next();
    return;
  }

  const row = db
    .prepare(
      `SELECT users.id, users.username, users.created_at
       FROM sessions
       JOIN users ON users.id = sessions.user_id
       WHERE sessions.id = ? AND sessions.expires_at > datetime('now')`
    )
    .get(sid);

  req.user = publicUser(row);
  next();
}

export function requireUser(req, res, next) {
  if (!req.user) {
    res.status(401).json({ error: "You need to log in first." });
    return;
  }
  next();
}
