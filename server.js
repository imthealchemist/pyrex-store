/* ============================================================
   PYREX STORE — Backend server
   Storage: PostgreSQL when DATABASE_URL is set, else JSON file.
   Either way the public API is identical, so the frontend is unchanged.
   ============================================================ */

const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;

// ---------- Load .env (gitignored, local only) ----------
(function loadEnv() {
  try {
    const txt = fs.readFileSync(path.join(__dirname, ".env"), "utf8");
    txt.split("\n").forEach((line) => {
      const m = /^\s*([\w.-]+)\s*=\s*(.*)\s*$/.exec(line);
      if (m && process.env[m[1]] === undefined) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    });
  } catch (e) {}
})();

// ---------- Admin credentials (single owner) ----------
// Secrets come from environment variables (.env locally, or your host's
// dashboard). There is NO hardcoded password. If ADMIN_PASS is empty,
// the admin panel is disabled until you set one.
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASS = process.env.ADMIN_PASS || "";
const WHATSAPP_NUMBER = process.env.WHATSAPP_NUMBER || "23290078385"; // +232 90 078385

// ---------- Storage backend ----------
// Accept whatever the host provides: DATABASE_URL, POSTGRES_URL, or the
// individual POSTGRES_* vars (Railway injects the POSTGRES_* form).
function resolveDatabaseUrl() {
  return (
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRIVATE_URL ||
    (process.env.POSTGRES_HOST
      ? `postgresql://${process.env.POSTGRES_USER || "postgres"}:${process.env.POSTGRES_PASSWORD || ""}@${process.env.POSTGRES_HOST}:${process.env.POSTGRES_PORT || 5432}/${process.env.POSTGRES_DATABASE || "railway"}`
      : null)
  );
}
const DATABASE_URL = resolveDatabaseUrl();
const USE_DB = !!DATABASE_URL;
let pool = null;
if (USE_DB) {
  const { Pool } = require("pg");
  pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
}

const DATA_DIR = path.join(__dirname, "data");
const PUBLIC_DIR = path.join(__dirname, "public");
const UPLOADS_DIR = path.join(PUBLIC_DIR, "uploads");
const DATA_FILE = path.join(DATA_DIR, "accounts.json");

const validTokens = new Set();

