/* Pyrex Store — admin panel logic */
(function () {
  const $ = (s) => document.querySelector(s);
  const TOKEN_KEY = "pyrex_token";
  let token = localStorage.getItem(TOKEN_KEY) || "";

  function authHeader() {
    return token ? { Authorization: "Bearer " + token } : {};
  }

  function show(view) {
    $("#loginView").style.display = view === "login" ? "block" : "none";
    $("#dashView").style.display = view === "dash" ? "block" : "none";
  }

  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(t._t);
    t._t = setTimeout(() => t.classList.remove("show"), 2600);
  }

  // ---------- Boot ----------
  async function boot() {
    if (!token) return show("login");
    try {
      const r = await fetch("/api/accounts", { headers: authHeader() });
      if (r.ok) {
        $("#who").textContent = "Owner";
        show("dash");
        await loadList();
      } else {
        token = ""; localStorage.removeItem(TOKEN_KEY); show("login");
      }
    } catch (e) {
      token = ""; localStorage.removeItem(TOKEN_KEY); show("login");
    }
  }

  // ---------- Login ----------
  $("#loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    $("#loginErr").textContent = "";
    const r = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: $("#user").value, password: $("#pass").value }),
    });
    const data = await r.json();
    if (data.ok) {
      token = data.token;
      localStorage.setItem(TOKEN_KEY, token);
      $("#pass").value = "";
      $("#who").textContent = "Owner";
      show("dash");
      await loadList();
    } else {
      $("#loginErr").textContent = data.error || "Login failed";
    }
  });

  // ---------- Logout ----------
  $("#logoutBtn").addEventListener("click", async () => {
    await fetch("/api/logout", { method: "POST", headers: authHeader() });
    token = ""; localStorage.removeItem(TOKEN_KEY);
    show("login");
  });

  // ---------- Image preview ----------
  let pendingImage = null; // data URL
  $("#img").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) { pendingImage = null; return; }
    const reader = new FileReader();
    reader.onload = () => {
      pendingImage = reader.result;
      $("#preview").innerHTML = '<img src="' + pendingImage + '" alt="preview" />';
    };
    reader.readAsDataURL(file);
  });

  // ---------- Submit (add / edit) ----------
  $("#accForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = $("#editId").value;
    const payload = {
      title: $("#title").value,
      level: $("#level").value,
      price: $("#price").value,
      description: $("#desc").value,
      featured: $("#featured").checked,
    };
    if (pendingImage) payload.image = pendingImage;

    const url = id ? "/api/accounts/" + id : "/api/accounts";
    const method = id ? "PUT" : "POST";
    const r = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json", ...authHeader() },
      body: JSON.stringify(payload),
    });
    const data = await r.json();
    if (data.ok) {
      toast(id ? "Account updated" : "Account published");
      resetForm();
      await loadList();
    } else {
      $("#formMsg").style.color = "var(--pink)";
      $("#formMsg").textContent = data.error || "Something went wrong";
    }
  });

  $("#cancelEdit").addEventListener("click", resetForm);

  function resetForm() {
    $("#accForm").reset();
    $("#editId").value = "";
    pendingImage = null;
    $("#preview").innerHTML = '<span style="color:var(--muted);font-size:13px">Image preview</span>';
    $("#formTitle").textContent = "Add Account";
    $("#submitBtn").textContent = "Publish Account";
    $("#cancelEdit").style.display = "none";
    $("#formMsg").textContent = "";
  }

  // ---------- List ----------
  async function loadList() {
    const wrap = $("#adminList");
    try {
      const list = await fetch("/api/accounts", { headers: authHeader() }).then((r) => r.json());
      if (!list.length) { wrap.innerHTML = '<div class="empty">No accounts yet. Add your first one!</div>'; return; }
      wrap.innerHTML = "";
      list.forEach((a) => wrap.appendChild(item(a)));
    } catch (e) {
      wrap.innerHTML = '<div class="empty">Failed to load list.</div>';
    }
  }

  function item(a) {
    const el = document.createElement("div");
    el.className = "admin-item";
    const img = a.image || "data:image/svg+xml;utf8," + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="90" height="64"><rect width="90" height="64" fill="#0a0e1c"/></svg>');
    el.innerHTML = `
      <img src="${img}" alt="" />
      <div class="meta">
        <div class="t">${esc(a.title)} ${a.featured ? '<span style="color:var(--green);font-size:11px">★ FEATURED</span>' : ""}</div>
        <div style="color:var(--muted);font-size:13px">${esc(a.level || "—")}</div>
        <div class="p">Le ${Number(a.price || 0).toLocaleString()}</div>
      </div>
      <div class="acts">
        <button class="btn btn-ghost" data-edit="${a.id}">Edit</button>
        <button class="btn btn-danger" data-del="${a.id}">Delete</button>
      </div>`;
    el.querySelector("[data-edit]").addEventListener("click", () => startEdit(a));
    el.querySelector("[data-del]").addEventListener("click", () => del(a));
    return el;
  }

  function startEdit(a) {
    $("#editId").value = a.id;
    $("#title").value = a.title;
    $("#level").value = a.level || "";
    $("#price").value = a.price;
    $("#desc").value = a.description || "";
    $("#featured").checked = !!a.featured;
    $("#preview").innerHTML = a.image ? '<img src="' + a.image + '" alt="preview" />' : '<span style="color:var(--muted);font-size:13px">No image</span>';
    pendingImage = null; // keep existing unless new one chosen
    $("#formTitle").textContent = "Edit Account";
    $("#submitBtn").textContent = "Save Changes";
    $("#cancelEdit").style.display = "inline-flex";
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function del(a) {
    if (!confirm('Delete "' + a.title + '"? This cannot be undone.')) return;
    const r = await fetch("/api/accounts/" + a.id, { method: "DELETE", headers: authHeader() });
    const data = await r.json();
    if (data.ok) { toast("Deleted"); await loadList(); }
    else toast("Delete failed");
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  boot();
})();
