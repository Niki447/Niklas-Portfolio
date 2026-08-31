// Sperrt eine Seite hinter einem Passwort, das im Admin-Dashboard gesetzt wird.
// Einbindung: <div id="preview-gate-overlay">…</div> + <div id="preview-content" hidden>…</div>
// Das echte Passwort verlässt die Datenbank nie — nur eine ja/nein-Prüfung per RPC.
(function () {
  "use strict";
  if (!window.supabase || !window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) return;
  var sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

  var STORAGE_KEY = "preview-unlocked";
  var overlay = document.getElementById("preview-gate-overlay");
  var content = document.getElementById("preview-content");
  if (!overlay || !content) return;

  function unlock() {
    overlay.hidden = true;
    content.hidden = false;
  }

  try {
    if (sessionStorage.getItem(STORAGE_KEY) === "1") {
      unlock();
      return;
    }
  } catch (e) {}

  var form = document.getElementById("preview-gate-form");
  var input = document.getElementById("preview-gate-input");
  var errEl = document.getElementById("preview-gate-error");
  if (!form || !input) return;

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    errEl.textContent = "";
    sb.rpc("verify_preview_password", { input: input.value }).then(function (res) {
      if (res.error || res.data !== true) {
        errEl.textContent = "Falsches Passwort.";
        return;
      }
      try {
        sessionStorage.setItem(STORAGE_KEY, "1");
      } catch (e) {}
      unlock();
    });
  });
})();
