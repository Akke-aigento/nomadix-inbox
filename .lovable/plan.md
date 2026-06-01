# Fix: Reply faalt met "Edge Function returned a non-2xx status code"

## Diagnose

De `send-email` edge function crasht met **`CPU Time exceeded`** (bevestigd in de Supabase function logs, tijdstip matcht exact met jouw poging).

**Root cause:** de `denomailer@1.6.0` library doet veel synchrone CPU-werk (MIME-bouw, quoted-printable/base64-encoding van de volledige HTML body inclusief alle geciteerde history, TLS handshake). Bij een reply op een thread met meerdere quote-niveaus tikt dit over de CPU-quota van Supabase Edge Functions heen.

Dit is hetzelfde patroon dat we al hebben opgelost voor IMAP (`ImapFlow` → `imap-direct.ts`).

## Aanpak

Vervang `denomailer` door een lichte, directe SMTP-client (`smtp-direct.ts`) die via `Deno.connectTls` praat met `smtp.migadu.com:465`. Geen zware abstracties, alleen wat we nodig hebben:

- TLS connect → `EHLO` → `AUTH LOGIN` → `MAIL FROM` → `RCPT TO` (per recipient) → `DATA` → message bytes → `.` → `QUIT`
- Zelf de MIME-envelope bouwen: headers + `multipart/alternative` (text + html) zodat clients beide hebben
- Body encoderen als `quoted-printable` (compact, geen base64-blowup)
- Subject/from-name correct MIME-encoderen (UTF-8 `=?utf-8?B?...?=`) voor non-ASCII

## Wijzigingen

1. **Nieuw bestand**: `supabase/functions/_shared/smtp-direct.ts`
   - `sendSmtpMail({ host, port, username, password, from, to, cc, bcc, subject, html, text, headers })`
   - Gebruikt `Deno.connectTls` (poort 465) of `Deno.connect` + STARTTLS (poort 587)
   - Streamt de DATA-fase regel voor regel (dot-stuffing) zodat grote bodies geen pieklast geven

2. **Edit**: `supabase/functions/send-email/index.ts`
   - Vervang `import { SMTPClient } from denomailer` door de nieuwe helper
   - Verwijder de huidige `smtp.send(...)` + `smtp.close()` blokken
   - Houd alle business-logica (threading headers, `messages` insert, draft cleanup, thread stats) ongewijzigd

3. **Geen frontend-wijzigingen** nodig — de error wordt automatisch opgelost zodra de functie weer 200 teruggeeft.

## Verificatie

- Deploy `send-email`
- Trigger een reply vanuit jouw UI (dezelfde thread)
- Check edge function logs op `2xx` + bevestig dat de mail aankomt
- Check `messages` tabel: nieuwe outbound row met `is_outbound = true`

## Technische details

- Migadu accepteert SMTP op `465` (implicit TLS) en `587` (STARTTLS). We respecteren wat in `email_accounts.smtp_port` staat.
- Auth: `AUTH LOGIN` met base64-encoded username/password (zoals denomailer ook deed).
- We blijven binnen Deno's ingebouwde TLS-stack — geen externe deps, geen npm-bundling.

## Wat dit NIET aanraakt

- Geen wijzigingen aan `sync-inbox`, `backfill-inbox` of cron-config
- Geen RLS-/DB-migraties nodig
- Geen secrets nodig — gebruikt al bestaande `get_email_account_password` RPC