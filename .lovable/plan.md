## Plan om dit definitief te fixen

### Wat ik al bevestigd heb
- Er staan **wel degelijk mails in de backend**: momenteel 6 berichten en 6 threads.
- De inbox-requests in de app geven die threads ook correct terug.
- Het probleem dat jij nu ziet als “er verschijnt niets” is dus **niet puur een data-ophaalprobleem**.
- De automatische sync is ook **nog niet volledig klaar met historiek**: de mailbox meldt een hoogste UID van 55, terwijl er lokaal maar tot UID 6 verwerkt is.
- De huidige sync-runner loopt nog vast: de backend-calls eindigen opnieuw in **504 timeouts**, dus de historische backfill stopt voortijdig.

### Waarschijnlijk 2 aparte fouten
1. **Frontend/layout-fout**
   - De threadlijst wordt in jouw sessie visueel weggedrukt of te smal gemaakt door de resizable layout.
   - Daardoor lijkt de inbox leeg, terwijl de lijstdata wel binnenkomt.

2. **Backend sync-fout**
   - De live sync draait elke minuut, maar de historische import geraakt niet verder door een hang/timeout tijdens latere UIDs.
   - Daardoor blijft de mailbox maar gedeeltelijk gevuld.

## Wat ik ga laten implementeren

### 1) De inboxlijst altijd zichtbaar maken
- De resizable panel-layout robuust maken zodat de threadlijst niet meer praktisch tot nul breedte kan instorten.
- Een veilige minimum-breedte of resetgedrag toevoegen voor de lijstkolom.
- Controleren dat de lege-state alleen nog verschijnt wanneer er echt geen threads zijn, niet wanneer de layout fout staat.

### 2) De historische sync echt afwerken
- De `sync-inbox` flow verder ontleden rond het punt waar hij na UID 2/6 blijft hangen.
- De IMAP fetch en message-verwerking strikter begrenzen zodat één trage of corrupte mail de batch niet meer kan blokkeren.
- De batch-logica zo aanpassen dat de sync **altijd voortgang bewaart** en de historiek in meerdere veilige stappen volledig binnenhaalt.
- De sync-status/logs duidelijker maken zodat we exact zien op welke UID hij stopt en waarom.

### 3) Herstel en validatie
- De vastgelopen sync-run opruimen zodat een frisse backfill meteen kan hervatten.
- Verifiëren dat het aantal opgeslagen mails oploopt voorbij UID 6 richting de serverhistoriek.
- Bevestigen in de UI dat de threadlijst zichtbaar blijft en dat nieuwe/historische mails effectief verschijnen.

## Technische details
- **Frontend**: inbox layout/panel sizing en lege-state gedrag.
- **Backend**: `sync-inbox` timeout/hang bij historische IMAP-verwerking.
- **Validatie**: database tellingen, sync logs, function logs en zichtbare threads in `/inbox`.

Als je dit plan goedkeurt, pak ik eerst de zichtbaarheid van de lijst en daarna meteen de vastlopende historische sync aan.