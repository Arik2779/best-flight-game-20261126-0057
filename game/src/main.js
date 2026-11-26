// Meridian Run — boot and game loop.
// One clear job: wire input, sound, game and renderer together, run the
// frame loop, and stage ?shot= scenes for screenshots.
import { Game, MODE_TITLE, MODE_PLAY, MODE_WIN, MODE_CRASH, MODE_PAUSED } from './world.js';
import { Renderer } from './render.js';
import { Input } from './input.js';
import { SoundEngine } from './audio.js';
import { stageShot } from './shots.js';

const canvas = document.getElementById('game');
const params = new URLSearchParams(window.location.search);
const seed = Number(params.get('seed') || 20261126) || 20261126;
const shot = params.get('shot') || '';

const game = new Game(seed);
const renderer = new Renderer(canvas);
const input = new Input(canvas);
const sound = new SoundEngine();

// Exposed for play-testing: the test driver reads window.__meridian.game.
window.__meridian = { game, renderer, input, sound };

if (shot) {
  stageShot(shot, game);
} else {
  game.mode = MODE_TITLE;
}

let lastNow = performance.now();
let prevMode = game.mode;
let prevRings = game.ringsHit;

function handleActions() {
  if (input.takePressed('Enter') || input.takePressed('NumpadEnter') || input.takePressed('MouseClick')) {
    sound.ensure();
    if (game.mode === MODE_TITLE) game.start();
  }
  if (input.takePressed('KeyR')) {
    sound.ensure();
    if (game.mode === MODE_WIN || game.mode === MODE_CRASH || game.mode === MODE_PLAY) game.start();
  }
  if (input.takePressed('KeyC')) {
    game.camera = game.camera === 'chase' ? 'cockpit' : 'chase';
  }
  if (input.takePressed('KeyM')) {
    sound.ensure();
    sound.toggleMute();
  }
  if (input.takePressed('KeyP')) {
    if (game.mode === MODE_PLAY) game.mode = MODE_PAUSED;
    else if (game.mode === MODE_PAUSED) game.mode = MODE_PLAY;
  }
}

function frame(now) {
  const dt = Math.min(0.05, Math.max(0, (now - lastNow) / 1000));
  lastNow = now;
  const renderTime = now / 1000;

  if (!shot) {
    handleActions();
    if (game.mode === MODE_PLAY) {
      const controls = input.readControls(game.throttle, dt);
      game.throttle = controls.throttle;
      game.step(dt, controls);
    }
    // Sound cues on state changes.
    if (game.ringsHit !== prevRings) {
      prevRings = game.ringsHit;
      sound.chime();
    }
    if (game.mode !== prevMode) {
      if (game.mode === MODE_WIN) sound.thud();
      if (game.mode === MODE_CRASH) sound.crash();
      prevMode = game.mode;
    }
    sound.update(game.throttle, game.plane.speed, game.mode === MODE_PLAY);
  }
  renderer.draw(game, renderTime);
  input.endFrame();
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
