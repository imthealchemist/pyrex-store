# PYREX STORE — Free Fire Accounts & Gaming Tech

A self-hosted website + admin panel for selling Free Fire accounts.
Built with Node.js (Express). No database required — data is stored in `data/accounts.json`.

## What you get
- **Public store** (`/`) — neon game/tech storefront showing your accounts with photos,
  level/rank, price, and a **"Buy on WhatsApp"** button that messages you directly.
- **Admin panel** (`/admin.html`) — password-protected (owner only). Log in to:
  - Add accounts (photo + title + level + price + description + featured toggle)
  - Edit or delete accounts
  - See a live list of everything you've posted
- **WhatsApp orders** → `+232 90 078385` (configured in `server.js`)

## Run it
```bash
cd pyrex-store
npm install
npm start
```
Open `http://localhost:3000` for the store and `http://localhost:3000/admin.html` for the admin.

## Admin login (secrets are NOT in the code)
The admin username/password are read from **environment variables**, never hardcoded:

- Locally: copy `.env.example` to `.env` and fill in your values (`.env` is gitignored).
- On your host (Render/Railway/Vercel): set `ADMIN_USER` and `ADMIN_PASS` in the dashboard.

If `ADMIN_PASS` is not set, the admin panel is disabled until you set one — so the
public repo contains no secrets. Example:
```bash
ADMIN_USER=pyrex ADMIN_PASS=yourStrongPassword node server.js
```

## Change the WhatsApp number
In `server.js`, edit:
```js
const WHATSAPP_NUMBER = "23290078385";
```

## Deploy (so customers can reach it)
This is a normal Node app. Put it on any Node host (Render, Railway, Koyeb, Fly.io, a VPS…).
Make sure `data/` and `public/uploads/` are writable. Customers visit your domain; you keep
the `/admin.html` link private.

## Notes
- Accounts and uploaded photos persist on the server (shared with all visitors).
- One owner login by design — exactly as requested ("login only accepted by one person").
- Uploaded images are capped at 6MB each.
