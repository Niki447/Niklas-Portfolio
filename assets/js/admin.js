(function () {
  "use strict";

  if (!window.supabase || !window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) {
    document.getElementById("login-error").textContent =
      "Supabase konnte nicht geladen werden. Prüf deine Internetverbindung und lade neu.";
    return;
  }
  var sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

  var loginView = document.getElementById("login-view");
  var dashView = document.getElementById("dashboard-view");
  var whoami = document.getElementById("whoami");

  // ---------- Auth ----------
  document.getElementById("login-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var email = document.getElementById("login-email").value.trim();
    var password = document.getElementById("login-password").value;
    var errEl = document.getElementById("login-error");
    errEl.textContent = "";
    sb.auth.signInWithPassword({ email: email, password: password }).then(function (res) {
      if (res.error) {
        errEl.textContent = "Login fehlgeschlagen: " + res.error.message;
      }
    });
  });

  document.getElementById("logout-btn").addEventListener("click", function () {
    sb.auth.signOut();
  });

  sb.auth.onAuthStateChange(function (event, session) {
    if (session) {
      loginView.hidden = true;
      dashView.hidden = false;
      whoami.textContent = session.user.email;
      loadAll();
      startPresence();
    } else {
      loginView.hidden = false;
      dashView.hidden = true;
      stopPresence();
    }
  });

  sb.auth.getSession().then(function (res) {
    if (!res.data.session) {
      loginView.hidden = false;
      dashView.hidden = true;
    }
  });

  // ---------- Tabs ----------
  document.querySelectorAll(".tab-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      document.querySelectorAll(".tab-btn").forEach(function (b) {
        b.classList.remove("active");
      });
      document.querySelectorAll(".tab-panel").forEach(function (p) {
        p.classList.remove("active");
      });
      btn.classList.add("active");
      document.getElementById("panel-" + btn.dataset.tab).classList.add("active");
    });
  });

  function loadAll() {
    loadStats();
    loadMessages();
    loadSettings();
  }

  // ---------- Live-Besucher (Realtime Presence) ----------
  var presenceChannel = null;
  function startPresence() {
    if (presenceChannel) return;
    presenceChannel = sb.channel("site-visitors", { config: { presence: { key: "admin-" + Date.now() } } });
    presenceChannel.on("presence", { event: "sync" }, renderVisitors);
    presenceChannel.subscribe();
  }
  function stopPresence() {
    if (presenceChannel) {
      sb.removeChannel(presenceChannel);
      presenceChannel = null;
    }
  }
  function renderVisitors() {
    var state = presenceChannel.presenceState();
    var list = document.getElementById("visitor-list");
    var count = document.getElementById("visitor-count");
    var entries = [];
    Object.keys(state).forEach(function (key) {
      state[key].forEach(function (meta) {
        if (meta.page) entries.push(meta);
      });
    });
    count.textContent = entries.length;
    list.innerHTML = "";
    if (!entries.length) {
      list.innerHTML = '<li class="empty-note">Gerade niemand außer dir online.</li>';
      return;
    }
    entries.forEach(function (e) {
      var li = document.createElement("li");
      var time = e.at ? new Date(e.at).toLocaleTimeString("de-DE") : "";
      li.innerHTML =
        '<span class="dot-live"></span><span>' +
        escapeHtml(e.page || e.path || "?") +
        '</span><span style="color:var(--text-dim);margin-left:auto;font-family:var(--font-mono);font-size:0.75rem;">seit ' +
        time +
        "</span>";
      list.appendChild(li);
    });
  }
  document.getElementById("visitor-refresh").addEventListener("click", renderVisitors);

  // ---------- Statistiken ----------
  function loadStats() {
    sb.from("page_views")
      .select("page, path, referrer, created_at")
      .order("created_at", { ascending: false })
      .limit(1000)
      .then(function (res) {
        var rows = res.data || [];
        document.getElementById("stat-total").textContent = rows.length;

        var since24h = Date.now() - 24 * 60 * 60 * 1000;
        var count24h = rows.filter(function (r) {
          return new Date(r.created_at).getTime() > since24h;
        }).length;
        document.getElementById("stat-24h").textContent = count24h;

        var byPage = {};
        var byRef = {};
        rows.forEach(function (r) {
          var p = r.page || r.path || "?";
          byPage[p] = (byPage[p] || 0) + 1;
          var ref = r.referrer ? hostnameOf(r.referrer) : "Direkt / unbekannt";
          byRef[ref] = (byRef[ref] || 0) + 1;
        });

        document.getElementById("stat-pages").textContent = Object.keys(byPage).length;

        renderCountTable("pages-table", byPage, "Seite", "Aufrufe");
        renderCountTable("referrer-table", byRef, "Quelle", "Besuche");
      });
  }
  document.getElementById("stats-refresh").addEventListener("click", loadStats);

  function renderCountTable(bodyId, obj, keyLabel, valLabel) {
    var tbody = document.getElementById(bodyId);
    var entries = Object.keys(obj).map(function (k) {
      return [k, obj[k]];
    });
    entries.sort(function (a, b) {
      return b[1] - a[1];
    });
    tbody.innerHTML = "";
    if (!entries.length) {
      tbody.innerHTML = '<tr><td colspan="2" class="empty-note">Noch keine Daten.</td></tr>';
      return;
    }
    entries.forEach(function (e) {
      var tr = document.createElement("tr");
      tr.innerHTML = "<td>" + escapeHtml(e[0]) + "</td><td>" + e[1] + "</td>";
      tbody.appendChild(tr);
    });
  }

  function hostnameOf(url) {
    try {
      return new URL(url).hostname;
    } catch (e) {
      return url;
    }
  }

  // ---------- Nachrichten ----------
  function loadMessages() {
    sb.from("contact_messages")
      .select("*")
      .order("created_at", { ascending: false })
      .then(function (res) {
        var tbody = document.getElementById("messages-table");
        var rows = res.data || [];
        document.getElementById("stat-messages").textContent = rows.filter(function (m) {
          return m.status === "new";
        }).length;
        tbody.innerHTML = "";
        if (!rows.length) {
          tbody.innerHTML = '<tr><td colspan="5" class="empty-note">Noch keine Nachrichten.</td></tr>';
          return;
        }
        rows.forEach(function (m) {
          var tr = document.createElement("tr");
          var date = new Date(m.created_at).toLocaleString("de-DE");
          tr.innerHTML =
            "<td>" +
            date +
            "</td><td>" +
            escapeHtml(m.name) +
            "<br><span style='color:var(--text-dim);font-size:0.78rem;'>" +
            escapeHtml(m.email) +
            "</span></td><td style='max-width:320px;white-space:pre-wrap;'>" +
            escapeHtml(m.message) +
            '</td><td><span class="pill status-' +
            m.status +
            '">' +
            escapeHtml(m.status) +
            "</span></td><td></td>";

          var actionsTd = tr.lastElementChild;
          var wrap = document.createElement("div");
          wrap.className = "msg-actions";

          var select = document.createElement("select");
          ["", "Freelance-Anfrage", "Nur Frage", "Spam"].forEach(function (opt) {
            var o = document.createElement("option");
            o.value = opt;
            o.textContent = opt || "Tag wählen…";
            if (m.tag === opt) o.selected = true;
            select.appendChild(o);
          });
          select.addEventListener("change", function () {
            sb.from("contact_messages").update({ tag: select.value }).eq("id", m.id).then(function () {});
          });
          wrap.appendChild(select);

          if (m.status !== "read") {
            var readBtn = document.createElement("button");
            readBtn.textContent = "Als gelesen markieren";
            readBtn.addEventListener("click", function () {
              sb.from("contact_messages")
                .update({ status: "read" })
                .eq("id", m.id)
                .then(loadMessages);
            });
            wrap.appendChild(readBtn);
          }

          var delBtn = document.createElement("button");
          delBtn.className = "danger";
          delBtn.textContent = "Löschen";
          delBtn.addEventListener("click", function () {
            if (!confirm("Diese Nachricht wirklich löschen?")) return;
            sb.from("contact_messages").delete().eq("id", m.id).then(loadMessages);
          });
          wrap.appendChild(delBtn);

          actionsTd.appendChild(wrap);
          tbody.appendChild(tr);
        });
      });
  }
  document.getElementById("messages-refresh").addEventListener("click", loadMessages);

  // ---------- Einstellungen ----------
  function loadSettings() {
    sb.from("site_settings")
      .select("*")
      .then(function (res) {
        var byKey = {};
        (res.data || []).forEach(function (row) {
          byKey[row.key] = row.value;
        });

        var av = byKey.availability || { available: true, note: "" };
        document.getElementById("avail-toggle").checked = !!av.available;
        document.getElementById("avail-note").value = av.note || "";

        document.getElementById("hero-lead-text").value = (byKey.hero_lead && byKey.hero_lead.text) || "";
        document.getElementById("about-p1-text").value = (byKey.about_p1 && byKey.about_p1.text) || "";
      });
  }

  document.getElementById("save-availability").addEventListener("click", function () {
    var value = {
      available: document.getElementById("avail-toggle").checked,
      note: document.getElementById("avail-note").value.trim(),
    };
    upsertSetting("availability", value, "save-availability-msg");
  });

  document.getElementById("save-hero-lead").addEventListener("click", function () {
    upsertSetting(
      "hero_lead",
      { text: document.getElementById("hero-lead-text").value.trim() },
      "save-hero-lead-msg"
    );
  });

  document.getElementById("save-about-p1").addEventListener("click", function () {
    upsertSetting(
      "about_p1",
      { text: document.getElementById("about-p1-text").value.trim() },
      "save-about-p1-msg"
    );
  });

  function upsertSetting(key, value, msgElId) {
    var msgEl = document.getElementById(msgElId);
    sb.from("site_settings")
      .upsert({ key: key, value: value, updated_at: new Date().toISOString() }, { onConflict: "key" })
      .then(function (res) {
        if (msgEl) {
          msgEl.textContent = res.error ? "Fehler: " + res.error.message : "Gespeichert ✓";
          setTimeout(function () {
            msgEl.textContent = "";
          }, 2500);
        }
      });
  }

  function escapeHtml(str) {
    var div = document.createElement("div");
    div.textContent = str == null ? "" : String(str);
    return div.innerHTML;
  }
})();
