# Malefekt Travel Maps

Generates animated **vintage-atlas travel maps** for vlogs. Type a start and end city, and it plans the route, then renders a video of the journey: a car, plane or ferry moving across a hand-tinted map with labels, landmarks and sound effects.

**Highlights**
- Place search with fallbacks (Photon, falling back to Nominatim + Open-Meteo, with rate limiting) and real road routing via OSRM
- Vector map styling with **MapLibre GL** to get an old-atlas look: inked borders, glow bands, hand-drawn sea waves, paper textures
- Programmatic video with **Remotion** (React), with a live preview in the browser and server-side MP4 rendering
- Every colour, size and timing lives in one commented `config.js`; save it and the preview updates

**Stack:** JavaScript, React 19, Remotion, MapLibre GL, Express, Vite, OpenStreetMap data (OpenFreeMap tiles, OSRM)

## Run it

```bash
npm install
npm start        # opens the UI on http://localhost:3123
```

Pick the places and transport, preview, then press Render. Videos are written to `~/Desktop/Renders`.

## Where to change things
- Map colours, waves, labels, timings: `config.js`
- Map rendering: `src/remotion/`
- Search, routing and render pipeline: `lib/`
- Web UI: `src/ui/`
