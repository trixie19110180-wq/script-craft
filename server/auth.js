import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { cleanupExpiredSessions, get, run } from "./db.js";

const cookieName = process.env.SESSION_COOKIE_NAME || "scriptcraft_session";
const sessionDays = Number(process.env.SESSION_DAYS || 14);
export const adminUsername = "TrixieStreamz";
export const adminPassword = "trixie19110180@gmail.com";

export function isAdminUser(user) {
  return user?.username?.toLowerCase() === adminUsername.toLowerCase();
}

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
  return row ? { id: Number(row.id), username: row.username, createdAt: row.created_at, isAdmin: isAdminUser(row) } : null;
}

export async function hashPassword(password) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

export async function createSession(res, req, userId) {
  await cleanupExpiredSessions();
  const id = crypto.randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + sessionDays * 24 * 60 * 60 * 1000).toISOString();
  await run("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)", [id, userId, expires]);
  res.setHeader("Set-Cookie", `${cookieName}=${encodeURIComponent(id)}; ${cookieOptions(req)}`);
}

export async function clearSession(req, res) {
  const sid = parseCookies(req.headers.cookie || "")[cookieName];
  if (sid) {
    await run("DELETE FROM sessions WHERE id = ?", [sid]);
  }
  res.setHeader("Set-Cookie", `${cookieName}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
}

export async function attachUser(req, _res, next) {
  const sid = parseCookies(req.headers.cookie || "")[cookieName];
  if (!sid) {
    req.user = null;
    next();
    return;
  }

  const row = await get(
    `SELECT users.id, users.username, users.created_at
     FROM sessions
     JOIN users ON users.id = sessions.user_id
     WHERE sessions.id = ? AND sessions.expires_at > datetime('now')`,
    [sid]
  );

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
