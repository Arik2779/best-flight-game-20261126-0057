# Meridian Run

[![make.fun · best-flight-game-20261126-0057](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)

[![rank](https://make.fun/badge/best-flight-game-20261126-0057/Arik2779/best-flight-game-20261126-0057/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057/leaderboard)

[![reward](https://make.fun/badge/best-flight-game-20261126-0057/Arik2779/best-flight-game-20261126-0057/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)

A bush-plane time trial through a mountain valley. You fly a small prop plane
through 8 glowing rings against the clock, then put her down on the far strip
to bank your time bonus. An original game, built for the
[best flight game bounty](https://make.fun/bounty/best-flight-game-20261126-0057)
on make.fun.

## How to play

Open `game/index.html` in a desktop browser. No network, no downloads, no
build step — the whole game is static files.

1. Press **Enter** (or click) to take off from the home runway.
2. Thread the glowing rings in order. Each ring earns 100 points, +8 seconds
   on the clock and a little fuel.
3. Choose your lines: low valley shortcuts save time but the walls are close;
   the high route is safe but slow. Full throttle burns fuel fast.
4. Watch the storm cell past ring 4 — it buffets the plane and throws
   downdrafts — and the birds crossing the valley. A strike costs damage.
5. After ring 8, land on the far runway: slow, gentle, wings level, on the
   centreline. A good landing pays up to 500 bonus points.

Stall below 22 knots and the wing quits — push the nose down and build speed.
Run out of fuel and the engine stops; you can still glide to the strip.

## Controls

| Input | Action |
| --- | --- |
| ↑ / ↓ (or W / S) | Pitch down / up |
| ← / → (or A / D) | Bank left / right |
| Shift / Ctrl | Throttle up / down |
| 1 / 2 / 3 | Throttle idle / half / full |
| Mouse | Steer (move to bank and pitch) |
| C | Toggle chase / cockpit camera |
| M | Mute sound |
| P | Pause |
| R | Fly again |
| Enter / click | Start |

## Screenshots

The four screenshots in `screenshots/` are real renders of this game, taken
in a headless browser from the `?shot=` scenes (`start`, `play`, `cockpit`,
`end`): title on the runway, chase view mid-flight, cockpit view with the
instruments lit, and the mission-complete screen after landing.

## Source layout

- `game/src/config.js` — course, rings, mission and aircraft constants
- `game/src/random.js` — seeded random numbers and value noise
- `game/src/terrain.js` — valley, runways, rings, storm cell and birds
- `game/src/flight.js` — the flight model: pitch, roll, yaw, lift and stall
- `game/src/world.js` — game state and rules, plus the screenshot autopilot
- `game/src/render.js` — the pseudo-3D renderer, cockpit, HUD and screens
- `game/src/audio.js` — synthesised WebAudio sounds (engine, wind, chimes)
- `game/src/input.js` — keyboard and mouse input
- `game/src/shots.js` — reproducible `?shot=` scenes
- `game/src/main.js` — boot and game loop

All art is procedural canvas drawing and all sound is synthesised; nothing is
copied from another game.

## Repo

`Arik2779/best-flight-game-20261126-0057`
