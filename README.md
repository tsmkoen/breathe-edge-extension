# Breathe — rustige ademhaling tijdens de werkdag

Een persoonlijke extensie voor Microsoft Edge (en Chrome) waarmee je **discreet je ademhaling volgt en reguleert tijdens het werk**, zonder dat collega's het merken:

- 🌬️ **Inademen** (standaard 4s, groen) → eventueel **vasthouden** (optioneel) → 😮‍💨 **Uitademen** (standaard 6s, blauw)
- 🔄 Continue loop, zichtbaar op het **toolbar-icoon** én een **kleine verplaatsbare widget** in de pagina
- 💧 Optionele **water-herinnering**: icoon wordt rood wanneer het tijd is om te drinken
- 👀 **20-20-20 oogregel**: icoon wordt even violet — elke 20 min 20 seconden in de verte kijken
- 🧍 Optionele **opsta-herinnering**: icoon wordt teal — elk uur even opstaan en bewegen
- ⏰ Optionele **adem-herinnering**: subtiele kring rond het icoon, 1 minuut lang
- ⚙️ Alles instelbaar via de **opties-pagina** (rechtsklik op het icoon → *Opties*)

🔒 **Privacy:** de extensie maakt **geen enkele internetverbinding**. Geen telemetrie, geen accounts, geen externe servers — alles draait lokaal in je browser.

De extensie injecteert een klein, niet-selecteerbaar script op elke pagina (`<all_urls>`), maar dat script **leest en verstuurt niets**: het tekent alleen de ademhalingsring en leest de eigen instellingen uit `chrome.storage.local`. Er staan geen host-permissies of netwerkrechten in de manifest. De injectie is nodig omdat de widget en het herinneringskader in de pagina getekend moeten worden — en is per extensie uit te schakelen door hem op een enkele site toe te laten draaien.

Het script laadt daarbij twee bestanden uit de extensie zelf (`cycle.js` en `drawing.js`) via een dynamic import, zodat de cyclus en de pictogrammen niet dubbel in de code hoeven te staan. Die staan daarom als `web_accessible_resources` in de manifest. Ze bevatten geen instellingen of gegevens van de gebruiker — alleen wiskunde en kleurcodes — en worden uitsluitend door deze extensie zelf geladen.

## Installatie (Edge)

1. **Download** deze repository als ZIP: groene knop **Code** → **Download ZIP**
2. **Pak uit** (bv. naar `Downloads\breathe-edge-extension`)
3. Open `edge://extensions`
4. Zet **Developer mode** aan (schakelaar linksonder)
5. Klik **Load unpacked** → selecteer de uitgepakte map
6. **Pin de extensie** aan de werkbalk: puzzelstukje-icoon → speld 📌 naast *Breathe*

> **Update installeren?** Verwijder de oude extensie eerst (of pak de nieuwe ZIP over de oude map uit) en klik **reload** op `edge://extensions`. Controleer dat de versie rechtsboven overeenkomt met `version` in `manifest.json`.

## Gebruik

**Toolbar-icoon** (geanimeerd via offscreen document — blijft draaien):
- Groen vult zich bij inademen, (amber bij vasthouden), blauw leegt zich bij uitademen
- **Klik** = afhankelijk van de situatie:
  - bij een **herinnering** (druppel/mensje/oog): klik **bevestigt** de herinnering
  - anders: **pauzeren/hervatten**
- Hover toont de fase en herinneringen (met uitleg wat een klik doet)

**Widget in de pagina** (optioneel, **standaard uit** — alles werkt via het toolbar-icoon):
- Zelfde pictogrammen, rechtsonder, versleepbaar (positie wordt onthouden)
- Aan te zetten in de opties

**Herinneringen (pictogrammen — geen kleurcode nodig):**
- 💧 **Water:** het toolbar-icoon wordt een **rode druppel** + tooltip *"Tijd voor een glas water"*. **Klik op het icoon** om te bevestigen. Blijft staan tot je bevestigt.
- 🧍 **Opstaan:** het toolbar-icoon wordt een **teal mensje** + tooltip *"Tijd om even op te staan en te bewegen"*. **Klik op het icoon** om te bevestigen.
- 👀 **Ogen (20-20-20):** het toolbar-icoon wordt een **violet oog** + tooltip *"Kijk 20 seconden in de verte"*. **Klik op het icoon** = "weggekeken".
- ⏸ **Pauze:** grijs icoon met pauze-balkjes. Klik om te hervatten.
- ⏰ **Adem:** subtiele lichte kring rond het ademhalingsicoon, 1 minuut lang. Geen geluid, geen popup.
- 🔲 **Kader rond het venster:** bij een actieve herinnering (water/opstaan/ogen) verschijnt een **zacht pulserende rand** rond de pagina — zo zie je in je ooghoek dat er iets te doen is, ook zonder naar het icoon te kijken. Aan/uit in de opties.

## Opties (rechtsklik op icoon → Opties)

