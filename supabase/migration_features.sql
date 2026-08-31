-- Erweiterungen fürs Admin-Dashboard: Notizen, Devlog, Preview-Gate, E-Mail-Benachrichtigung.
-- Einmalig im Supabase SQL Editor ausführen (nach schema.sql + migration_security.sql).

-- 1) Notizen zu Kontaktanfragen
alter table contact_messages add column if not exists notes text default '';

-- 2) Devlog / Blog
create table if not exists posts (
  id bigint generated always as identity primary key,
  title text not null,
  slug text unique not null,
  content text not null,
  published boolean not null default false,
  created_at timestamptz not null default now()
);
alter table posts enable row level security;
create policy "anon can read published posts" on posts for select to anon using (published = true);
create policy "authenticated can manage posts" on posts for all to authenticated using (true) with check (true);

-- 3) Preview-Gate (Passwortschutz für unfertige Projektseiten)
-- Das Passwort selbst ist nie öffentlich abrufbar — nur eine ja/nein-Prüfung per Funktion.
create extension if not exists pgcrypto;

create table if not exists preview_gate (
  id int primary key default 1,
  password_hash text
);
insert into preview_gate (id, password_hash) values (1, null) on conflict (id) do nothing;
alter table preview_gate enable row level security;
create policy "authenticated can manage preview gate" on preview_gate for all to authenticated using (true) with check (true);

create or replace function set_preview_password(new_password text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update preview_gate set password_hash = crypt(new_password, gen_salt('bf')) where id = 1;
end;
$$;
grant execute on function set_preview_password(text) to authenticated;

create or replace function verify_preview_password(input text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  stored text;
begin
  select password_hash into stored from preview_gate where id = 1;
  if stored is null then
    return false;
  end if;
  return stored = crypt(input, stored);
end;
$$;
grant execute on function verify_preview_password(text) to anon, authenticated;

-- 4) E-Mail-Benachrichtigung bei neuer Kontaktanfrage (über Resend, kostenloser Free-Tier)
-- WICHTIG: Erst ausführen, nachdem du bei resend.com einen kostenlosen Account + API-Key
-- erstellt hast. Ersetze 'DEIN_RESEND_API_KEY' unten durch deinen echten Key, bevor du das
-- ausführst. Der Key wird verschlüsselt im Supabase Vault abgelegt, nie im Klartext gespeichert
-- und taucht nirgends im Website-Code oder auf GitHub auf.
create extension if not exists pg_net;

select vault.create_secret('DEIN_RESEND_API_KEY', 'resend_api_key');

create or replace function notify_new_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  api_key text;
begin
  select decrypted_secret into api_key from vault.decrypted_secrets where name = 'resend_api_key';
  if api_key is null or api_key = 'DEIN_RESEND_API_KEY' then
    return new;
  end if;

  perform net.http_post(
    url := 'https://api.resend.com/emails',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || api_key,
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object(
      'from', 'niki4407 Kontaktformular <onboarding@resend.dev>',
      'to', jsonb_build_array('niklas.scheiper@outlook.de'),
      'subject', 'Neue Kontaktanfrage von ' || new.name,
      'text', 'Von: ' || new.name || ' <' || new.email || '>' || E'\n\n' || new.message
    )
  );

  return new;
end;
$$;

drop trigger if exists notify_new_message_trigger on contact_messages;
create trigger notify_new_message_trigger
  after insert on contact_messages
  for each row execute function notify_new_message();