// ---------- Schema / seeding ----------
let readyPromise = null;
function ensureReady() {
  if (!USE_DB) {
    for (const d of [DATA_DIR, UPLOADS_DIR]) if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
    if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify(seedAccounts(), null, 2));
    return Promise.resolve();
  }
  if (readyPromise) return readyPromise;
  readyPromise = (async () => {
    await pool.query(`CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      level TEXT NOT NULL DEFAULT '',
      price NUMERIC NOT NULL DEFAULT 0,
      description TEXT NOT NULL DEFAULT '',
      image TEXT,
      featured BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
    const { rows } = await pool.query("SELECT count(*)::int AS c FROM accounts");
    if (rows[0].c === 0) {
      for (const a of seedAccounts()) {
        await pool.query(
          "INSERT INTO accounts (id,title,level,price,description,image,featured,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
          [a.id, a.title, a.level, a.price, a.description, a.image, a.featured, a.createdAt]
        );
      }
    }
  })().catch((e) => { readyPromise = null; throw e; });
  return readyPromise;
}

function seedAccounts() {
  const now = Date.now();
  return [
    {
      id: crypto.randomBytes(6).toString("hex"),
      title: "Elite Free Fire Account — Maxed Out",
      level: "Level 75 • 90% Booyah",
      price: 250,
      description: "Fully upgraded characters, rare bundles, 50k+ diamonds worth of skins. Instant handover.",
      image: "/assets/demo1.svg",
      featured: true,
      createdAt: new Date(now - 1000 * 60 * 60 * 5).toISOString(),
    },
    {
      id: crypto.randomBytes(6).toString("hex"),
      title: "Starter Pro Account — Ranked Gold",
      level: "Level 45 • Ranked Gold III",
      price: 90,
      description: "Great secondary account with good pets and emotes. Clean, no bans.",
      image: "/assets/demo2.svg",
      featured: false,
      createdAt: new Date(now - 1000 * 60 * 60 * 26).toISOString(),
    },
  ];
}

// ---------- Helpers ----------
function makeId() { return crypto.randomBytes(6).toString("hex"); }
function makeToken() { return crypto.randomBytes(24).toString("hex"); }
function isAuthed(req) {
  const a = req.headers["authorization"] || "";
  const t = a.startsWith("Bearer ") ? a.slice(7) : "";
  return validTokens.has(t);
}
function normalize(row) {
  return {
    id: row.id,
    title: row.title,
    level: row.level || "",
    price: Number(row.price),
    description: row.description || "",
    image: row.image || null,
    featured: !!row.featured,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : row.createdAt || new Date().toISOString(),
  };
}
function loadAccountsSync() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, "utf8")); } catch { return []; }
}
function saveDataUrl(dataUrl, id) {
  const m = /^data:(image\/[a-zA-Z+]+);base64,(.+)$/.exec(dataUrl);
  if (!m) return null;
  const ext = m[1].split("/")[1].replace("+", "") || "png";
  const buf = Buffer.from(m[2], "base64");
  if (buf.length > 6 * 1024 * 1024) throw new Error("Image too large (max 6MB)");
  const fname = `${id}.${ext}`;
  fs.writeFileSync(path.join(UPLOADS_DIR, fname), buf);
  return `/uploads/${fname}`;
}

// ---------- Storage ops ----------
async function loadAccounts() {
  if (!USE_DB) return loadAccountsSync();
  await ensureReady();
  const { rows } = await pool.query("SELECT * FROM accounts ORDER BY created_at DESC");
  return rows.map(normalize);
}
async function insertAccount(acc) {
  if (!USE_DB) {
    const l = loadAccountsSync();
    l.push(acc);
    fs.writeFileSync(DATA_FILE, JSON.stringify(l, null, 2));
    return;
  }
  await ensureReady();
  await pool.query(
    "INSERT INTO accounts (id,title,level,price,description,image,featured,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
    [acc.id, acc.title, acc.level, acc.price, acc.description, acc.image, acc.featured, acc.createdAt]
  );
}
async function updateAccount(id, patch) {
  if (!USE_DB) {
    const l = loadAccountsSync();
    const a = l.find((x) => x.id === id);
    if (!a) return null;
    Object.assign(a, patch);
    fs.writeFileSync(DATA_FILE, JSON.stringify(l, null, 2));
    return a;
  }
  await ensureReady();
  const { rows } = await pool.query("SELECT * FROM accounts WHERE id=$1", [id]);
  if (!rows[0]) return null;
  const merged = { ...normalize(rows[0]), ...patch };
  await pool.query(
    "UPDATE accounts SET title=$2,level=$3,price=$4,description=$5,image=$6,featured=$7 WHERE id=$1",
    [id, merged.title, merged.level, merged.price, merged.description, merged.image, merged.featured]
  );
  return merged;
}
async function deleteAccount(id) {
  if (!USE_DB) {
    let l = loadAccountsSync();
    const a = l.find((x) => x.id === id);
    if (a && a.image && a.image.startsWith("/uploads/")) {
      try { fs.unlinkSync(path.join(PUBLIC_DIR, a.image)); } catch (e) {}
    }
    l = l.filter((x) => x.id !== id);
    fs.writeFileSync(DATA_FILE, JSON.stringify(l, null, 2));
    return;
  }
  await ensureReady();
  await pool.query("DELETE FROM accounts WHERE id=$1", [id]);
}

// ---------- Middleware ----------
app.use(express.json({ limit: "8mb" }));
app.use(express.static(PUBLIC_DIR));

// ---------- API ----------
app.get("/api/config", (req, res) => res.json({ whatsapp: WHATSAPP_NUMBER, store: "Pyrex Store" }));

// Diagnostic: reports booleans + a redacted DB connection result (never secrets)
function redact(s) {
  return String(s)
    .replace(/:([^:@\/]+):([^@\s]+)@/g, ":****:****@")
    .replace(/password=[^&\s]*/gi, "password=****");
}
app.get("/api/env-status", async (req, res) => {
  let dbConnected = false, dbError = null;
  if (USE_DB) {
    try { await ensureReady(); await pool.query("SELECT 1"); dbConnected = true; }
    catch (e) { dbError = redact(e && e.message ? e.message : e); }
  }
  res.json({
    adminUserSet: !!process.env.ADMIN_USER,
    adminPassSet: !!process.env.ADMIN_PASS,
    storage: USE_DB ? "postgres" : "file",
    dbConnected,
    dbError,
  });
});

app.get("/api/accounts", async (req, res) => {
  try { res.json(await loadAccounts()); }
  catch (e) { res.status(500).json({ ok: false, error: "storage unavailable" }); }
});

app.post("/api/login", (req, res) => {
  const { username, password } = req.body || {};
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    const token = makeToken();
    validTokens.add(token);
    return res.json({ ok: true, token });
  }
  res.status(401).json({ ok: false, error: "Invalid username or password" });
});

app.post("/api/logout", (req, res) => {
  const a = req.headers["authorization"] || "";
  const t = a.startsWith("Bearer ") ? a.slice(7) : "";
  validTokens.delete(t);
  res.json({ ok: true });
});

app.post("/api/accounts", async (req, res) => {
  if (!isAuthed(req)) return res.status(401).json({ ok: false, error: "Unauthorized" });
  const { title, level, price, description, image, featured } = req.body || {};
  if (!title || price === undefined) return res.status(400).json({ ok: false, error: "Title and price are required" });
  const id = makeId();
  let imagePath = null;
  if (image) {
    try { imagePath = USE_DB ? image : saveDataUrl(image, id); }
    catch (e) { return res.status(400).json({ ok: false, error: e.message }); }
  }
  const acc = {
    id,
    title: String(title).trim(),
    level: level ? String(level).trim() : "",
    price: Number(price),
    description: description ? String(description).trim() : "",
    image: imagePath,
    featured: !!featured,
    createdAt: new Date().toISOString(),
  };
  try { await insertAccount(acc); res.json({ ok: true, account: acc }); }
  catch (e) { res.status(500).json({ ok: false, error: "storage unavailable" }); }
});

app.put("/api/accounts/:id", async (req, res) => {
  if (!isAuthed(req)) return res.status(401).json({ ok: false, error: "Unauthorized" });
  const { title, level, price, description, image, featured } = req.body || {};
  const patch = {};
  if (title !== undefined) patch.title = String(title).trim();
  if (level !== undefined) patch.level = String(level).trim();
  if (price !== undefined) patch.price = Number(price);
  if (description !== undefined) patch.description = String(description).trim();
  if (featured !== undefined) patch.featured = !!featured;
  if (image) {
    try { patch.image = USE_DB ? image : saveDataUrl(image, req.params.id); }
    catch (e) { return res.status(400).json({ ok: false, error: e.message }); }
  }
  try {
    const updated = await updateAccount(req.params.id, patch);
    if (!updated) return res.status(404).json({ ok: false, error: "Not found" });
    res.json({ ok: true, account: updated });
  } catch (e) { res.status(500).json({ ok: false, error: "storage unavailable" }); }
});

app.delete("/api/accounts/:id", async (req, res) => {
  if (!isAuthed(req)) return res.status(401).json({ ok: false, error: "Unauthorized" });
  try { await deleteAccount(req.params.id); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ ok: false, error: "storage unavailable" }); }
});

// ---------- Boot ----------
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Pyrex Store running on http://0.0.0.0:${PORT}`);
  console.log(`Storage: ${USE_DB ? "PostgreSQL" : "JSON file (local)"}`);
  console.log(`Admin user: ${ADMIN_USER} | admin locked: ${ADMIN_PASS ? "no" : "YES (set ADMIN_PASS)"}`);
});
