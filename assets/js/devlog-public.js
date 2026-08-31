// Lädt veröffentlichte Devlog-Einträge aus Supabase und rendert sie.
(function () {
  "use strict";
  if (!window.supabase || !window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) return;
  var sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
  var list = document.getElementById("devlog-list");
  if (!list) return;

  function escapeHtml(str) {
    var div = document.createElement("div");
    div.textContent = str == null ? "" : String(str);
    return div.innerHTML;
  }

  sb.from("posts")
    .select("title, content, created_at")
    .eq("published", true)
    .order("created_at", { ascending: false })
    .then(function (res) {
      var rows = res.data || [];
      if (!rows.length) {
        list.innerHTML = '<p class="placeholder">Noch keine Einträge — schau bald wieder vorbei.</p>';
        return;
      }
      list.innerHTML = "";
      rows.forEach(function (p) {
        var article = document.createElement("article");
        article.className = "devlog-entry";
        var date = new Date(p.created_at).toLocaleDateString("de-DE", {
          day: "2-digit",
          month: "long",
          year: "numeric",
        });
        article.innerHTML =
          "<p class=\"devlog-date\">" +
          date +
          "</p><h2>" +
          escapeHtml(p.title) +
          "</h2><p class=\"devlog-body\">" +
          escapeHtml(p.content) +
          "</p>";
        list.appendChild(article);
      });
    });
})();
