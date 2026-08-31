(function () {
  "use strict";

  if (!window.supabase || !window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) {
    document.getElementById("login-error").textContent =
      "Supabase konnte nicht geladen werden. Prüf deine Internetverbindung und lade neu.";
    return;
  }
  var sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

  var loginView = document.getElementById("login-view");
  var mfaEnrollView = document.getElementById("mfa-enroll-view");
  var mfaChallengeView = document.getElementById("mfa-challenge-view");
  var dashView = document.getElementById("dashboard-view");
  var whoami = document.getElementById("whoami");

  function showOnly(view) {
    [loginView, mfaEnrollView, mfaChallengeView, dashView].forEach(function (v) {
      v.hidden = v !== view;
    });
  }

  // ---------- Auth (Passwort + Pflicht-2FA) ----------
  var mfaState = { factorId: null, challengeId: null };

  document.getElementById("login-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var email = document.getElementById("login-email").value.trim();
    var password = document.getElementById("login-password").value;
    var errEl = document.getElementById("login-error");
    errEl.textContent = "";
    sb.auth.signInWithPassword({ email: email, password: password }).then(function (res) {
      if (res.error) {
        errEl.textContent = "Login fehlgeschlagen: " + res.error.message;
        return;
      }
      routeAfterAuthChange();
    });
  });

  document.getElementById("logout-btn").addEventListener("click", function () {
    sb.auth.signOut();
  });

  function routeAfterAuthChange() {
    sb.auth.getSession().then(function (res) {
      var session = res.data.session;
      if (!session) {
        showOnly(loginView);
        stopPresence();
        return;
      }
      sb.auth.mfa.getAuthenticatorAssuranceLevel().then(function (aal) {
        var current = aal.data.currentLevel;
        var next = aal.data.nextLevel;

        if (next === "aal2" && current !== "aal2") {
          // Faktor ist eingerichtet, Code für diesen Login noch nötig
          sb.auth.mfa.listFactors().then(function (fres) {
            var totp = ((fres.data && fres.data.totp) || [])[0];
            if (!totp) {
              enterDashboard(session);
              return;
            }
            sb.auth.mfa.challenge({ factorId: totp.id }).then(function (cres) {
              if (cres.error) {
                showOnly(loginView);
                document.getElementById("login-error").textContent = cres.error.message;
                return;
              }
              mfaState.factorId = totp.id;
              mfaState.challengeId = cres.data.id;
              showOnly(mfaChallengeView);
            });
          });
        } else if (current === "aal1" && next === "aal1") {
          // Noch kein 2FA-Faktor eingerichtet -> Ersteinrichtung erzwingen
          sb.auth.mfa.enroll({ factorType: "totp" }).then(function (eres) {
            if (eres.error) {
              showOnly(loginView);
              document.getElementById("login-error").textContent = eres.error.message;
              return;
            }
            mfaState.factorId = eres.data.id;
            document.getElementById("mfa-qr").src = eres.data.totp.qr_code;
            document.getElementById("mfa-secret").value = eres.data.totp.secret;
            showOnly(mfaEnrollView);
          });
        } else {
          enterDashboard(session);
        }
      });
    });
  }

  document.getElementById("mfa-challenge-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var code = document.getElementById("mfa-challenge-code").value.trim();
    var errEl = document.getElementById("mfa-challenge-error");
    errEl.textContent = "";
    sb.auth.mfa
      .verify({ factorId: mfaState.factorId, challengeId: mfaState.challengeId, code: code })
      .then(function (res) {
        if (res.error) {
          errEl.textContent = "Code falsch oder abgelaufen: " + res.error.message;
          return;
        }
        sb.auth.getSession().then(function (r) {
          enterDashboard(r.data.session);
        });
      });
  });

  document.getElementById("mfa-enroll-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var code = document.getElementById("mfa-enroll-code").value.trim();
    var errEl = document.getElementById("mfa-enroll-error");
    errEl.textContent = "";
    sb.auth.mfa.challenge({ factorId: mfaState.factorId }).then(function (cres) {
      if (cres.error) {
        errEl.textContent = cres.error.message;
        return;
      }
      sb.auth.mfa
        .verify({ factorId: mfaState.factorId, challengeId: cres.data.id, code: code })
        .then(function (vres) {
          if (vres.error) {
            errEl.textContent = "Code falsch: " + vres.error.message;
            return;
          }
          sb.auth.getSession().then(function (r) {
            enterDashboard(r.data.session);
          });
        });
    });
  });

  function enterDashboard(session) {
    showOnly(dashView);
    whoami.textContent = session.user.email;
    loadAll();
    startPresence();
  }

  sb.auth.onAuthStateChange(function (event) {
    if (event === "SIGNED_OUT") {
      showOnly(loginView);
      stopPresence();
    }
  });

  routeAfterAuthChange();

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
    loadDevlog();
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
        renderVisitsChart(rows);
      });
  }
  document.getElementById("stats-refresh").addEventListener("click", loadStats);

  function renderVisitsChart(rows) {
    var days = 14;
    var counts = [];
    var now = new Date();
    for (var i = days - 1; i >= 0; i--) {
      var d = new Date(now);
      d.setDate(d.getDate() - i);
      counts.push({ key: d.toISOString().slice(0, 10), count: 0 });
    }
    var byKey = {};
    counts.forEach(function (c) {
      byKey[c.key] = c;
    });
    rows.forEach(function (r) {
      var key = (r.created_at || "").slice(0, 10);
      if (byKey[key]) byKey[key].count++;
    });
    var max = counts.reduce(function (m, c) {
      return Math.max(m, c.count);
    }, 1);

    var wrap = document.getElementById("visits-chart");
    wrap.innerHTML = "";
    counts.forEach(function (c) {
      var col = document.createElement("div");
      col.className = "chart-bar-col";
      var bar = document.createElement("div");
      bar.className = "chart-bar";
      bar.style.height = Math.max(2, Math.round((c.count / max) * 100)) + "%";
      bar.title = c.key + ": " + c.count + " Aufrufe";
      var label = document.createElement("span");
      label.className = "chart-bar-label";
      label.textContent = c.key.slice(5).replace("-", ".");
      col.appendChild(bar);
      col.appendChild(label);
      wrap.appendChild(col);
    });
  }

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
          tbody.innerHTML = '<tr><td colspan="6" class="empty-note">Noch keine Nachrichten.</td></tr>';
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
            "</span></td><td style='max-width:280px;white-space:pre-wrap;'>" +
            escapeHtml(m.message) +
            "</td><td></td>" +
            '<td><span class="pill status-' +
            m.status +
            '">' +
            escapeHtml(m.status) +
            "</span></td><td></td>";

          var notesTd = tr.children[3];
          var notesWrap = document.createElement("div");
          var notesArea = document.createElement("textarea");
          notesArea.className = "notes-input";
          notesArea.value = m.notes || "";
          notesArea.placeholder = "z. B. schon geantwortet am…";
          var notesSave = document.createElement("button");
          notesSave.className = "btn-small";
          notesSave.style.marginTop = "0.35rem";
          notesSave.textContent = "Notiz speichern";
          notesSave.addEventListener("click", function () {
            sb.from("contact_messages").update({ notes: notesArea.value }).eq("id", m.id).then(function () {});
          });
          notesWrap.appendChild(notesArea);
          notesWrap.appendChild(notesSave);
          notesTd.appendChild(notesWrap);

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

  // ---------- Preview-Passwort ----------
  document.getElementById("save-preview-password").addEventListener("click", function () {
    var pw = document.getElementById("preview-password").value;
    var msgEl = document.getElementById("save-preview-password-msg");
    if (!pw || pw.length < 4) {
      msgEl.textContent = "Bitte mindestens 4 Zeichen eingeben.";
      return;
    }
    sb.rpc("set_preview_password", { new_password: pw }).then(function (res) {
      msgEl.textContent = res.error ? "Fehler: " + res.error.message : "Passwort gesetzt ✓";
      if (!res.error) document.getElementById("preview-password").value = "";
      setTimeout(function () {
        msgEl.textContent = "";
      }, 3000);
    });
  });

  // ---------- QR-Code-Generator ----------
  document.getElementById("qr-generate").addEventListener("click", function () {
    var text = document.getElementById("qr-input").value.trim();
    var out = document.getElementById("qr-output");
    out.innerHTML = "";
    if (!text || typeof window.qrcode !== "function") return;
    try {
      var qr = window.qrcode(0, "M");
      qr.addData(text);
      qr.make();
      out.innerHTML = qr.createSvgTag(6, 0);
    } catch (e) {
      out.textContent = "Konnte QR-Code nicht erzeugen (Text evtl. zu lang).";
    }
  });

  // ---------- Devlog ----------
  function slugify(title) {
    return title
      .toLowerCase()
      .replace(/[äöüß]/g, function (c) {
        return { ä: "ae", ö: "oe", ü: "ue", ß: "ss" }[c];
      })
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 80);
  }

  document.getElementById("devlog-save").addEventListener("click", function () {
    var id = document.getElementById("devlog-edit-id").value;
    var title = document.getElementById("devlog-title").value.trim();
    var content = document.getElementById("devlog-content").value.trim();
    var published = document.getElementById("devlog-published").checked;
    var msgEl = document.getElementById("devlog-form-msg");
    if (!title || !content) {
      msgEl.textContent = "Titel und Text sind Pflicht.";
      return;
    }

    var payload = { title: title, content: content, published: published };
    var query;
    if (id) {
      query = sb.from("posts").update(payload).eq("id", id);
    } else {
      payload.slug = slugify(title) + "-" + Date.now().toString(36);
      query = sb.from("posts").insert(payload);
    }

    query.then(function (res) {
      if (res.error) {
        msgEl.textContent = "Fehler: " + res.error.message;
        return;
      }
      msgEl.textContent = "Gespeichert ✓";
      resetDevlogForm();
      loadDevlog();
      setTimeout(function () {
        msgEl.textContent = "";
      }, 2500);
    });
  });

  document.getElementById("devlog-cancel-edit").addEventListener("click", resetDevlogForm);

  function resetDevlogForm() {
    document.getElementById("devlog-edit-id").value = "";
    document.getElementById("devlog-title").value = "";
    document.getElementById("devlog-content").value = "";
    document.getElementById("devlog-published").checked = false;
    document.getElementById("devlog-form-title").textContent = "Neuer Eintrag";
    document.getElementById("devlog-cancel-edit").hidden = true;
  }

  function loadDevlog() {
    sb.from("posts")
      .select("*")
      .order("created_at", { ascending: false })
      .then(function (res) {
        var tbody = document.getElementById("devlog-table");
        var rows = res.data || [];
        tbody.innerHTML = "";
        if (!rows.length) {
          tbody.innerHTML = '<tr><td colspan="4" class="empty-note">Noch keine Einträge.</td></tr>';
          return;
        }
        rows.forEach(function (p) {
          var tr = document.createElement("tr");
          var date = new Date(p.created_at).toLocaleDateString("de-DE");
          tr.innerHTML =
            "<td>" +
            escapeHtml(p.title) +
            '</td><td><span class="pill' +
            (p.published ? " status-new" : "") +
            '">' +
            (p.published ? "veröffentlicht" : "Entwurf") +
            "</span></td><td>" +
            date +
            "</td><td></td>";
          var actionsTd = tr.lastElementChild;
          var wrap = document.createElement("div");
          wrap.className = "msg-actions";

          var editBtn = document.createElement("button");
          editBtn.textContent = "Bearbeiten";
          editBtn.addEventListener("click", function () {
            document.getElementById("devlog-edit-id").value = p.id;
            document.getElementById("devlog-title").value = p.title;
            document.getElementById("devlog-content").value = p.content;
            document.getElementById("devlog-published").checked = p.published;
            document.getElementById("devlog-form-title").textContent = "Eintrag bearbeiten";
            document.getElementById("devlog-cancel-edit").hidden = false;
            document.getElementById("panel-devlog").scrollIntoView({ behavior: "smooth" });
          });
          wrap.appendChild(editBtn);

          var delBtn = document.createElement("button");
          delBtn.className = "danger";
          delBtn.textContent = "Löschen";
          delBtn.addEventListener("click", function () {
            if (!confirm("Diesen Devlog-Eintrag wirklich löschen?")) return;
            sb.from("posts").delete().eq("id", p.id).then(loadDevlog);
          });
          wrap.appendChild(delBtn);

          actionsTd.appendChild(wrap);
          tbody.appendChild(tr);
        });
      });
  }
  document.getElementById("devlog-refresh").addEventListener("click", loadDevlog);

  function escapeHtml(str) {
    var div = document.createElement("div");
    div.textContent = str == null ? "" : String(str);
    return div.innerHTML;
  }
})();
