import React from "react";
import { Composition, registerRoot } from "remotion";
import { TravelMap } from "./TravelMap.jsx";
import cfg from "../../config.js";

import { dims } from "./dims.js";

const defaultProps = {
  a: { name: "Aarhus", label: "Aarhus", lon: 10.2039, lat: 56.1567 },
  b: { name: "Copenhagen", label: "Copenhagen", lon: 12.5683, lat: 55.6761 },
  mode: "car",
  segments: [{ kind: "car", coords: [[10.2039, 56.1567], [12.5683, 55.6761]] }],
  durationSec: 5, format: "16:9", scale: 1, audioUrl: null, logoUrl: null,
};

const Root = () => (
  <Composition
    id="TravelMap"
    component={TravelMap}
    fps={cfg.render.fps}
    durationInFrames={120}
    width={1920}
    height={1080}
    defaultProps={defaultProps}
    calculateMetadata={({ props }) => ({
      durationInFrames: Math.round(props.durationSec * cfg.render.fps),
      ...dims(props.format, props.scale || 1),
    })}
  />
);

registerRoot(Root);
