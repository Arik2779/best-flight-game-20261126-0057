// Meridian Run — the flight model.
// One clear job: turn pilot inputs into motion. Pitch, roll and yaw, lift and
// stall, throttle response, wind and storm turbulence. No rendering here.
import { clamp } from './random.js';
import { PLANE } from './config.js';
import { groundHeight } from './terrain.js';

// input: { pitch: -1..1 (positive pulls the nose up), roll: -1..1 (positive banks
//   right), throttle: 0..1 }
// env: { windX, windZ, updraft, turbulence: 0..1, shake: () => [-1, 1) }
// The plane is a point mass with heading/pitch/roll; the renderer draws it.
// Sets p.onGround while the wheels are on the ground (takeoff roll or a
// touchdown) and leaves p.vy as the impact speed for the landing check.
export function stepPlane(p, input, env, dt) {
  // Roll and pitch are attitudes the stick commands: the bank eases toward
  // the stick's bank, the nose toward the stick's pitch, and both ease back
  // to level when the stick is released. That keeps turns proportional and
  // the plane from winding up into a spiral.
  const targetRoll = input.roll * 1.0;
  p.roll += (targetRoll - p.roll) * 2.4 * dt;
  p.roll = clamp(p.roll, -1.15, 1.15);

  const targetPitch = input.pitch * 0.55;
  p.pitch += (targetPitch - p.pitch) * 2.2 * dt;
  p.pitch = clamp(p.pitch, -0.55, 0.62);

  // A banked turn: heading rate grows with bank and falls with speed.
  const turnRate = (Math.tan(p.roll) * 9.81) / Math.max(p.speed, 12);
  p.heading += turnRate * dt;

  // Speed chases the throttle setting; climbing costs speed, diving gains it.
  const targetSpeed =
    16 + input.throttle * (PLANE.maxSpeed - 16) - Math.max(0, p.pitch) * 16 + Math.max(0, -p.pitch) * 8;
  const accel = targetSpeed > p.speed ? 5.0 : 6.0;
  p.speed += clamp(targetSpeed - p.speed, -accel * dt, accel * dt);
  p.speed = clamp(p.speed, 0, 78);

  // Lift and stall: below min speed the wing quits and the plane sinks.
  const stalled = p.speed < PLANE.minSpeed;
  let vy = p.speed * Math.sin(p.pitch);
  if (stalled) vy -= (PLANE.minSpeed - p.speed) * 1.15;
  vy += env.updraft;

  // Storm turbulence buffets pitch and roll; the pilot feels it as a shake.
  if (env.turbulence > 0) {
    const t = env.turbulence;
    p.pitch += env.shake() * t * 0.35 * dt;
    p.roll += env.shake() * t * 0.5 * dt;
    vy += env.shake() * t * 3.0;
  }

  p.vy = vy;
  p.x += Math.sin(p.heading) * p.speed * dt + env.windX * dt;
  p.z += Math.cos(p.heading) * p.speed * dt + env.windZ * dt;

  // Ground contact: a plane sitting on its wheels does not sink. The stall
  // sink only pulls the plane down while it is actually airborne; on the
  // ground the wheels hold it until it has rotate speed and a climb.
  // A plane that was already rolling keeps vy = 0; a plane arriving from
  // the air keeps its impact speed in p.vy so the landing check can judge it.
  const ground = groundHeight(p.x, p.z);
  const wasOnGround = !!p.onGround;
  const resting = wasOnGround && p.y <= ground + 0.5 && p.speed < PLANE.takeoffSpeed && vy <= 0;
  if (resting) {
    vy = 0;
    p.vy = 0;
  }
  p.y += vy * dt;
  p.stalled = stalled;

  // The wheels hold the plane on the ground until it has rotate speed and a
  // climbing attitude.
  p.onGround = false;
  if (p.y <= ground + 0.4) {
    if (p.speed >= PLANE.takeoffSpeed && vy > 1) {
      p.y = ground + 0.4; // lifting off this frame
    } else {
      p.y = ground + 0.4;
      p.onGround = true;
      // Rolling along the ground holds the plane level, unless it is
      // diving into the ground (nose down at speed): then the impact
      // speed is kept so the landing check can judge the crash.
      if (wasOnGround && vy > -1.5) {
        vy = 0;
        p.vy = 0;
      }
    }
  }
  return stalled;
}
