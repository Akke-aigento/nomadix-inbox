## Wat is er aan de hand

In de DB zie ik nog altijd één `sync_log` row met `status='running'` van **30 april 06:34** met laatste heartbeat **06:37** — die is nooit afgesloten. Resultaat:
- De `ensureNoActiveSync` guard ziet een "actieve" run (heartbeat is wel ouder dan 60s, dus zou opgeruimd moeten worden), maar de UI poll-loop in `EmailAccountTab` zet `hasFreshActiveRun=false` correct. Het echte probleem is dat de sync edge function helemaal **geen logs meer produceert** voor recente runs — `supabase--edge_function_logs` retourneert leeg. Dat duidt erop dat de invoke vanuit de browser nooit echt land bij een nieuwe deploy, of dat hij meteen crasht voor de eerste `console.log`.
- Bovendien is er sinds 30 april niemand meer manueel op "Sync now" geklikt: er staat geen nieuwe run na die datum. Dus "die sync blijft hangen" gaat in de praktijk over die ene oude row én over het feit dat er geen automatisme is dat de sync trekt.

De bestaande batched/heartbeat-code in `supabase/functions/sync-inbox/index.ts` is op zich solide (UID-range max 10, wall-clock guard 150s, per-message timeout 15s, heartbeat elke 5s, stale-row reaper). Wat ontbreekt is: **automatisch periodiek triggeren** zodat we niet meer afhangen van de UI-knop.

## Doel

Eén sluitende oplossing:
1. Database opschonen + zombie-row killen.
2. **Automatische sync elke minuut** via `pg_cron` + `pg_net` die de `sync-inbox` edge function aanroept per actief account. Geen UI nodig, geen browser nodig, geen IMAP IDLE nodig.
3. UI blijft werken zoals nu (Sync now + auto-poll), maar wordt secundair.
4. Snelle health-check zodat we zien dát het cron-job effectief draait.

## Stappen

### 1. Edge function: service-role-trigger toelaten
Op dit moment vereist `sync-inbox` een user JWT (`userClient.auth.getUser()` → 401 zonder Bearer). pg_cron kan geen user-JWT presenteren. Aanpassing:
- Detecteer of de aanroep komt met de **service role key** (header `apikey` of `Authorization: Bearer <SERVICE_ROLE>`). Indien ja → sla user-check over en gebruik `account.owner_user_id` rechtstreeks.
- Indien neen → bestaande user-flow behouden.

### 2. Cron job toevoegen (via insert-tool, niet migration, want bevat project-specifieke URL+key)
- `pg_cron` en `pg_net` extensies enablen indien nodig.
- Eén SQL-functie `public.trigger_inbox_sync_for_all_accounts()` die voor elk account in `email_accounts` met een `vault_secret_id`:
  - Checkt of er al een run met heartbeat < 60s loopt → skip.
  - Anders: `net.http_post` naar `https://tvynbrtmohuciybwwzzl.functions.supabase.co/sync-inbox` met body `{"account_id": "..."}` en service-role headers.
- `cron.schedule('inbox-sync-every-minute', '* * * * *', $$select public.trigger_inbox_sync_for_all_accounts();$$)`.

### 3. Zombie cleanup nu meteen
Eenmalig SQL-update om alle huidige `running`-rows met heartbeat ouder dan 60s op `error` te zetten met `error_message='Cleanup voor live sync rollout'`. Dat haalt de UI-blokkade meteen weg.

### 4. UI cosmetisch
- `InboxSidebar` voetlabel toont al "Synced X ago"; dat zal nu vanzelf elke ~minuut updaten.
- Geen functionele wijzigingen aan `EmailAccountTab` of `sync-guard.ts` nodig — die blijven werken.

### 5. Verificatie
- Direct na deploy: `select cron.job_run_details ...` controleren dat er minuutruns staan.
- Edge function logs van `sync-inbox` opvragen → verwacht regelmatige `[sync] start`-regels.
- `select * from sync_log order by started_at desc limit 5;` → verwacht status `ok` of `batch_done` rotatie, geen `running`-rij ouder dan 2 minuten.
- Test door een mail te sturen naar `info@vanxcel.be` en binnen ±60s in de DB de nieuwe `messages`-rij te zien.

## Technische notities

- Edge-function timeout (~200s) blijft gerespecteerd: één run = max 10 mails, vroege break op 150s. Bij `batch_done` triggert de volgende cron-tick (binnen 60s) gewoon de volgende batch — geen client nodig.
- Service-role detectie: vergelijk `req.headers.get('apikey')` met `SUPABASE_SERVICE_ROLE_KEY` in env. Bij match → admin-pad.
- `pg_net.http_post` is fire-and-forget; we negeren de response in de cron functie.
- Alle SQL die de service role key bevat gaat via de **insert-tool** (niet migration), omdat dit projectspecifieke geheimen bevat die niet in een gedeelde migratie horen.

## Wat er NIET gebeurt
- Geen overstap naar Inngest of een queue-tabel — overkill voor 1 cron-tick per minuut.
- Geen IMAP IDLE / true push — vereist een persistent process dat we hier niet hebben.
- Geen wijziging aan de batched fetch-logica zelf; die werkt en is bewezen veilig binnen de timeout.
