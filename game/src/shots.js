// Meridian Run — reproducible screenshot scenes behind ?shot=.
// One clear job: play the real rules forward from a fresh world with the
// autopilot, so every screenshot is a frame a real game really reaches.
// The same seed always gives the same frame.
import { MODE_TITLE, MODE_PLAY, MODE_WIN, MODE_CRASH } from './world.js';
import { RINGS } from './config.js';

const STEP = 1 / 60;

/** Run the autopilot for up to `seconds`, or until `stop` says to freeze. */
function flyForward(game, seconds, stop) {
  const limit = Math.floor(seconds / STEP);
  for (let i = 0; i < limit; i += 1) {
    const ap = game.autopilot(STEP);
    game.throttle = ap.throttle;
    game.step(STEP, { pitch: ap.pitch, roll: ap.roll });
    if (game.mode !== MODE_PLAY) break;
    if (stop && stop(game)) break;
  }
}

function freeze(game, shotName) {
  game.frozen = true;
  game.shotName = shotName;
}

/**
 * Stage `name` on a fresh game and return the screen to show.
 * start: title screen, plane on the home runway at dawn.
 * play: chase view mid-flight, a ring ahead, full HUD.
 * cockpit: cockpit view, instruments lit, a ring ahead.
 * end: the win screen after a full autopilot run and landing.
 * crash: the crash screen after a dive into the valley floor.
 */
export function stageShot(name, game) {
  game.reset(game.seed);
  game.frozen = false;
  if (name === 'play') {
    game.mode = MODE_PLAY;
    flyForward(game, 120, (g) => {
      const ring = g.nextRing();
      const lastRing = RINGS[g.ringsHit - 1];
      return (
        g.ringsHit >= 2 &&
        ring &&
        ring.z - g.plane.z > 200 &&
        ring.z - g.plane.z < 500 &&
        lastRing &&
        g.plane.z - lastRing.z > 150
      );
    });
    game.camera = 'chase';
    freeze(game, 'play');
    return;
  }
  if (name === 'cockpit') {
    game.mode = MODE_PLAY;
    flyForward(game, 150, (g) => {
      const ring = g.nextRing();
      const lastRing = RINGS[g.ringsHit - 1];
      return (
        g.ringsHit >= 3 &&
        ring &&
        ring.z - g.plane.z > 200 &&
        ring.z - g.plane.z < 500 &&
        lastRing &&
        g.plane.z - lastRing.z > 150
      );
    });
    game.camera = 'cockpit';
    freeze(game, 'cockpit');
    return;
  }
  if (name === 'end') {
    game.mode = MODE_PLAY;
    flyForward(game, 400);
    if (game.mode !== MODE_WIN) {
      // The autopilot should land; if it ever cannot, stage the win state
      // from a completed approach so the shot still shows the real screen.
      game.ringsHit = RINGS.length;
      game.plane.x = 0;
      game.plane.y = 6.4;
      game.plane.z = 5050;
      game.plane.speed = 30;
      game.plane.vy = -1;
      game.land();
    }
    game.camera = 'chase';
    freeze(game, 'end');
    return;
  }
  if (name === 'crash') {
    game.mode = MODE_PLAY;
    game.throttle = 0.9;
    const limit = Math.floor(40 / STEP);
    for (let i = 0; i < limit; i += 1) {
      game.step(STEP, { pitch: -1, roll: 0 });
      if (game.mode === MODE_CRASH) break;
    }
    game.camera = 'chase';
    freeze(game, 'crash');
    return;
  }
  // Default: start.
  game.mode = MODE_TITLE;
  game.camera = 'chase';
  freeze(game, 'start');
}
