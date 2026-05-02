## Analyse: waarom het blijft vastzitten op 6 mails

### Wat ik nu hard bevestigd heb
- De backend zelf is gezond; dit is geen algemeen backend-uitvalprobleem.
- In de database staan momenteel exact **6 threads** en **6 messages**.
- De hoogste opgeslagen IMAP UID is **6**.
- De mailbox meldt in de sync-logs een serverhoogste UID van **55**, dus er horen effectief veel meer mails te zijn.
- In de gebruikerspreview wordt de `threads`-request succesvol uitgevoerd en die geeft ook threaddata terug.
- Toch blijft de historische sync telkens opnieuw herstarten vanaf een heel lage UID in plaats van verder te gaan.

### Wat er technisch misloopt

#### 1) De historische sync geraakt niet voorbij de lage UIDs
De sync start telkens opnieuw met:
- `resume_from_uid=2`
- daarna `fetch range=2:6`
- daarna opnieuw een stall/timeout

Dat betekent: de sync bewaart zijn voortgang **niet betrouwbaar genoeg** wanneer de IMAP-stream blokkeert.

#### 2) De echte blokkering zit in de IMAP fetch-stream zelf
De logs tonen afwisselend:
- `processed UID 2 in 190ms`
- daarna `stream stalled after uid=2`
- later zelfs `stream stalled after uid=1`

Dat patroon wijst niet op “één slechte mail in processMessage”, maar op een dieper probleem in de manier waarop `ImapFlow.fetch(... source: true ...)` in deze runtime gebruikt wordt.

#### 3) Waarschijnlijke root cause: async-generator deadlock / cleanup hang
De huidige implementatie gebruikt een handmatige async iterator over `client.fetch(...)` en breekt daar vroeg uit bij timeout.

De combinatie van deze factoren is verdacht:
- `ImapFlow` + `source: true`
- Deno runtime
- vroegtijdig afbreken van de fetch-iterator
- daarna nog lock release / logout / finalisatie

Er is een bekend patroon waarbij deze fetch-generator in een deadlock kan komen of de command queue blokkeert, waardoor:
- `iter.next()` stopt met leveren
- cleanup niet netjes afrondt
- de run niet altijd correct finalizeert
- `next_uid` of `highest_uid_seen` niet bruikbaar wordt weggeschreven
- de volgende cron-run dus weer van bijna hetzelfde punt vertrekt

De huidige logs bevestigen dat gedrag: hij raakt wel soms tot UID 2, maar de progressie wordt niet duurzaam doorgezet.

#### 4) Daarom blijft de teller op 6 mails staan
Omdat de sync-runner structureel terugvalt naar lage UIDs, komt hij nooit in de buurt van UID 55. Daardoor blijft de mailbox lokaal steken op de eerste paar berichten.

### Belangrijk nevenpunt over de UI
Er is ook een tweede inconsistentie:
- de netwerk-snapshot van jouw preview toont dat de threaddata wel terugkomt
- maar visueel zie jij nog steeds niets bruikbaars

Dat betekent dat er naast de sync-blokkering waarschijnlijk ook een **client-side weergave-issue** meespeelt:
- ofwel een query/state-race in de inboxlijst
- ofwel een loading/empty-state bug
- ofwel een filter/renderprobleem waardoor geladen rows toch als leeg lijken

De screenshot uit mijn aparte browsersessie is daarvoor niet doorslaggevend, maar de request uit jouw preview is dat wel: jouw app **krijgt** threaddata terug.

## Conclusie
Dit is dus geen simpel “hij synct te traag”-probleem maar een combinatie van:

1. **Backend sync deadlock**
   - de historische IMAP backfill blijft vastlopen op de fetch-generator
   - voortgang wordt daardoor niet veilig en definitief opgeslagen
   - cron blijft opnieuw bijna van voren beginnen

2. **Frontend render/inbox state bug**
   - jouw preview ontvangt threaddata
   - maar de inbox toont alsnog geen bruikbare lijst

## Fixplan

### 1) Sync-engine robuust herschrijven rond de fetch-fase
Ik ga de huidige batch-fetch aanpak vervangen door een veiligere strategie die géén langdurige fetch-stream openhoudt.

Concreet:
- eerst expliciet de bestaande UIDs opvragen voor het batchbereik
- daarna berichten **één voor één** of in strikt gecontroleerde mini-stappen ophalen, zonder een kwetsbare langlevende iterator
- per UID de voortgang meteen veilig bijwerken
- bij failure altijd doorschuiven naar de volgende UID zodat de historiek nooit meer vastloopt op één streamprobleem

### 2) Progress persistence hard maken
Ik ga de sync zo aanpassen dat:
- `next_uid` altijd expliciet wordt gezet zodra een UID afgerond of definitief geskipt is
- een stall of cleanup-probleem nooit meer de volledige voortgang kan terugdraaien
- stale `running` runs niet opnieuw de waarheid overschrijven

### 3) Finalisatie en cleanup isoleren
Ik ga de afsluitfase zo herwerken dat:
- lock release / logout / iterator cleanup de progress-write niet meer kunnen blokkeren
- de sync-log altijd in een consistente eindstatus terechtkomt
- accountstatus niet misleidend op `ok` blijft staan terwijl de backfill feitelijk vastzit

### 4) Inbox-UI controleren op echte renderfout
Ik ga daarna de inbox-query en renderflow nalopen zodat zichtbaar wordt waarom jouw preview data terugkrijgt maar toch niets nuttigs toont.

Focuspunten:
- loading versus empty state
- eventuele tweede query die de lijst blokkeert
- filter state in de route
- render van `ThreadList` bij gedeeltelijk geladen data

### 5) Validatie na fix
Na de herwerking zal ik expliciet verifiëren dat:
- `max(imap_uid)` stijgt voorbij **6**
- `sync_log` niet meer terugvalt naar `resume_from_uid=2`
- meerdere batches effectief doorgaan richting de serverhistoriek
- de inboxlijst in de UI de bestaande threads ook echt zichtbaar toont

## Technische details
- **Hoofdverdachte:** `ImapFlow.fetch(... source: true ...)` in deze runtime met async-iterator/backpressure cleanup.
- **Gevolg:** fetch stall, blokkering bij cleanup/finalisatie, progress pointer blijft te laag.
- **Symptoom in data:** database blijft hangen op `messages.max(imap_uid)=6` terwijl server op `55` zit.
- **Symptoom in logs:** herhaald `resume_from_uid=2` en `stream stalled after uid=1/2`.
- **Tweede spoor:** inbox-frontend ontvangt data maar toont ze niet stabiel.

Als je dit plan implementeert, pak je dus niet cosmetisch de symptomen aan, maar de twee echte oorzaken die het nu al dagen blokkeren.