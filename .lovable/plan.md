

## Sync-knop blijft hangen — fix met background worker + polling

### Oorzaak
`sync-inbox` doet alles synchroon: IMAP openen → per mail parsen → brand-detection → DB writes → AI-trigger. Bij meer dan een handvol nieuwe mails overschrijdt dit de edge function timeout, waardoor de browser-fetch nooit een response krijgt en de knop in "Syncing…" blijft hangen.

`analyze-message` werkte wel omdat er maar 1 mail in de backlog stond.

### Fix in 3 lagen

**1. Edge function `sync-inbox` → background pattern**
- Bij request: maak `sync_log` rij aan met `status: "running"`, return direct **202** met `{ sync_log_id }`.
- Wikkel het echte werk (IMAP connect + fetch loop + processMessage) in `EdgeRuntime.waitUntil(...)` zodat de worker blijft leven na de response.
- Bij voltooien/falen: update dezelfde `sync_log` rij met `status: "ok" | "error" | "partial"`, `messages_fetched`, `highest_uid_seen`, `error_message`, en update ook `email_accounts.last_sync_*`.
- Bestaande gedrag (ownership check, JWT validatie, password fetch) blijft vóór de waitUntil.

**2. UI `EmailAccountTab.syncNow` → poll de log**
- Na invoke: krijg `sync_log_id` terug, blijf `setSyncing(true)`.
- Poll `sync_log` elke 2s op die `id` tot `status !== 'running'` (of timeout van ~5 min als safety).
- Bij eindstatus: toon toast met `messages_fetched` + eventuele `error_message`, herlaad het account voor verse `last_sync_*` velden, zet `setSyncing(false)`.
- Cleanup: clear de polling timer in een `useEffect` cleanup en als de component unmount.

**3. Klein robuustheids- + cosmetische fix**
- Maak `Stat` een `React.forwardRef` zodat de "Function components cannot be given refs" warning in console weggaat (komt van Radix die refs probeert door te geven aan kinderen van de Tabs/Card structuur).
- Als er bij page-load al een `sync_log` met `status='running'` is voor dit account: pak die meteen op en begin te pollen, zodat een refresh tijdens een sync de UI niet stuk laat lijken.

### Bestanden die wijzigen
- `supabase/functions/sync-inbox/index.ts` — herstructuur naar 202 + `EdgeRuntime.waitUntil(runSync(...))`. Geen logica-verlies, alleen volgorde.
- `src/components/settings/EmailAccountTab.tsx` — `syncNow` polling + `useEffect` voor running-sync resume + `Stat` als `forwardRef`.

### Acceptatie
- Klik op **Sync now** → knop toont "Syncing…" met spinning icoon, blijft draaien tot de echte sync klaar is (kan 30s-3min duren afhankelijk van mailbox), eindigt met toast en correcte `last_sync_at`.
- Page refresh tijdens een sync: knop pikt de lopende sync weer op via `sync_log`.
- Geen 500/timeout meer in network tab; de POST naar `sync-inbox` returnt binnen ~1s met 202.
- Console "forwardRef" warning verdwenen.