| Instelling | Uitleg |
|---|---|
| Inademen (s) | Duur van de inademing (1–30) |
| Vasthouden (s) | Pauze na inademen; 0 = uit. Bv. **4-4-4-4** = box breathing |
| Uitademen (s) | Duur van de uitademing (1–30). Bv. **4-6** = kalmerende verlengde uitademing |
| Widget tonen | Widget in de pagina (rechtsonder) — **standaard uit** |
| Grootte | Klein / medium / groot (20/26/34 px) |
| Kleuren | Standaard of **zacht/rustig** palet |
| Kader rond venster | Zachte rand bij een herinnering — **standaard aan** |
| Adem-herinnering | Uit / 10 / 20 / 30 / 45 / 60 min |
| Water-herinnering | Uit / 30 / 45 / 60 / 90 min |
| Oog-herinnering (20-20-20) | Uit / 20 / 30 / 45 / 60 min |
| Opsta-herinnering | Uit / 30 / 60 / 90 min |

Wijzigingen zijn **direct actief** — geen herladen nodig.

> 💡 **Pictogrammen:** 💧 rode druppel = water, 🧍 teal mensje = opstaan, 👀 violet oog = ogen (20-20-20), ⏸ grijs = pauze — de vorm vertelt wat je moet doen, kleur is enkel een extra hint.

## Technisch

- **Manifest V3**, `minimum_chrome_version: 109` (nodig voor `chrome.offscreen`). MV3-service workers worden door Edge/Chrome na ~30s in slaap gezet
- **Alarms overleven een sessiegrens.** Elk alarm zet `persistAcrossSessions: true` (Chrome 150+, door de documentatie aanbevolen voor compatibiliteit met andere browsers). Zonder die vlag is het gedrag in oudere versies onvoorspelbaar, waardoor vooral het eenmalige remind-off-alarm na een herstart kon verdwijnen — precies het plakken-reminder-probleem dat eerder is opgelost.
- **Gelijktijdige aanroepen van `createDocument()`** worden met een gedeelde `creating`-promise afgedekt. Chrome staat maar één offscreen document per extensie toe; zonder die guard zouden het keepalive-alarm en `onStartup` elkaar in de weg kunnen zitten.
- **Edge en Chrome delen dezelfde basis** — beide zijn Chromium, dus MV3, offscreen en alarms werken hetzelfde. Edge is vanaf 2026 ook bezig met de MV2→MV3-overgang; deze extensie is al MV3 en heeft daar geen last van. De `browser.*`-namespace (Chrome 148+) wordt niet gebruikt, dus er is geen adoptiestap nodig.; daarom draait de animatie primair in een **offscreen document** (`rAF`-lus) dat frames naar de service worker stuurt. Een **fallback-lus in de service worker** + **keepalive-alarm** zorgen dat het icoon blijft bewegen, ook als offscreen niet beschikbaar is.
- State (pauze, water, reminder, instellingen) via `chrome.storage.local`; het offscreen document krijgt state via berichten (offscreen documenten hebben geen storage-toegang).
- De cycluslogica, de kleurenpaletten en de pictogrammen staan elk op één plek (`cycle.js` en `drawing.js`). De widget in de pagina laadt die met een dynamic import via `chrome.runtime.getURL`, wat kan omdat ze in de manifest als `web_accessible_resources` staan. Zo kan de widget niet meer stil van het toolbar-icoon afwijken. De widget tekent daardoor nu exact dezelfde ring als het icoon (vóór deze refactor liep de ring 3% ruimer en 1,5px dunner).
- De eerste controle op de fallback-animatie loopt via een **eenmalig alarm** in plaats van een `setTimeout`: een service worker kan worden gesuspendeerd, waardoor een timer nooit vuurt. De keepalive loopt **om de minuut** in plaats van elke 30 seconden — genoeg om een dood offscreen document op te merken, zonder de service worker de hele werkdag wakker te houden.
- De ademhalingscyclus is **tijdgestabiliseerd**: het begin van de cyclus (`cycleStartedAt`) staat in `chrome.storage.local`, zodat het toolbar-icoon, de widget in de pagina en de fallback-lus dezelfde fase tonen — ook nadat de service worker of het offscreen document opnieuw is gestart.
- De adem-herinnering bewaart een `remindUntil`-tijdstip; een onderbroken sessie laat de herinnering dus niet permanent aanstaan.
- **Geen rechten op websites** — de content script toont alleen de widget/het kader; er wordt geen pagina-inhoud gelezen of verzonden. Zie de privacyparagraaf hierboven voor de precieze formulering.

## Bestanden

| Bestand | Functie |
|---|---|
| `manifest.json` | Extensie-definitie (MV3) + opties-pagina |
| `cycle.js` | Ademhalingscyclus (inhale/hold/exhale) + standaardinstellingen (bron van waarheid) |
| `drawing.js` | Gedeelde tekenprimitieven: kleurenpaletten, pictogrammen, ademhalingsring |
| `icon-renderer.js` | Icoon-rendering op basis van `drawing.js` + tooltips |
| `offscreen.html` + `offscreen.js` | Animatielus (rAF) → stuurt frames naar de service worker |
| `background.js` | Service worker: offscreen, fallback-lus, alarms (water/adem/keepalive), state |
| `widget.js` | Discrete verplaatsbare widget in elke pagina (content script) |
| `options.html` + `options.js` | Opties-pagina (tijden, widget, kleuren, herinneringen) |
| `icons/` | Statische extensie-iconen (16/32/48/128 px) |
| `tools/gen-icons.mjs` | Script om de iconen opnieuw te genereren (`npm run icons`) |
| `test/cycle.test.js` + `test/background.test.js` + `test/drawing.test.js` | Tests voor de cyclus, de service worker en de gedeelde tekenmodule (`npm test`) |
