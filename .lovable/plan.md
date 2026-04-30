# Voorkomen van parallelle sync-runs

## Probleem
De UI kan op dit moment een tweede `sync-inbox` invoke starten terwijl er nog een actieve `sync_log` row met status `running` bestaat. Resultaat: dubbele IMAP-connecties naar Migadu, zombie sync_log rows en kapotte progress.

Sync wordt vanuit twee plekken getriggerd:
- `src/components/settings/EmailAccountTab.tsx` → `syncNow()` en `continueBatch()` (auto-resume bij `batch_done`)
- `src/components/inbox/InboxSidebar.tsx` → footer "Sync now" knop loopt over alle accounts

## Aanpak

### 1. Gedeelde guard-helper
Nieuwe utility (bv. `src/lib/sync-guard.ts`) met één functie:

```
ensureNoActiveSync(accountId): Promise<{ ok: true } | { ok: false; reason: string }>
```

Logica:
- Query `sync_log` op `email_account_id = accountId`, `status = 'running'`, nieuwste eerst, limit 1.
- Geen row → `ok: true`.
- Row met `last_heartbeat_at` jonger dan 60s → `ok: false` met reden "Sync al bezig".
- Row met stale heartbeat (≥ 60s of `null`) → markeer die row als `status='error'`, `finished_at=now()`, `error_message='Stale run cleared on retry'`, dan `ok: true`.

Centraliseren voorkomt drift tussen Settings en Sidebar.

### 2. EmailAccountTab.tsx aanpassingen
- In `syncNow()`: roep `ensureNoActiveSync(account.id)` aan vóór `supabase.functions.invoke('sync-inbox', …)`. Bij `ok:false` → `toast.error(reason)` en return zonder state-mutatie.
- In `continueBatch()` (auto-resume bij `batch_done`): zelfde guard vóór de invoke. Voorkomt dubbelvuren als de gebruiker tegelijk handmatig klikt.
- "Sync now" button: `disabled` baseren op `syncing || activeRunFresh`, waarbij `activeRunFresh` uit een lichte poll/subscribe op `sync_log` komt (we hebben al de poller; voeg een aparte state `hasFreshActiveRun` toe die `true` is zolang de laatste running-row een verse heartbeat heeft, ook als deze tab níet de invoker was).

### 3. InboxSidebar.tsx aanpassingen
- De footer-knop loopt nu over alle accounts in een `for`-loop. Per iteratie eerst `ensureNoActiveSync(a.id)` en account skippen (met toast bij 1 account, stille skip bij meerdere) als er een verse run is.
- Bestaande `activeRunning` state blijft de visuele disable-trigger; geen wijziging nodig daar.

### 4. Edge case: race tussen guard-query en invoke
Tussen de guard-check en de `invoke` zou theoretisch een tweede client kunnen starten. Voor nu accepteren we dit (UI-only fix zoals gevraagd). Als het in de praktijk nog voorkomt, kunnen we later een DB-side advisory lock of een `unique partial index` op `sync_log(email_account_id) where status='running'` toevoegen — buiten scope nu.

## Bestanden
- nieuw: `src/lib/sync-guard.ts`
- gewijzigd: `src/components/settings/EmailAccountTab.tsx`
- gewijzigd: `src/components/inbox/InboxSidebar.tsx`

## Validatie
- Klik "Sync now" → start. Klik direct nogmaals → toast "Sync al bezig".
- Forceer stale row (heartbeat > 60s oud) → klik "Sync now" → oude row krijgt `status='error'`, nieuwe sync start.
- Trigger sync vanuit Settings, klik tijdens run op Sidebar-footer-knop → geblokkeerd.
- Tijdens auto-resume na `batch_done` handmatig klikken → tweede invoke wordt door guard geweigerd.
