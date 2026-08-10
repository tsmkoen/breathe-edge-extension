# Breathe — ademhalingsoefening in je Edge-werkbalk

Een persoonlijke extensie voor Microsoft Edge (en Chrome): een **geanimeerd icoon in de werkbalk** dat een continue ademhalingsoefening toont, geïnspireerd op de Moonbird-instelling:

- 🌬️ **Inademen: 4 seconden** — de groene ring **loopt op** (vult zich)
- 😮‍💨 **Uitademen: 6 seconden** — de blauwe ring **loopt af** (leegt zich)
- 🔄 Continue loop, zichtbaar op het icoon zelf — **geen popup of venster** dat opent

## Installatie (Edge)

1. **Download** deze repository als ZIP: groene knop **Code** → **Download ZIP**
2. **Pak uit** (bv. naar `Downloads\breathe-edge-extension`)
3. Open `edge://extensions` in Edge
4. Zet **Developer mode** aan (schakelaar linksonder)
5. Klik **Load unpacked** → selecteer de uitgepakte map
6. **Pin de extensie** aan de werkbalk: klik op het puzzelstukje-icoon (rechtsboven) → speld 📌 naast *Breathe*

Klaar! Het icoon toont nu de ademhalingscirkel in je werkbalk.

## Gebruik

- **Klik op het icoon** = pauzeren / hervatten (handig als je even wegkijkt)
- Hover over het icoon toont de huidige fase: *inademen (4s)* of *uitademen (6s)*

## Zelf aanpassen

Wil je andere tijden? Open `cycle.js` en wijzig:

```js
export const INHALE_MS = 4000; // inademen (ms)
export const EXHALE_MS = 6000; // uitademen (ms)
```

Daarna: `edge://extensions` → klik het **reload**-symbool op de Breathe-kaart.

## Bestanden

| Bestand | Functie |
|---|---|
| `manifest.json` | Extensie-definitie (Manifest V3) |
| `cycle.js` | Ademhalingscyclus: timing 4s/6s + faseberekening |
| `background.js` | Animatielus: tekent de ring op het toolbar-icoon |
| `icons/` | Statische extensie-iconen (16/32/48/128 px) |
| `tools/gen-icons.mjs` | Script om de iconen opnieuw te genereren |

## Technisch

- **Manifest V3** — de moderne standaard voor Edge/Chrome-extensies
- Het icoon wordt live geanimeerd via `chrome.action.setIcon()` met `ImageData` uit een `OffscreenCanvas` in de background service worker
- **Geen rechten/permissions nodig**, geen data wordt verzonden — alles draait lokaal in je browser
