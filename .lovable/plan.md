
Doel: de sync mag nooit meer “blijven hangen”. Ik pak dit aan op backend + UI, omdat het huidige probleem in beide lagen zit.

1. Sync-architectuur robuust maken
- De huidige `sync-inbox` functie vertrouwt op achtergrondwerk via `EdgeRuntime.waitUntil(...)`.
- De signalen wijzen erop dat die achtergrond-run niet betrouwbaar afrondt: er staat nu een recente `sync_log` rij op `running` zonder `finished_at`, terwijl de functielogs alleen boot/shutdown tonen.
- Ik vervang dit door een expliciete, gecontroleerde batch-sync:
  - `sync-inbox` verwerkt een beperkte batch berichten per request binnen een veilige tijdslimiet.
  - De functie schrijft tussentijds voortgang weg in `sync_log` (bijv. verwerkt aantal, hoogste UID, heartbeat/progress timestamp).
  - De functie returned duidelijk of de sync klaar is of dat de volgende batch nog moet draaien.
- Resultaat: geen “fire-and-forget” meer, dus geen zombie-runs die in `running` blijven hangen.

2. Sync-log model uitbreiden voor voortgang en herstel
- Ik voeg progress-velden toe aan `sync_log`, zoals:
  - `processed_count` / `messages_fetched`
  - `highest_uid_seen`
  - `last_heartbeat_at`
  - optioneel `cursor_uid` of `next_uid`
- Daarmee kan de app exact zien:
  - sync draait nog echt
  - sync is vastgelopen
  - sync is klaar / failed / partial
- Ik hou de bestaande eigenaar/RLS-aanpak aan.

3. Stale run detectie correct maken
- De huidige reaper sluit alleen oude `running` rijen op basis van `started_at`.
- Ik maak dit slimmer met `last_heartbeat_at`:
  - alleen stale als heartbeat te oud is
  - niet meteen foutief afsluiten bij lange syncs die nog wel werken
- Ook zorg ik dat elke exit-path gegarandeerd finaliseert:
  - succes
  - geen nieuwe mail
  - IMAP-fout
  - parser/storage-fout
  - onverwachte crash

4. UI in Settings correct laten poll-en en hervatten
- `EmailAccountTab.tsx` blijft nu hangen omdat het alleen wacht op `status !== "running"`.
- Ik pas dit aan zodat de tab:
  - progress toont tijdens sync
  - opnieuw de functie aanroept als de backend aangeeft dat een volgende batch nodig is
  - stale runs als fout behandelt
  - bij mount een bestaande half-afgemaakte sync veilig hervat of als stale markeert
- Timeoutgedrag wordt gekoppeld aan echte progress/heartbeat in plaats van alleen verstreken tijd.

5. Sidebar-sync ook betrouwbaar maken
- `InboxSidebar.tsx` zet nu alleen een lokale `syncing` state rond de invoke-call; dat zegt niets over echte backend-status.
- Ik maak de sidebar-status afhankelijk van echte sync-status uit `sync_log` / `email_accounts`, zodat:
  - “Syncing…” alleen zichtbaar is als er echt een actieve run is
  - de status vanzelf terugvalt naar “Synced … ago” of foutmelding
  - mobiel/tablet en desktop hetzelfde gedrag hebben

6. Foutzichtbaarheid verbeteren
- Ik voeg betere logging toe in `sync-inbox`:
  - start account
  - gekozen UID-range
  - batch size
  - per-fout compacte melding
  - final status
- Ik beperk foutteksten in `sync_log.error_message` netjes, maar maak ze bruikbaar genoeg om direct te zien of het IMAP, parsing, storage of AI-trigger is.

7. Message-processing defensiever maken
- In `process-message.ts` blijft sync nu afhankelijk van parsing, brand-detectie, storage en AI-dispatch.
- Ik maak de flow toleranter zodat niet-kritieke fouten de sync niet blokkeren:
  - AI-dispatch blijft non-blocking
  - attachment/storage fouten loggen maar stoppen batch niet
  - duidelijke scheiding tussen “bericht mislukt” en “hele sync mislukt”

8. Afronding en validatie
- Testscenario’s die ik daarna controleer:
  - sync met 0 nieuwe berichten
  - sync met 1 nieuw bericht
  - sync met meerdere nieuwe berichten
  - IMAP credentials fout
  - handmatig stale `running` record hervatten
  - sidebar + settings tonen beide correcte status
- Verwacht eindresultaat:
  - geen permanente `running` status meer
  - sync eindigt altijd in `ok`, `partial` of `error`
  - gebruiker ziet voortgang en duidelijke foutmelding

Technische details
- Bestanden die aangepast worden:
  - `supabase/functions/sync-inbox/index.ts`
  - `supabase/functions/_shared/process-message.ts`
  - `src/components/settings/EmailAccountTab.tsx`
  - `src/components/inbox/InboxSidebar.tsx`
  - mogelijk `src/hooks/useThreadsQuery.ts` of een kleine status-hook als ik sync-state centraliseer
- Database:
  - nieuwe migration voor extra `sync_log` progress/heartbeat kolommen
- Belangrijkste ontwerpkeuze:
  - weg van onbetrouwbare background `waitUntil` sync
  - naar expliciete batch-sync met progress en hervatbaarheid
