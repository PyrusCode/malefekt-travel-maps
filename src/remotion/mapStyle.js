// Custom vintage MapLibre style on free OpenFreeMap vector tiles (no API key).
export function makeStyle(cfg, { globe, s }) {
  const c = cfg.colors;
  const lw = cfg.route.width * s;
  const layers = [
    { id: "land", type: "background", paint: { "background-color": c.land } },
    { id: "water", type: "fill", source: "omt", "source-layer": "water", filter: ["!=", ["get", "brunnel"], "tunnel"], paint: { "fill-color": c.sea, "fill-antialias": true } },
  ];
  if (cfg.waves.enabled) {
    layers.push({
      id: "waves", type: "fill", source: "omt", "source-layer": "water",
      filter: ["match", ["get", "class"], ["ocean", "sea", "bay", "lake"], true, false],
      paint: { "fill-pattern": "waves", "fill-opacity": cfg.waves.opacity },
    });
  }
  if (c.coastlineOpacity > 0) {
    layers.push({
      id: "coast", type: "line", source: "omt", "source-layer": "water",
      paint: { "line-color": c.coastline, "line-opacity": c.coastlineOpacity, "line-width": 1.1 * s },
    });
  }
  const borderFilter = ["all", ["==", ["get", "admin_level"], 2], ["!=", ["get", "maritime"], 1], ["!=", ["get", "disputed"], 1]];
  if (c.bordersGlowOpacity > 0) {
    layers.push({
      id: "borders-glow", type: "line", source: "omt", "source-layer": "boundary", filter: borderFilter,
      layout: { "line-join": "round", "line-cap": "round" },
      paint: { "line-color": c.bordersGlow, "line-opacity": c.bordersGlowOpacity, "line-width": c.bordersGlowWidth * s, "line-blur": 2 * s },
    });
  }
  layers.push({
    id: "borders", type: "line", source: "omt", "source-layer": "boundary",
    filter: borderFilter,
    layout: { "line-join": "round", "line-cap": "round" },
    paint: { "line-color": c.borders, "line-opacity": c.bordersOpacity, "line-width": c.bordersWidth * s, ...(c.bordersDashed ? { "line-dasharray": [3, 1.5] } : {}) },
  });
  const routeBase = { type: "line", source: "route", layout: { "line-cap": "round", "line-join": "round" } };
  layers.push(
    { ...routeBase, id: "route-car", filter: ["==", ["get", "kind"], "car"], paint: { "line-color": cfg.route.color, "line-width": lw } },
    { ...routeBase, id: "route-ferry", filter: ["==", ["get", "kind"], "ferry"], paint: { "line-color": cfg.route.color, "line-width": lw * 1.05, "line-dasharray": cfg.route.dotted } },
    { ...routeBase, id: "route-plane", filter: ["==", ["get", "kind"], "plane"], layout: { "line-cap": "butt", "line-join": "round" }, paint: { "line-color": cfg.route.color, "line-width": lw, "line-dasharray": cfg.route.dashed } },
  );
  return {
    version: 8,
    projection: { type: globe ? "globe" : "mercator" },
    sky: { "atmosphere-blend": 0 },
    sources: {
      omt: { type: "vector", url: "https://tiles.openfreemap.org/planet", attribution: "" },
      route: { type: "geojson", data: { type: "FeatureCollection", features: [] } },
    },
    layers,
  };
}
