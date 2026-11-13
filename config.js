// =====================================================================
//  MALEFEKT TRAVEL MAPS — STYLE SETTINGS
// =====================================================================
//  Change any value below, save the file, and the preview updates.
//  The next Render will automatically use the new settings.
//
//  Colors are normal web colors: "#rrggbb" (e.g. "#b3261e" = red).
//  Sizes marked "px" are measured on a 1080-pixel-tall (16:9) video and
//  scale automatically for other sizes.
// =====================================================================

const config = {
  // ---------- MAP COLORS ----------
  colors: {
    sea: "#1c2d4a", // deep vintage navy blue
    land: "#dcc69b", // aged vintage beige
    borders: "#24140a", // country borders (dark ink)
    bordersOpacity: 0.9, // 0 = invisible, 1 = solid
    bordersWidth: 2.6, // px
    bordersDashed: false, // true = old-style dashed borders
    bordersGlow: "#9c3d1e", // soft hand-tinted band along each border (old atlas style)
    bordersGlowOpacity: 0.4, // 0 = off
    bordersGlowWidth: 10, // px
    coastline: "#3b2a18", // thin ink line along the coast
    coastlineOpacity: 0.45, // 0 = no coastline line
    globeBackground: "#d2bb8d", // paper color around the globe when zoomed far out
  },

  // ---------- SEA WAVE LINES (little hand-drawn waves) ----------
  waves: {
    enabled: true,
    color: "#d9cba8", // cream wave strokes
    opacity: 0.5, // 0 = invisible, 1 = strong
    density: 6, // how many wave marks per pattern tile (more = busier sea)
    size: 1.9, // 1 = small, 2.5 = big waves
  },

  // ---------- TREASURE-MAP PAPER ----------
  paper: {
    textureStrength: 0.85, // stains / fibres. 0 = clean, 1 = very aged
    foldLines: true, // folds in the paper (they move with the map)
    foldStrength: 1, // 0 = invisible, 1 = deep folds
    textureScale: 1.6, // size of the paper pattern (bigger = larger stains/fold spacing)
    burntEdges: true,
    burntEdgeWidth169: 0.055, // edge thickness in 16:9 (fraction of video height)
    burntEdgeWidth916: 0.03, // edge thickness in 9:16 (fraction of video width) — thinner
  },

  // ---------- COLOR GRADING ----------
  look: {
    warmTint: "#ffd9a3", // warm color laid over everything
    warmTintStrength: 0.28, // 0 = off
    vignette: 0.55, // dark soft corners. 0 = off, 1 = strong
    grain: 0.13, // animated film grain. 0 = off, 0.3 = heavy
  },

  // ---------- COMPASS ROSE ----------
  compass: {
    enabled: true,
    corner: "top-left", // "top-left" | "top-right" | "bottom-left" | "bottom-right"
    size: 170, // px
    color: "#3b2414", // ink color
    opacity: 0.85,
  },

  // ---------- ROUTE LINE ----------
  route: {
    color: "#b3221b", // red
    width: 5, // px — line thickness
    dashed: [2.4, 1.6], // plane line: dash length, gap (in line widths)
    dotted: [0.01, 2], // ferry line: dot, gap (in line widths)
  },

  // ---------- "X MARKS THE SPOT" ----------
  x: {
    color: "#b3221b",
    size: 82, // px
    roughness: 1, // 0 = clean strokes, 1.5 = very rough brush
    strokeWidth: 1, // 1 = normal, 1.4 = chunkier brush
  },

  // ---------- TEXT ----------
  text: {
    // Font file must be in public/fonts/. Special Elite is bundled.
    fontFile: "fonts/SpecialElite-Regular.ttf",
    fontName: "Special Elite",
    labelSize: 46, // px — the A / B place names
    labelOnLand: "#14100b", // black ink on land
    labelOnSea: "#efe3c4", // cream on the sea
    titleSize: 54, // px — bottom title
    titleColor: "#1a120b",
    titleBanner: true, // parchment strip behind the title so it's always readable
    typingSpeed: 13, // letters per second (sped up automatically for short videos)
  },

  // ---------- COUNTRY NAMES ----------
  countryLabels: {
    enabled: true,
    size: 30, // px
    color: "#3a2412", // ink brown
    opacity: 0.72,
    letterSpacing: 0.28, // extra space between letters (old atlas style)
    uppercase: true,
    max: 8, // most country names shown at once
  },

  // ---------- TOWNS AND CITIES ----------
  cityLabels: {
    enabled: true,
    size: 24, // px
    color: "#2a1a0d", // ink
    opacity: 0.9,
    dot: 8, // px — the little town marker
    max: 6, // most towns shown at once
  },

  // ---------- LANDMARK NOTES (edit or add your own in data/landmarks.json) ----------
  landmarks: {
    enabled: true,
    nameSize: 25, // px
    noteSize: 19, // px — the short note under the name
    color: "#7a1a12", // deep red ink
    noteColor: "#2a1a0d",
    marker: 18, // px — the little star
    max: 2, // most landmarks shown at once
  },

  // ---------- SOUND ----------
  sound: {
    clackVolume: 0.45, // typewriter clack per letter. 0 = silent, 1 = loud
    musicVolume: 0.9, // your uploaded tune
    musicFadeOutSeconds: 1.2, // fade at the end of the video
  },

  // ---------- VEHICLES ----------
  vehicle: {
    navy: "#1b2f5c", // vehicle body color
    outline: "#f1e6c8", // thin cream outline
    carSize: 1, // 1 = medium, 1.3 = bigger, 0.8 = smaller
    boatSize: 0.85,
    planeSize: 1,
  },

  // ---------- CAMERA ----------
  camera: {
    pitch: 28, // 3D tilt in degrees (0 = flat, 45 = strong)
    followDistance: 0.4, // how close it follows: share of the whole route visible (smaller = closer)
    maxZoom: 9.6, // closest zoom allowed — keeps short trips looking like a map, never street level
    introSeconds: 0.7, // how long it shows the full route before following
    holdSeconds: 1, // hold on B after arrival (included in the duration)
    planeZoomBoost: 0.7, // plane: how much closer the camera is at takeoff / landing
    globeAboveKm: 2200, // trips longer than this use the 3D globe view
  },

  // ---------- MALEFEKT LOGO STAMP ----------
  // Put your crest at assets/logo.png (white/light on dark or transparent).
  logo: {
    enabled: true,
    corner: "top-right", // "top-left" | "top-right" | "bottom-left" | "bottom-right"
    size: 210, // px (width)
    opacity: 0.92, // 0 = invisible, 1 = solid
    inkColor: "#24170e", // dark brown/black ink
    // "auto": transparent PNG → printed like a sepia engraving (dark lines in ink, white parts in cream paper)
    //         solid dark background → only the light parts print, as ink
    mode: "auto", // "auto" | "lines" | "light"
    paperColor: "#e6d3a8", // color of the crest's white parts (with "lines")
    paperOpacity: 0.88, // 0 = white parts see-through, 1 = solid cream
    threshold: 0.12, // raise (0.2–0.4) to drop faint grey specks
  },

  // ---------- ATTRIBUTION (required by OpenStreetMap) ----------
  attribution: {
    text: "© OpenFreeMap © OpenMapTiles © OpenStreetMap contributors · Places: GeoNames (CC BY 4.0)",
    size: 13, // px
    corner: "bottom-left",
  },

  // ---------- RENDERING ----------
  render: {
    fps: 24,
    previewScale: 0.5, // in-app preview resolution (0.5 = half size, fast)
    quality: 18, // H.264 CRF: lower = better/bigger file (16–23 sensible)
    concurrency: 3, // browser tabs rendering in parallel
    chromiumGl: "angle", // WebGL backend for headless Chrome on this Mac
  },
};

export default config;
