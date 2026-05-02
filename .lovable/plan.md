## Context

Dit is een persoonlijke inbox, geen support-systeem. Toch draait de sync nu **elke minuut** (1.440 runs/dag), en doet bij elke run minstens een IMAP-connect + UID-search. Dat is overkill — voor persoonlijke mail is **elke 10–15 minuten** ruim voldoende, en dat scheelt direct ~90–95% in edge function invocaties + database writes.

Daarnaast laten de logs zien dat we ondertussen op **48 messages** zitten (was 6) en dat de incremental sync nu netjes "niets te doen" rapporteert in <1s. Het backfill-probleem is dus opgelost; nu mogen we afslanken.

## Wat ik ga doen

### 1. Cron-frequentie omlaag: van 1 min → 15 min

Pas de bestaande `pg_cron` job aan:

```text
huidige schedule: * * * * *        (elke minuut)
nieuwe schedule:  */15 * * * *     (elke 15 minuten)
```

**Impact:**
- Edge function invocaties: 1.440/dag → **96/dag** (-93%)
- Database heartbeat-writes: idem -93%
- IMAP-connecties naar Migadu: idem -93%
- Latency tot nieuwe mail zichtbaar: gemiddeld 7,5 min, max 15 min — prima voor persoonlijk gebruik

Als je later toch sneller wilt: één SQL-regel om naar `*/5` of `*/10` te gaan.

### 2. "Sync nu" knop voor wanneer je niet wilt wachten

Kleine UI-toevoeging in de inbox-sidebar (naast de bestaande "Historische backfill" knop): een **"Sync nu"** knop die handmatig `sync-inbox` triggert. Zo heb je het beste van twee werelden — goedkope achtergrond-sync + on-demand refresh als je iets verwacht.

### 3. Sync-inbox nóg goedkoper maken voor lege runs

Op dit moment opent elke run een IMAP-verbinding, ook als er niks nieuws is. Kleine optimalisatie in `sync-inbox/index.ts`:

- Skip de hele IMAP-flow als `next_uid > server_highest_uid` al bekend is uit de vorige run **én** die vorige run < 5 min geleden was.
- Effect: ~80% van de runs wordt een no-op van <100ms, vrijwel zonder DB-writes.

Dit is een kleine code-wijziging, geen herarchitectuur.

### 4. Sync_log retention

`sync_log` groeit nu met elke run. Korte cleanup-policy: bewaar laatste 7 dagen, ouder = wegknippen. Eénmalige migration + dagelijkse cron-job (1×/dag) die oude rows verwijdert.

## Wat ik NIET ga doen

- Geen overstap naar IMAP IDLE / push (zou wel sub-seconde latency geven, maar betekent een long-lived connectie en is voor persoonlijk gebruik onnodig complex).
- Geen wijziging aan `backfill-inbox` — die is on-demand en kost niks tenzij je 'm aanklikt.
- Geen wijziging aan AI-draft, categorisering of UI-rendering.

## Verwachte besparing

| Onderdeel | Voor | Na | Besparing |
|---|---|---|---|
| Edge invocaties/dag | ~1.440 | ~96 | -93% |
| DB writes/dag (heartbeat + sync_log) | ~7.000+ | ~300 | -95% |
| IMAP-connecties/dag | ~1.440 | ~20 (alleen bij echt nieuwe mail) | -98% |

Voor een persoonlijke mailbox zou dit ruim binnen het gratis Cloud-tegoed van $25/maand moeten blijven.

## Bestanden die wijzigen

- SQL migration: `cron.alter_job(1, schedule => '*/15 * * * *')` + nieuwe daily cleanup job voor `sync_log`
- `supabase/functions/sync-inbox/index.ts` — early-exit voor lege runs
- `src/components/inbox/InboxSidebar.tsx` — "Sync nu" knop ernaast

## Vraag voor jou

Ben je akkoord met **15 minuten** als sync-interval? Of wil je liever:
- **5 min** (sneller, nog steeds -80% besparing)
- **10 min** (middenweg, -90%)
- **30 min** (max besparing, -97%)
