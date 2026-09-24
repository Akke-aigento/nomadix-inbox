# INBOX-5c — Veegacties omwisselen

## Uitvoering
- Wijzig de veegactie in de inboxrij: een verre veeg naar links activeert verwijderen; een korte veeg toont `Verwijderen` en `Meer`.
- Gebruik voor verwijderen uitsluitend de bestaande `deleteThreads`-actie, zodat de optimistische verwijdering en 6-seconden-undo behouden blijven.
- Toon tijdens een verre veeg naar links de destructieve achtergrond met prullenbakicoon; rechts blijft gelezen/ongelezen.
- Verplaats Archiveren naar de eerste positie in het bestaande Meer-menu, gevolgd door Snoozen, Label en Dempen.
- Werk de bestaande veegtests bij voor verwijderen, de onthulde acties en het ongewijzigde gedrag naar rechts; behoud alle huidige drempelwaarden.

## Technische details
- Pas alleen de betrokken frontendbestanden aan: swipe-resolutie/hook, rij/list-props, inboxactiebedrading en bestaande tests.
- Hergebruik bestaande vertalingen voor Verwijderen, Archiveren, Meer, Snoozen, Label en Dempen; voeg alleen NL/EN-sleutels toe als een ontbrekende toegankelijke tekst dat vereist.
- Geen backendwijzigingen, migraties of aanpassingen aan andere schermen.

## Controle
- Draai de gerichte swipe-unit- en componenttests en rapporteer de gewijzigde bestanden en teststatus.
