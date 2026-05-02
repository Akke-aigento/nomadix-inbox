## Probleem in één blik

Logs en `sync_log` laten een glashelder patroon zien:

```
fetch range=2:11 server_highest_uid=55 existing_uids=10
fetchOne uid=2 failed in 15501ms: Timeout
```

- Server heeft 55 mails, wij hebben er 6 (UID 1–6).
- Elke run hangt op de eerste `fetchOne` (vaak UID 2 of 3) en wordt na 15s gekilled.
- Resultaat: oneindige loop, geen progressie, en — zoals je terecht aangaf — onnodig veel Cloud-credits.

De échte root cause is niet UID 3 of 5: het is **`ImapFlow.fetchOne` met `source: true` op deze Migadu-server in de Deno edge-runtime hangt structureel**. Of het nu range-fetch of single-fetch is, de async iterator/stream blijft dicht. Elke "fix" tot nu toe was symptoombestrijding rond dezelfde rotte API.

## Strategie: stop met ImapFlow voor de body-fetch

In plaats van weer een variant te proberen op dezelfde library, splitsen we het werk en gebruiken we voor het zware werk een aanpak die in Deno wél betrouwbaar is.

### 1. One-shot historische backfill (handmatig getriggerd)

Een nieuwe edge function `backfill-inbox` die in **één lange run** (tot ~150s) de hele mailbox-historie ophaalt:

- Geen cron, geen heartbeat-paranoia, gewoon één keer draaien per account.
- Gebruikt **directe IMAP via Deno's `Deno.connect` + TLS** met handgeschreven `UID FETCH` commando's i.p.v. ImapFlow's stream-API. Dit klinkt zwaarder maar is in praktijk 50 regels code en heeft géén async-iterator-deadlock.
- Schrijft messages in batches van 10 naar de database, persisteert progress per batch.
- UI-knop "Historische mails ophalen" op de Inbox-pagina (alleen zichtbaar zolang `highest_uid_seen < server_highest_uid`).

Voordeel qua credits: **één run van ~60s i.p.v. 1440 runs/dag die niets doen**.

### 2. Incremental sync wordt simpel én zuinig

Zodra de backfill klaar is (`next_uid = 56`):

- Cron gaat van **elke minuut → elke 5 minuten** (configurabel).
- `sync-inbox` haalt alleen UIDs `>= next_uid` op. Dat zijn meestal 0 berichten → connect, search, logout, klaar in <2s.
- Poison-UID-bescherming: na 2 mislukte pogingen op dezelfde UID wordt die overgeslagen en gemarkeerd in `sync_log.error_message`, nooit meer een eindeloze loop.

### 3. Cleanup van zombie-state

- SQL: alle `running` en oude `error` rows in `sync_log` afsluiten.
- `next_uid` voor het account resetten naar 7 (we hebben 1–6 al), zodat de backfill weet waar te beginnen.

### 4. UI-fix voor de zichtbaarheid

Network-logs eerder bevestigden dat de 6 threads wél binnenkomen in de browser maar niet renderen. Korte audit van `ThreadList` + `useThreadsQuery`:

- Check of `is_archived = false` filter niet per ongeluk alles wegfiltert.
- Check of de panel-resize state in `localStorage` de lijst niet op width 0 zet.
- Fix wat we vinden, met visuele verificatie via de preview.

## Wat dit oplost

| Pijnpunt | Hoe |
|---|---|
| Vastlopen op UID 2/3 | Directe IMAP-socket i.p.v. ImapFlow-stream voor body-fetch |
| 6 mails na 5 dagen | One-shot backfill pakt alle 55 in één run |
| Hoge Cloud-kosten | Cron 5× minder vaak + lege runs zijn goedkoop |
| Onzichtbare threads in UI | Gerichte audit + fix in ThreadList/query |
| Eindeloze retry-loops | Poison-UID skip na N pogingen |

## Technisch detail (voor later)

**Direct IMAP fetch (Deno):**
```text
1. Deno.connectTls({ hostname, port: 993 })
2. Read greeting
3. Send: a1 LOGIN user pass\r\n
4. Send: a2 SELECT INBOX\r\n
5. Send: a3 UID FETCH 7:* (UID FLAGS BODY.PEEK[])\r\n
6. Stream-parse response per literal {N}, write to DB after each message
7. Send: a4 LOGOUT\r\n
```

Geen async-iterator, geen ImapFlow-state, deterministisch.

**Bestanden:**
- nieuw: `supabase/functions/backfill-inbox/index.ts`
- aanpassen: `supabase/functions/sync-inbox/index.ts` (vereenvoudigen tot incremental-only + poison-skip)
- aanpassen: `src/pages/InboxPage.tsx` (knop "Backfill starten" + progress)
- audit + fix: `src/components/inbox/ThreadList.tsx`, `src/hooks/useThreadsQuery.ts`
- migration: cleanup `sync_log`, reset `next_uid`
- cron-frequentie: van `* * * * *` naar `*/5 * * * *` (na geslaagde backfill)

## Wat dit NIET doet

- Geen queue-tabel + worker-pattern (overkill voor 1 mailbox; one-shot lange run is voldoende binnen edge timeout van 150s).
- Geen IMAP IDLE / push (later eventueel, als je sub-minuut latency wilt).
- Geen wijziging aan AI-draft, categorisering of overige inbox-features.

## Volgorde van uitvoeren

1. Cleanup `sync_log` + reset `next_uid` → 7
2. Bouw `backfill-inbox` met directe IMAP
3. UI-knop + verificatie dat de 49 ontbrekende mails binnenkomen
4. Vereenvoudig `sync-inbox` naar incremental + poison-skip
5. Verlaag cron-frequentie
6. Audit + fix ThreadList rendering
