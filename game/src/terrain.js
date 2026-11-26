// Meridian Run — valley terrain, runways, rings, storm cell and birds.
// One clear job: everything about the world the plane flies through.
import { SEED, WORLD, RUNWAY_START, RUNWAY_END, RINGS, STORM, BIRD_FLOCKS } from './config.js';
import { fbm2, smoothstep, lerp, clamp } from './random.js';

export { RINGS, STORM, BIRD_FLOCKS };

// Blend the terrain flat where a runway sits, so both strips are level ground.
function runwayFlatten(x, z, height) {
  let flat = height;
  for (const r of [RUNWAY_START, RUNWAY_END]) {
    const dx = Math.max(0, Math.abs(x - r.x) - r.width / 2 - 6) / 70;
    const dz = Math.max(0, Math.max(r.z0 - z, z - r.z1)) / 90;
    const d = Math.max(dx, dz);
    if (d < 1) flat = lerp(WORLD.floorHeight, flat, smoothstep(0, 1, d));
  }
  return flat;
}

// Ground altitude in metres at (x, z). The valley floor is gentle, the walls
// rise into rock and snow past |x| = 200. Deterministic for a fixed seed.
export function groundHeight(x, z) {
  const ax = Math.abs(x);
  let h = WORLD.floorHeight + fbm2(x * 0.01, z * 0.01, 3, SEED) * 14;
  h += (1 - smoothstep(200, 560, ax)) * fbm2(x * 0.03 + 3.1, z * 0.03, 2, SEED + 5) * 12;
  const ridge = smoothstep(WORLD.ridgeStart, WORLD.ridgeTop, ax);
  const ridgeHeight = ridge * (230 + 150 * fbm2(x * 0.002 + 7.3, z * 0.002, 2, SEED + 11));
  h += ridgeHeight;
  return runwayFlatten(x, z, h);
}

// Slope magnitude, used to shade rock faces darker than flat ground.
export function groundSlope(x, z) {
  const e = 6;
  const dx = (groundHeight(x + e, z) - groundHeight(x - e, z)) / (2 * e);
  const dz = (groundHeight(x, z + e) - groundHeight(x, z - e)) / (2 * e);
  return Math.sqrt(dx * dx + dz * dz);
}

// Base colour of the terrain at a point: grass valley, scrub slopes, rock
// walls, snow on the high peaks. Returns [r, g, b].
// The river winds down the valley floor: a blue ribbon the pilot can
// follow, and a landmark that makes the terrain recognisable at a glance.
function riverX(z) {
  return -60 + 40 * Math.sin(z * 0.002);
}

export function terrainColour(x, z, height) {
  const patch = fbm2(x * 0.02 + 11.7, z * 0.02, 2, SEED + 23);
  const slope = groundSlope(x, z);
  let c;
  if (height < 40 && Math.abs(x - riverX(z)) < 16) {
    c = [64 + patch * 10, 128 + patch * 12, 178 + patch * 10];
  } else if (height > 320) c = [235, 238, 242];
  else if (height > 175) c = [122, 110, 96];
  else if (height > 95) c = [104, 120, 70];
  else c = [88 + patch * 14, 140 - patch * 10, 66 + patch * 8];
  const shade = clamp(1 - slope * 0.35, 0.75, 1.02);
  // Snow line blends, rock blends: soften the band edges.
  if (height > 300 && height <= 320) {
    const t = (height - 300) / 20;
    c = [lerp(122, 235, t), lerp(110, 238, t), lerp(96, 242, t)];
  }
  if (height > 160 && height <= 175) {
    const t = (height - 160) / 15;
    c = [lerp(96, 122, t), lerp(110, 110, t), lerp(66, 96, t)];
  }
  return [Math.round(c[0] * shade), Math.round(c[1] * shade), Math.round(c[2] * shade)];
}

export function inStorm(x, z) {
  return z >= STORM.z0 && z <= STORM.z1 && Math.abs(x) < STORM.halfWidth;
}

export function onRunway(x, z, runway) {
  return Math.abs(x - runway.x) <= runway.width / 2 && z >= runway.z0 && z <= runway.z1;
}

// Distance from the plane to the centre of a ring, in metres.
export function ringDistance(plane, ring) {
  const dx = plane.x - ring.x;
  const dy = plane.y - ring.y;
  const dz = plane.z - ring.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
