/* Pyrex Store — storefront logic */
(function () {
  const WA = { number: "23290078385" };
  const $ = (s) => document.querySelector(s);

  function waLink(text) {
    return "https://wa.me/" + WA.number + "?text=" + encodeURIComponent(text);
  }

  async function init() {
    $("#yr").textContent = new Date().getFullYear();
    try {
      const cfg = await fetch("/api/config").then((r) => r.json());
      if (cfg.whatsapp) WA.number = cfg.whatsapp;
    } catch (e) {}

    const general = "Hello Pyrex Store! I'm interested in your Free Fire accounts. 👾";
    ["#navWa", "#heroWa", "#secWa", "#contactWa"].forEach((sel) => {
      const el = $(sel);
      if (el) el.href = waLink(general);
    });

    loadAccounts();
  }

  async function loadAccounts() {
    const wrap = $("#cards");
    try {
      const list = await fetch("/api/accounts").then((r) => r.json());
      if (!list.length) {
        wrap.innerHTML = '<div class="empty">No accounts listed yet. Check back soon or message us on WhatsApp! 🔥</div>';
        return;
      }
      wrap.innerHTML = "";
      list.forEach((a) => wrap.appendChild(card(a)));
    } catch (e) {
      wrap.innerHTML = '<div class="empty">Could not load accounts. Please refresh.</div>';
    }
  }

  function card(a) {
    const el = document.createElement("div");
    el.className = "card";
    const img = a.image
      ? a.image
      : "data:image/svg+xml;utf8," + encodeURIComponent(
          '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#0a0e1c"/><text x="50%" y="50%" fill="#93a0c2" font-family="Arial" font-size="18" text-anchor="middle" dominant-baseline="middle">PYREX STORE</text></svg>'
        );
    const msg =
      "Hello Pyrex Store! I want to buy this account: *" +
      a.title +
      "*" +
      (a.level ? " (" + a.level + ")" : "") +
      " — Price: " +
      formatPrice(a.price) +
      ". Is it still available? 🔥";
    el.innerHTML = `
      <div class="thumb">
        <span class="badge feat">${a.featured ? "FEATURED" : "FREE FIRE"}</span>
        ${a.level ? `<span class="badge lvl" style="left:auto;right:10px">${esc(a.level)}</span>` : ""}
        <img src="${img}" alt="${esc(a.title)}" loading="lazy" />
      </div>
      <div class="body">
        <div class="title">${esc(a.title)}</div>
        <div class="desc">${esc(a.description || "")}</div>
        <div class="row">
          <div class="price">${formatPrice(a.price)}</div>
          <a class="btn btn-pink" href="${waLink(msg)}" target="_blank" rel="noopener">Buy</a>
        </div>
      </div>`;
    return el;
  }

  function formatPrice(p) {
    const n = Number(p) || 0;
    return "Le " + n.toLocaleString();
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );
  }

  init();
})();
