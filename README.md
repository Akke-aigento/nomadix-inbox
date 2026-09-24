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
| Kort naar links | Knoppen **Archiveren** en **Meer** blijven staan |
| Ver naar links (voorbij de helft) | Meteen archiveren, met ongedaan-knop |
| Naar rechts | Gelezen / ongelezen wisselen |
| Lang indrukken | Selectiemodus, met de bulkbalk onderaan |

De opsteller vult op een telefoon het scherm; de terugknop sluit hem in plaats
van het gesprek, en de hoogte volgt het toetsenbord.

## Service worker

`public/sw.js` is met de hand geschreven — geen plug-in, want Lovable beheert
de lockfile. Vier afspraken die je niet stilzwijgend mag wijzigen:

1. **`index.html` komt altijd van het netwerk**, nooit uit de cache. Alleen als
   je offline bent valt hij terug op de laatst geziene versie. Zonder die regel
   blijf je na een publish op een oude build hangen.
2. **Het versienummer staat in de cachenaam** (`nomadix-v1`). Verhoog `VERSION`
   in `public/sw.js` bij elke wijziging aan de worker; bij activatie wordt al
   het oudere weggegooid.
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
