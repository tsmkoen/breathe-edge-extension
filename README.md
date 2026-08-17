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

## Installatie (Edge)

1. **Download** deze repository als ZIP: groene knop **Code** → **Download ZIP**
2. **Pak uit** (bv. naar `Downloads\breathe-edge-extension`)
3. Open `edge://extensions`
4. Zet **Developer mode** aan (schakelaar linksonder)
5. Klik **Load unpacked** → selecteer de uitgepakte map
6. **Pin de extensie** aan de werkbalk: puzzelstukje-icoon → speld 📌 naast *Breathe*

> **Update installeren?** Verwijder de oude extensie eerst (of pak de nieuwe ZIP over de oude map uit) en klik **reload** op `edge://extensions`. Controleer dat de versie rechtsboven `1.3.0` is.

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

- **Manifest V3.** MV3-service workers worden door Edge/Chrome na ~30s in slaap gezet; daarom draait de animatie primair in een **offscreen document** (`rAF`-lus) dat frames naar de service worker stuurt. Een **fallback-lus in de service worker** + **keepalive-alarm** zorgen dat het icoon blijft bewegen, ook als offscreen niet beschikbaar is.
- State (pauze, water, reminder, instellingen) via `chrome.storage.local`; het offscreen document krijgt state via berichten (offscreen documenten hebben geen storage-toegang).
- **Geen rechten op websites** — content script toont alleen de widget; er wordt niets gelezen of verzonden.

## Bestanden

| Bestand | Functie |
|---|---|
| `manifest.json` | Extensie-definitie (MV3) + opties-pagina |
| `cycle.js` | Ademhalingscyclus (inhale/hold/exhale) + standaardinstellingen |
| `icon-renderer.js` | Gedeelde icoon-rendering (canvas) + kleurenpaletten + tooltips |
| `offscreen.html` + `offscreen.js` | Animatielus (rAF) → stuurt frames naar de service worker |
| `background.js` | Service worker: offscreen, fallback-lus, alarms (water/adem/keepalive), state |
| `widget.js` | Discrete verplaatsbare widget in elke pagina (content script) |
| `options.html` + `options.js` | Opties-pagina (tijden, widget, kleuren, herinneringen) |
| `icons/` | Statische extensie-iconen (16/32/48/128 px) |
| `tools/gen-icons.mjs` | Script om de iconen opnieuw te genereren |
