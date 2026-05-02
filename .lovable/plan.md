# Live sync — uitgevoerd

## Wat draait er nu
- `pg_cron` job `inbox-sync-every-minute` triggert elke minuut `public.trigger_inbox_sync_for_all_accounts()`.
- Die functie roept de `sync-inbox` edge function aan per account dat een vault password heeft, en slaat accounts over die al een verse heartbeat-run hebben.
- Edge function `sync-inbox` accepteert nu naast user-JWTs ook:
  - service-role tokens (legacy + nieuwe signing keys, gedetecteerd via JWT-payload `role=service_role`)
  - een `x-cron-secret` header die matcht met `SYNC_CRON_SECRET`
- Bij timeout/hang: heartbeat verloopt na 60s, de volgende cron-tick reaped de stale row en start een verse batch (UID-resume vanaf laatste highest_uid_seen).

## Bewezen werkend
- Manuele trigger → DB row `running` met fetched messages, edge logs `[sync] start` + `[sync] processed UID X`.
- `net._http_response` retourneert geen 401 meer.

## Volgende inhoudelijke verbeterpunten (NIET nodig voor live sync)
- `processMessage` lijkt op UID > 2 soms langer te duren dan de heartbeat-window — de architectuur vangt dit nu op via reaper + resume, maar idealiter wordt processMessage robuuster (kortere per-attachment timeout, betere error logs).
