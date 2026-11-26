// Meridian Run — course, mission and aircraft constants.
// One clear job: every number that tunes the game lives here.
export const SEED = 20261126;

export const WORLD = {
  length: 5400, // metres of valley course, z = 0 .. 5400
  floorHeight: 6, // valley floor altitude (m)
  ridgeStart: 200, // |x| where the valley walls begin to rise
  ridgeTop: 560, // |x| where the walls reach full height
};

export const RUNWAY_START = { x: 0, z0: 0, z1: 400, width: 30, heading: '09' };
export const RUNWAY_END = { x: 0, z0: 4800, z1: 5200, width: 30, heading: '27' };

// Target rings in course order. x is lateral, y is altitude, z is along the valley.
// The line alternates valley floor and ridge-top passes so the pilot must choose
// low shortcuts against safe altitude, and ring 5 sits inside the storm cell.
export const RINGS = [
  { x: -120, y: 110, z: 800, radius: 18 },
  { x: 60, y: 180, z: 1400, radius: 18 },
  { x: 180, y: 140, z: 2000, radius: 18 },
  { x: -40, y: 220, z: 2600, radius: 18 },
  { x: -180, y: 160, z: 3200, radius: 18 },
  { x: 40, y: 260, z: 3700, radius: 18 },
  { x: 160, y: 120, z: 4200, radius: 18 },
  { x: 0, y: 60, z: 4550, radius: 18 },
];

// Storm cell: dark cloud band with turbulence and downdrafts, telegraphed by
// black cloud and lightning long before the plane reaches it.
export const STORM = { z0: 2900, z1: 3400, halfWidth: 260 };

// Bird flocks cross the valley at fixed bands; a strike costs damage and speed.
export const BIRD_FLOCKS = [
  { z: 1050, y: 150, fromX: -320, toX: 320, speed: 16, count: 5 },
  { z: 1750, y: 110, fromX: 320, toX: -320, speed: 14, count: 4 },
  { z: 2350, y: 200, fromX: -320, toX: 320, speed: 18, count: 6 },
  { z: 3950, y: 170, fromX: 320, toX: -320, speed: 15, count: 5 },
  { z: 4450, y: 100, fromX: -320, toX: 320, speed: 17, count: 4 },
];

export const PLANE = {
  startX: 0,
  startY: 6.4, // wheels on the start runway (valley floor 6 + 0.4 ground offset)
  startZ: 60,
  minSpeed: 22, // below this the wing stalls and the plane sinks
  cruiseSpeed: 46,
  maxSpeed: 62,
  takeoffSpeed: 28, // rotate speed
  maxLandingSpeed: 48,
  maxLandingSink: 4.5, // m/s vertical speed allowed at touchdown
  wingspan: 11,
  length: 8.5,
};

export const MISSION = {
  timeLimit: 170, // seconds on the clock at takeoff
  ringTimeBonus: 8, // seconds added per ring
  ringFuelBonus: 6, // fuel points added per ring
  ringScore: 100,
  startFuel: 100,
  // Fuel burn per second: idle 0.15, full throttle ~0.65. A clean run uses ~60.
  burnIdle: 0.15,
  burnFull: 0.5,
};

export const COLOURS = {
  skyTop: '#1d2a55',
  skyMid: '#7a6a9e',
  skyLow: '#e8915a',
  horizon: '#f7c98d',
  sun: '#ffd9a0',
  grass: [74, 122, 58],
  scrub: [96, 110, 66],
  rock: [122, 110, 96],
  snow: [235, 238, 242],
  runway: '#3a3d44',
  ringNext: '#ffb400',
  ringFuture: '#ff7a3c',
  ringDone: '#3ddc84',
};
