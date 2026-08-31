-- Datenbank-Setup für das Admin-Dashboard von niki4407.de
-- Diese Datei einmalig im Supabase-Projekt unter "SQL Editor" -> "New query"
-- einfügen und ausführen (Run). Danach ist das Dashboard funktionsfähig.

-- 1) Seitenaufrufe (für die Statistik im Dashboard)
create table if not exists page_views (
  id bigint generated always as identity primary key,
  page text,
  path text,
  referrer text,
  created_at timestamptz not null default now()
);

alter table page_views enable row level security;

create policy "anon can insert page views"
  on page_views for insert
  to anon
  with check (true);

create policy "authenticated can read page views"
  on page_views for select
  to authenticated
  using (true);

-- 2) Kontaktanfragen
create table if not exists contact_messages (
  id bigint generated always as identity primary key,
  name text not null,
  email text not null,
  message text not null,
  status text not null default 'new',
  tag text,
  created_at timestamptz not null default now()
);

alter table contact_messages enable row level security;

create policy "anon can insert messages"
  on contact_messages for insert
  to anon
  with check (true);

create policy "authenticated can manage messages"
  on contact_messages for all
  to authenticated
  using (true)
  with check (true);

-- 3) Website-Einstellungen (Verfügbarkeits-Badge + bearbeitbare Texte)
create table if not exists site_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table site_settings enable row level security;

create policy "anyone can read settings"
  on site_settings for select
  to anon, authenticated
  using (true);

create policy "authenticated can manage settings"
  on site_settings for all
  to authenticated
  using (true)
  with check (true);

-- Startwerte setzen (nur beim ersten Mal nötig)
insert into site_settings (key, value) values
  ('availability', '{"available": true, "note": "Aktuell verfügbar für neue Projekte"}'),
  ('hero_lead', '{"text": "Ich baue Webseiten, Bots, KI-Lösungen und FiveM-Projekte. Hier findest du meine Projekte, meine Freelance-Angebote und wie du mich erreichst."}'),
  ('about_p1', '{"text": "Ich bin Niklas und programmiere, seit ich 12 bin — aus einem Hobby ist mittlerweile mein Weg in die Anwendungsentwicklung geworden. Aktuell bin ich auf der Suche nach dem Einstieg (Ausbildung oder Job) im Bereich Anwendungsentwicklung und KI — deutschlandweit offen. Parallel dazu baue ich mir mit ersten eigenen und Kundenprojekten meine Selbstständigkeit als Freelancer auf."}')
on conflict (key) do nothing;
