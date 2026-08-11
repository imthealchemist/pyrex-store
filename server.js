/* ============================================================
   PYREX STORE — Backend server
   - Serves the public storefront + admin panel
   - Stores accounts in data/accounts.json
   - Single-owner admin login (the store owner)
   - Image uploads saved to public/uploads
   ============================================================ */

const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;

const DATA_DIR = path.join(__dirname, "data");
const PUBLIC_DIR = path.join(__dirname, "public");
const UPLOADS_DIR = path.join(PUBLIC_DIR, "uploads");
const DATA_FILE = path.join(DATA_DIR, "accounts.json");

// ---------- Admin credentials (single owner) ----------
// CHANGE THESE to your own before going live.
const ADMIN_USER = process.env.ADMIN_USER || "pyrex";
const ADMIN_PASS = process.env.ADMIN_PASS || "pyrex123";
const WHATSAPP_NUMBER = "23290078385"; // +232 90 078385 (no +, no spaces)

// In-memory set of valid session tokens (simple, single-owner auth)
const validTokens = new Set();

// ---------- Helpers ----------
function ensureDirs() {
  for (const d of [DATA_DIR, UPLOADS_DIR]) {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  }
}

function loadAccounts() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch (e) {
    return [];
  }
}

function saveAccounts(list) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(list, null, 2));
}

function makeId() {
  return crypto.randomBytes(6).toString("hex");
}

function makeToken() {
  return crypto.randomBytes(24).toString("hex");
}

function isAuthed(req) {
  const auth = req.headers["authorization"] || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  return validTokens.has(token);
}

// Decode a base64 data URL and write to uploads, return public path
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

// ---------- Middleware ----------
app.use(express.json({ limit: "8mb" }));
app.use(express.static(PUBLIC_DIR));

// ---------- API ----------
app.get("/api/config", (req, res) => {
  res.json({ whatsapp: WHATSAPP_NUMBER, store: "Pyrex Store" });
});

// Public: list accounts
app.get("/api/accounts", (req, res) => {
  const list = loadAccounts().sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  res.json(list);
});

// Admin login
app.post("/api/login", (req, res) => {
  const { username, password } = req.body || {};
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    const token = makeToken();
    validTokens.add(token);
    return res.json({ ok: true, token });
  }
  res.status(401).json({ ok: false, error: "Invalid username or password" });
});

// Admin logout
app.post("/api/logout", (req, res) => {
  const auth = req.headers["authorization"] || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  validTokens.delete(token);
  res.json({ ok: true });
});

// Admin: add account
app.post("/api/accounts", (req, res) => {
  if (!isAuthed(req)) return res.status(401).json({ ok: false, error: "Unauthorized" });
  const { title, level, price, description, image, featured } = req.body || {};
  if (!title || !price) return res.status(400).json({ ok: false, error: "Title and price are required" });
  const id = makeId();
  let imagePath = null;
  try {
    if (image) imagePath = saveDataUrl(image, id);
  } catch (e) {
    return res.status(400).json({ ok: false, error: e.message });
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
  const list = loadAccounts();
  list.push(acc);
  saveAccounts(list);
  res.json({ ok: true, account: acc });
});

// Admin: update account
app.put("/api/accounts/:id", (req, res) => {
  if (!isAuthed(req)) return res.status(401).json({ ok: false, error: "Unauthorized" });
  const list = loadAccounts();
  const acc = list.find((a) => a.id === req.params.id);
  if (!acc) return res.status(404).json({ ok: false, error: "Not found" });
  const { title, level, price, description, image, featured } = req.body || {};
  if (title !== undefined) acc.title = String(title).trim();
  if (level !== undefined) acc.level = String(level).trim();
  if (price !== undefined) acc.price = Number(price);
  if (description !== undefined) acc.description = String(description).trim();
  if (featured !== undefined) acc.featured = !!featured;
  if (image) {
    try { acc.image = saveDataUrl(image, acc.id); } catch (e) { return res.status(400).json({ ok: false, error: e.message }); }
  }
  saveAccounts(list);
  res.json({ ok: true, account: acc });
});

// Admin: delete account
app.delete("/api/accounts/:id", (req, res) => {
  if (!isAuthed(req)) return res.status(401).json({ ok: false, error: "Unauthorized" });
  let list = loadAccounts();
  const acc = list.find((a) => a.id === req.params.id);
  if (acc && acc.image) {
    const fp = path.join(PUBLIC_DIR, acc.image);
    try { if (fs.existsSync(fp)) fs.unlinkSync(fp); } catch (e) {}
  }
  list = list.filter((a) => a.id !== req.params.id);
  saveAccounts(list);
  res.json({ ok: true });
});

// ---------- Boot ----------
ensureDirs();
if (!fs.existsSync(DATA_FILE)) {
  // Seed with a couple of demo accounts (using SVG placeholders)
  seedDemo();
}

function seedDemo() {
  const demo = [
    {
      id: makeId(),
      title: "Elite Free Fire Account — Maxed Out",
      level: "Level 75 • 90% Booyah",
      price: 250,
      description: "Fully upgraded characters, rare bundles, 50k+ diamonds worth of skins. Instant handover.",
      image: "/assets/demo1.svg",
      featured: true,
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
    },
    {
      id: makeId(),
      title: "Starter Pro Account — Ranked Gold",
      level: "Level 45 • Ranked Gold III",
      price: 90,
      description: "Great secondary account with good pets and emotes. Clean, no bans.",
      image: "/assets/demo2.svg",
      featured: false,
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 26).toISOString(),
    },
  ];
  saveAccounts(demo);
}

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Pyrex Store running on http://0.0.0.0:${PORT}`);
  console.log(`Admin: /admin.html  (user: ${ADMIN_USER})`);
});
