# Nomadix Inbox

Eén inbox voor de merken van Nomadix BV. React + Vite + TypeScript, Supabase
(Lovable Cloud) als backend, Migadu als mailserver.

## Lokaal draaien

```bash
npm install
npm run dev
```

## Controles

```bash
npx tsc --noEmit -p tsconfig.app.json   # types
npx vitest run                          # tests
npm run i18n:check                      # taalbestanden gelijk
npm run build                           # productiebuild
```

## Taal en thema

Nederlands is de brontekst; Engels staat ernaast in `src/i18n/messages/`.
Ontbreekt een sleutel in het Engels, dan valt hij terug op het Nederlands en
waarschuwt de console in dev. Taal, thema en lijstdichtheid staan in
Instellingen → Voorkeuren en worden per apparaat bewaard (`localStorage`),
niet in je account.

E-mailteksten blijven bewust buiten de vertaallaag: de aanhef bij een citaat,
`---------- Forwarded message ----------` (dat is ook het anker waarmee de
handtekening wordt omgewisseld) en `Re:`/`Fwd:`. Die volgen de correspondentie,
niet de interface.

## Op de telefoon

Onder 768px schakelt de app naar één kolom met een onderbalk. Op een rij in de
lijst kun je vegen:

| Gebaar | Wat er gebeurt |
|---|---|
| Kort naar links | Knoppen **Verwijderen** en **Meer** blijven staan |
| Ver naar links (voorbij de helft) | Meteen verwijderen, met zes seconden ongedaan maken |
| Naar rechts | Gelezen / ongelezen wisselen |
| Lang indrukken | Selectiemodus, met de bulkbalk onderaan |

Achter **Meer** staan Archiveren, Snoozen, Label en Dempen. Verwijderen is
omkeerbaar zolang de toast staat: de rij verdwijnt meteen uit de lijst, maar
de echte verwijdering gebeurt pas na zes seconden.

De opsteller vult op een telefoon het scherm; de terugknop sluit hem in plaats
van het gesprek, en hoogte én verschuiving volgen het zichtbare venster
(`visualViewport`), zodat het toetsenbord de knoppen niet wegduwt. Verzenden en
Weggooien staan in de vaste kop.

Een HTML-mail die op 600-640px is opgemaakt wordt op een telefoon **verkleind
tot hij past** (`useFitToWidth`), precies zoals Gmail en Apple Mail dat doen:
de opmaak blijft heel, alleen kleiner, en met je vingers zoom je in. Daarom
staat `user-scalable` nergens uit, en daarom worden tabellen in een mail
bewust *niet* op `max-width: 100%` gezet — dan zou de opmaak verschuiven in
plaats van meeschalen. Past hij zelfs op 40% niet, dan scrollt dat ene blok
zijwaarts. De verkleining gebruikt `zoom`, geen `transform: scale()`: een
transform rastert de tekst één keer en oogt wazig.

Een geciteerd bericht staat op een telefoon dichtgeklapt achter "Geciteerd
bericht tonen" (bij doorsturen niet — daar ís het de inhoud). Een HTML-mail
mag de layout nooit breed duwen: `.email-body` en het citaat in de opsteller
zijn eigen scrollblokken (`overflow-x: auto` + `contain: content`), zodat een
nieuwsbrief van 640px zijwaarts scrollt binnen zijn eigen kader en de pagina
op schermbreedte blijft.

Zet geen `transform` op een element dat een scrollend vlak omsluit: iOS maakt
daar een eigen rendercontext van en rastert de tekst één keer, wat tijdens het
scrollen wazig oogt. De opsteller volgt het zichtbare venster daarom via `top`.

Onder `md` staan de labels (Van/Aan/Cc/Bcc/Onderwerp) bóven hun veld en is elk
invoerveld minstens 16px. Dat laatste is geen smaak: Safari zoomt het scherm in
zodra je een veld met kleinere tekst aanraakt. Zet daarom nooit `text-sm` op een
invoerveld zonder `md:`-voorvoegsel — en zet nóóit `maximum-scale` of
`user-scalable=no` in de viewport-meta, want dat ontneemt slechtzienden het
zoomen.

## Service worker

`public/sw.js` is met de hand geschreven — geen plug-in, want Lovable beheert
de lockfile. Vier afspraken die je niet stilzwijgend mag wijzigen:

1. **`index.html` komt altijd van het netwerk**, nooit uit de cache. Alleen als
   je offline bent valt hij terug op de laatst geziene versie. Zonder die regel
   blijf je na een publish op een oude build hangen.
2. **De cachenaam draagt een versie per build.** `public/sw.js` bevat de
   plaatshouder `__SW_VERSION__`; het plug-innetje `stampServiceWorker` in
   `vite.config.ts` vervangt die bij elke build door een tijdstempel. Zo
   verandert de cachenaam mee én ziet de browser een nieuwe worker — die
   vergelijkt het bestand byte voor byte. Bij activatie gaat al het oudere weg.
3. **`skipWaiting` gebeurt pas na bevestiging.** Een nieuwe versie meldt zich
   via een toast ("Er staat een nieuwe versie klaar"); pas als je daarop klikt
   neemt hij over en herlaadt de pagina.
4. **Mail gaat nooit de cache in.** Alles wat niet van deze origin komt —
   Supabase voorop — laat de worker met rust.

**Noodrem:** open `/?sw=off`. Dat meldt de worker af en leegt alle caches.
Herlaad daarna één keer zonder die vlag. De worker draait alleen in een
productiebuild; in dev staat hij uit zodat hij de hot reload van Vite niet
in de weg zit.

## PWA-icoon

`public/icons/icon.svg` (en `maskable.svg`) zijn de bron. De PNG's zijn daaruit
gegenereerd:

```bash
cd public/icons
qlmanage -t -s 192 -o . icon.svg && mv icon.svg.png icon-192.png
qlmanage -t -s 512 -o . icon.svg && mv icon.svg.png icon-512.png
qlmanage -t -s 180 -o . icon.svg && mv icon.svg.png apple-touch-icon.png
qlmanage -t -s 512 -o . maskable.svg && mv maskable.svg.png maskable-512.png
```
