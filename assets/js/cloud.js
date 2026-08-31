// Anbindung der öffentlichen Website an Supabase:
// - Seitenaufrufe protokollieren (für die Statistik im Admin-Dashboard)
// - Live-Präsenz melden ("wer ist gerade auf der Seite")
// - Verfügbarkeits-Badge & bearbeitbare Texte aus site_settings laden
// - Kontaktformular in die Datenbank schreiben (mit Mailto-Fallback)
(function () {
  "use strict";

  if (!window.supabase || !window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) return;
  var sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

  var pageTitle = document.title || location.pathname;
  var path = location.pathname;

  function randomId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "id-" + Math.random().toString(36).slice(2) + Date.now();
  }

  // --- Seitenaufruf protokollieren (fire and forget) ---
  sb.from("page_views")
    .insert({ page: pageTitle, path: path, referrer: document.referrer || null })
    .then(function () {});

  // --- Live-Präsenz: Browser tritt einem Realtime-Presence-Channel bei ---
  try {
    var visitorId = randomId();
    var channel = sb.channel("site-visitors", {
      config: { presence: { key: visitorId } },
    });
    channel.subscribe(function (status) {
      if (status === "SUBSCRIBED") {
        channel.track({ page: pageTitle, path: path, at: new Date().toISOString() });
      }
    });
  } catch (e) {
    /* Realtime nicht verfügbar - nicht kritisch */
  }

  // --- Verfügbarkeits-Badge ---
  var badge = document.querySelector("[data-availability-badge]");
  if (badge) {
    sb.from("site_settings")
      .select("value")
      .eq("key", "availability")
      .single()
      .then(function (res) {
        if (res.data && res.data.value) {
          var v = res.data.value;
          badge.textContent = v.available
            ? v.note || "Verfügbar für neue Projekte"
            : "Aktuell ausgebucht";
          badge.classList.toggle("is-available", !!v.available);
          badge.classList.toggle("is-unavailable", !v.available);
          badge.hidden = false;
        }
      });
  }

  // --- Bearbeitbare Texte aus dem Admin-Dashboard einsetzen ---
  document.querySelectorAll("[data-cms]").forEach(function (el) {
    var key = el.getAttribute("data-cms");
    sb.from("site_settings")
      .select("value")
      .eq("key", key)
      .single()
      .then(function (res) {
        if (res.data && res.data.value && res.data.value.text) {
          el.textContent = res.data.value.text;
        }
      });
  });

  // --- Kontaktformular: in Supabase schreiben, Mailto als Fallback ---
  var form = document.querySelector("form.contact-form");
  if (form) {
    form.addEventListener("submit", function (e) {
      var nameEl = form.querySelector('[name="Name"]');
      var emailEl = form.querySelector('[name="E-Mail"]');
      var msgEl = form.querySelector('[name="Nachricht"]');
      if (!nameEl || !emailEl || !msgEl) return; // Feldstruktur unerwartet -> normal absenden

      e.preventDefault();
      var note = form.querySelector(".form-note");
      var submitBtn = form.querySelector('button[type="submit"]');

      sb.from("contact_messages")
        .insert({ name: nameEl.value, email: emailEl.value, message: msgEl.value })
        .then(function (res) {
          if (!res.error) {
            form.reset();
            if (note) {
              note.textContent = "Danke! Deine Nachricht ist angekommen, ich melde mich zeitnah bei dir.";
            }
          } else {
            // Fallback: ganz normal per Mailto absenden, falls die Datenbank mal nicht erreichbar ist
            if (submitBtn) submitBtn.disabled = true;
            HTMLFormElement.prototype.submit.call(form);
          }
        })
        .catch(function () {
          if (submitBtn) submitBtn.disabled = true;
          HTMLFormElement.prototype.submit.call(form);
        });
    });
  }
})();
