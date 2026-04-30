## Doel
De `sync-inbox` backendfunctie mag niet meer door de wall-clock timeout gekilled worden. De kernfix is: **één invocation verwerkt slechts een kleine UID-range**, rondt die invocation netjes af, schrijft voortgang weg, en laat de UI daarna expliciet de volgende batch starten.

## Wat ik ga aanpassen

### 1. `sync-inbox` ombouwen naar échte per-call batching
- De huidige range `lastUid + 1:*` verdwijnt.
- Ik bepaal eerst de servergrens van de mailbox (hoogste UID) en bereken daarna een harde batch-range:
  - `batchSize = 10`
  - `resumeFromUid = hoogste verwerkte UID + 1`
  - `endUid = min(serverHighestUid, resumeFromUid + batchSize - 1)`
  - fetch-range wordt dus bijvoorbeeld `2:11`
- Eén call haalt alleen die range op en stopt daarna altijd netjes.
- Na afloop schrijf ik weg:
  - `highest_uid_seen`
  - `next_uid`
  - `messages_fetched`
  - `batch_complete`
  - status `batch_done` zolang er nog meer UIDs over zijn
  - status `ok` alleen als de mailbox tot de huidige servergrens volledig is afgewerkt

### 2. Per-message timeout toevoegen
- Elke message-verwerking gaat door een timeout-wrapper:
  - `Promise.race([processMessage(...), timeoutAfter(15000)])`
- Als één bericht vastloopt:
  - log ik UID + oorzaak
  - sla ik dat bericht over
  - gaat de rest van de batch gewoon verder
- Daardoor kan één corrupte of zware mail niet langer de hele invocation blokkeren.

### 3. Heartbeat volledig onafhankelijk laten lopen
- De heartbeat blijft via `setInterval` lopen, los van de fetch-loop.
- Die schrijft periodiek `last_heartbeat_at`, `messages_fetched` en `highest_uid_seen` weg.
- In `finally` ruim ik die timer altijd op.
- Daardoor blijft de run zichtbaar als levend zolang de invocation echt bezig is.

### 4. Hard wall-clock guard inbouwen
- Ik gebruik `startedAt = Date.now()` en check vóór elk nieuw bericht:
  - als runtime > `150000ms`, dan stop ik gecontroleerd
- In dat geval finaliseer ik de run als:
  - `status = 'batch_done'`
  - `batch_complete = true`
  - `next_uid` naar het eerstvolgende nog niet verwerkte UID
- Zo eindigt de functie gecontroleerd vóór de platform-timeout.

### 5. Logging uitbreiden zodat we exact zien waar het hangt
- Ik voeg gerichte logs toe:
  - `[sync] start ...`
  - `[sync] fetch range=2:11 server_highest_uid=...`
  - `[sync] processing UID X subject="..."`
  - `[sync] processed UID X in Yms`
  - `[sync] skipped UID X reason=...`
  - `[sync] batch done next_uid=... status=... elapsed=...`
- Daarmee kunnen we in logs exact zien of het hangen in fetch, parse, upload of DB-write zit.

### 6. UI-resume-logica laten aansluiten op `batch_done`
- In `EmailAccountTab.tsx` pas ik de poller aan zodat een batch met status `batch_done` automatisch de volgende invocation start, tot alles klaar is of een veiligheidslimiet bereikt is.
- Ik vervang de huidige koppeling aan `partial + batch_complete=false`, omdat die niet meer klopt bij de nieuwe flow.
- De UI blijft dus batch voor batch doorlopen, maar elke backend-call blijft klein en veilig.

### 7. Sidebar-status niet meer laten liegen
- In `InboxSidebar.tsx` laat ik “Syncing…” alleen zien bij een écht actieve run met verse heartbeat.
- De laatste sync-status baseer ik op de nieuwste relevante logica, zodat `email_accounts.last_sync_status` niet langer een vals “ok” signaal geeft terwijl batches eigenlijk nog falen of hervatten.

## Bestanden die ik hiervoor aanpas
- `supabase/functions/sync-inbox/index.ts`
- `supabase/functions/_shared/process-message.ts` (alleen als ik een nette timeout-wrapper of lichtere logging daar wil centraliseren)
- `src/components/settings/EmailAccountTab.tsx`
- `src/components/inbox/InboxSidebar.tsx`

## Technische details
- Huidige bevestigde oorzaak: de code doet nog steeds `fetch(lastUid+1:*)`, dus één open-ended IMAP-call die doorloopt tot de functie tegen de wall-clock limit loopt.
- De bestaande heartbeat helpt alleen met zichtbaarheid; die lost de timeout niet op.
- De bestaande `MAX_BATCH_MESSAGES` begrenst nu pas **binnen** een open stream, maar voorkomt niet dat die ene fetch-call zelf problematisch blijft.
- De nieuwe aanpak maakt batching **deterministisch op UID-range-niveau**, niet alleen op “aantal berichten uit een open stream”.

## Validatie na implementatie
Ik test daarna met een echte sync-run en controleer in de backend-logs expliciet:
- start-log aanwezig
- fetch-range is begrensd (bv. `2:11`)
- per-message logs verschijnen
- batch eindigt gecontroleerd onder ~150s
- status wordt `batch_done` of `ok`, niet meer abrupt afgebroken door shutdown
- `next_uid` schuift correct op tussen opeenvolgende runs