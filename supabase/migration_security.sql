-- Nachträgliche Sicherheits-Härtung für das Kontaktformular.
-- Einmalig im Supabase SQL Editor ausführen (nach schema.sql).

-- Honeypot-Spalte: für Menschen unsichtbares Feld im Formular.
-- Füllt ein Bot es aus, wird der Insert stillschweigend verworfen.
alter table contact_messages add column if not exists website text default '';

-- Länge/Grundvalidierung (einmalig ausführen; beim erneuten Ausführen ggf.
-- vorher die bestehenden Constraints per ALTER TABLE ... DROP CONSTRAINT löschen)
alter table contact_messages
  add constraint contact_messages_name_len check (char_length(name) between 1 and 200),
  add constraint contact_messages_email_len check (char_length(email) between 3 and 320),
  add constraint contact_messages_message_len check (char_length(message) between 1 and 5000);

-- Trigger: Honeypot-Check + einfaches Rate-Limit (max. 3 Nachrichten
-- derselben E-Mail-Adresse pro 60 Sekunden) direkt in der Datenbank,
-- damit das nicht durch Umgehen des Frontends ausgehebelt werden kann.
create or replace function contact_messages_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recent_count int;
begin
  if new.website is not null and new.website <> '' then
    -- Honeypot ausgefüllt -> vermutlich Bot, Insert leise verwerfen
    return null;
  end if;

  select count(*) into recent_count
  from contact_messages
  where email = new.email
    and created_at > now() - interval '60 seconds';

  if recent_count >= 3 then
    return null;
  end if;

  return new;
end;
$$;

drop trigger if exists contact_messages_guard_trigger on contact_messages;
create trigger contact_messages_guard_trigger
  before insert on contact_messages
  for each row execute function contact_messages_guard();
