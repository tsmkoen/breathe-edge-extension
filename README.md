# Breathe — ademhalingsoefening in je werkbalk én in je pagina

Een persoonlijke extensie voor Microsoft Edge (en Chrome) waarmee je **discreet je ademhaling kunt volgen tijdens het werk**, geïnspireerd op de Moonbird-instelling:

- 🌬️ **Inademen: 4 seconden** — de cirkel **loopt op** (groen)
- 😮‍💨 **Uitademen: 6 seconden** — de cirkel **loopt af** (blauw)
- 🔄 Continue loop, **twee weergaven**: het toolbar-icoon én een kleine verplaatsbare widget in de pagina

Alles draait lokaal in je browser — **er wordt niets verzonden, geen permissions voor websites**.

## Installatie (Edge)

1. **Download** deze repository als ZIP: groene knop **Code** → **Download ZIP**
2. **Pak uit** (bv. naar `Downloads\breathe-edge-extension`)
3. Open `edge://extensions` in Edge
4. Zet **Developer mode** aan (schakelaar linksonder)
5. Klik **Load unpacked** → selecteer de uitgepakte map
6. **Pin de extensie** aan de werkbalk: klik op het puzzelstukje-icoon (rechtsboven) → speld 📌 naast *Breathe*

Klaar! Je ziet nu de ademhalingscirkel in de werkbalk én rechtsonder in elke pagina.

## Gebruik

**Toolbar-icoon** (geanimeerd via een offscreen document — blijft dus draaien):
- Groene boog vult zich bij inademen, blauwe boog leegt zich bij uitademen
- **Klik** = pauzeren / hervatten
- Hover toont de fase: *inademen (4s)* / *uitademen (6s)*

**Widget in de pagina** (klein, discreet — collega's merken het niet op):
- Zelfde groen/blauw-patroon, rechtsonder, **versleepbaar** naar elke hoek
- **Klik** = pauzeren / hervatten (gesynchroniseerd met het toolbar-icoon)
- Bij pauze wordt de widget een klein grijs puntje

## Zelf aanpassen

**Tijden wijzigen** — open `cycle.js` (en `widget.js`, dezelfde waarden):

```js
export const INHALE_MS = 4000; // inademen (ms)
export const EXHALE_MS = 6000; // uitademen (ms)
```

**Widget verplaatsen** — sleep hem naar de gewenste hoek; de positie geldt per tabblad.

**Widget groter/kleiner** — in `widget.js`: `const CSS = 26;` (pixels).

Na elke wijziging: `edge://extensions` → klik het **reload**-symbool op de Breathe-kaart.

## Een update installeren

Heb je al een oudere versie geïnstalleerd? Download de nieuwe ZIP, pak uit **over de oude map** (of verwijder de oude extensie eerst) en klik **reload** op `edge://extensions`. Is de extensie ooit eerder geladen, verwijder ze dan eerst en laad opnieuw — zo weet je zeker dat de nieuwste versie actief is.

## Waarom het icoon blijft draaien (technisch)

Manifest V3-service workers worden door Edge/Chrome na ~30 seconden in slaap gezet. Daarom draait de animatie hier in een **offscreen document** (`offscreen.html`/`offscreen.js`) met `requestAnimationFrame` — dat blijft actief. Het offscreen document stuurt de icoon-frames naar de service worker, die alleen `chrome.action.setIcon()` uitvoert. De widget in de pagina tekent zelf met een eigen canvas, zonder extra rechten.

## Bestanden

| Bestand | Functie |
|---|---|
| `manifest.json` | Extensie-definitie (Manifest V3) |
| `cycle.js` | Ademhalingscyclus: timing 4s/6s + faseberekening |
| `offscreen.html` + `offscreen.js` | Animatielus (rAF) → stuurt frames naar de service worker |
| `background.js` | Service worker: offscreen-document beheren + toolbar-icoon zetten |
| `widget.js` | Discrete verplaatsbare widget in elke pagina (content script) |
| `icons/` | Statische extensie-iconen (16/32/48/128 px) |
| `tools/gen-icons.mjs` | Script om de iconen opnieuw te genereren |
