// Meridian Run — game state and rules.
// One clear job: the mission. Rings, fuel, timer, wind, birds, storm, landing
// and crash, win tally and the autopilot the screenshot scenes fly with.
import { SEED, PLANE, MISSION, RINGS, STORM, BIRD_FLOCKS, RUNWAY_START, RUNWAY_END } from './config.js';
import { clamp, mulberry32, wrapAngle } from './random.js';
import { groundHeight, ringDistance, inStorm, onRunway } from './terrain.js';
import { stepPlane } from './flight.js';

export const MODE_TITLE = 'title';
export const MODE_PLAY = 'play';
export const MODE_WIN = 'win';
export const MODE_CRASH = 'crash';
export const MODE_PAUSED = 'paused';

export class Game {
  constructor(seed = SEED) {
    this.reset(seed);
  }

  reset(seed = SEED) {
    this.seed = seed;
    this.rng = mulberry32(seed);
    this.mode = MODE_TITLE;
    this.time = 0; // seconds since the session started
    this.plane = {
      x: PLANE.startX,
      y: PLANE.startY,
      z: PLANE.startZ,
      heading: 0,
      pitch: 0,
      roll: 0,
      speed: 0,
      vy: 0,
      stalled: false,
      onGround: true, // starts sitting on its wheels on the home runway
    };
    this.throttle = 0;
    this.engineOutSaid = false;
    this.fuel = MISSION.startFuel;
    this.timeLeft = MISSION.timeLimit;
    this.ringsHit = 0;
    this.score = 0;
    this.damage = 0;
    this.camera = 'chase'; // 'chase' | 'cockpit'
    this.crashReason = '';
    this.landingQuality = 0; // 0..1, set on a good touchdown
    this.winStats = null;
    this.messages = []; // { text, until } floating notices
    this.flash = 0; // lightning flash 0..1
    this.lightningTimer = 4;
    this.birds = BIRD_FLOCKS.map((f) => ({
      ...f,
      offset: this.rng() * 640 - 320,
      phase: this.rng() * Math.PI * 2,
      hitCooldown: 0,
    }));
    this.frozen = false; // screenshot scenes freeze the world and only render
    this.shotName = '';
  }

  start() {
    if (this.mode === MODE_TITLE || this.mode === MODE_WIN || this.mode === MODE_CRASH) {
      this.reset(this.seed);
      this.mode = MODE_PLAY;
      this.say('Takeoff! Thread the rings, then land on the far strip.');
    }
  }

  say(text, seconds = 3) {
    this.messages.push({ text, until: this.time + seconds });
    if (this.messages.length > 4) this.messages.shift();
  }

  nextRing() {
    return this.ringsHit < RINGS.length ? RINGS[this.ringsHit] : null;
  }

  // Wind at the plane: a steady valley breeze plus gusts that grow with time.
  windAt() {
    const p = this.plane;
    const gust = Math.sin(this.time * 0.7) * 1.6 + Math.sin(this.time * 1.9 + 2.0) * 1.1;
    return { windX: 1.5 + gust, windZ: -0.5 + Math.sin(this.time * 0.5) * 0.8 };
  }

  step(dt, input) {
    this.time += dt;
    if (this.mode !== MODE_PLAY || this.frozen) return;
    const p = this.plane;

    // Fuel: full throttle burns roughly four times idle. Empty tank = dead
    // engine; the plane still glides, so a landing stays possible.
    const burn = MISSION.burnIdle + this.throttle * MISSION.burnFull;
    this.fuel = Math.max(0, this.fuel - burn * dt);
    const engineOut = this.fuel <= 0;
    const effectiveThrottle = engineOut ? 0 : this.throttle;
    if (engineOut && !this.engineOutSaid) {
      this.engineOutSaid = true;
      this.say('FUEL EMPTY — engine out! Glide to the strip.', 5);
    }

    // Storm: turbulence, downdrafts and lightning while inside the cell.
    const storm = inStorm(p.x, p.z);
    if (storm && this.lightningTimer > 0) {
      this.lightningTimer -= dt;
      if (this.lightningTimer <= 0) {
        this.flash = 1;
        this.lightningTimer = 3 + this.rng() * 5;
      }
    }
    this.flash = Math.max(0, this.flash - dt * 2.5);
    const turbulence = storm ? 0.85 : 0;
    const updraft = storm ? -2.2 : Math.sin(p.z * 0.004) * 0.7;

    const wind = this.windAt();
    const wasAirborne = !this.plane.onGround;
    stepPlane(
      p,
      { pitch: input.pitch, roll: input.roll, throttle: effectiveThrottle },
      {
        windX: wind.windX,
        windZ: wind.windZ,
        updraft,
        turbulence,
        shake: () => this.rng() * 2 - 1,
      },
      dt,
    );

    // Timer: the valley closes. Rings buy time back.
    this.timeLeft -= dt;
    if (this.timeLeft <= 0) {
      this.timeLeft = 0;
      this.crash('Out of time — the valley closed before you landed.');
      return;
    }

    // Rings: fly through the glowing hoop.
    const ring = this.nextRing();
    if (ring && ringDistance(p, ring) < ring.radius - 0.5) {
      this.ringsHit += 1;
      this.score += MISSION.ringScore;
      this.timeLeft += MISSION.ringTimeBonus;
      this.fuel = Math.min(100, this.fuel + MISSION.ringFuelBonus);
      this.say(
        `RING ${this.ringsHit}/${RINGS.length}  +${MISSION.ringScore} pts  +${MISSION.ringTimeBonus}s  +fuel`,
        2.5,
      );
      this.ringChime = this.time;
    }

    // Birds: a strike costs damage and speed, and shakes the airframe.
    for (const flock of this.birds) {
      flock.hitCooldown = Math.max(0, flock.hitCooldown - dt);
      const t = ((this.time * flock.speed + flock.offset) % 640) - 320;
      const bx = flock.fromX < 0 ? t : -t;
      for (let i = 0; i < flock.count; i += 1) {
        const ox = (i - flock.count / 2) * 7;
        const oy = Math.sin(this.time * 3 + flock.phase + i) * 1.5;
        const dx = p.x - (bx + ox);
        const dy = p.y - (flock.y + oy);
        const dz = p.z - flock.z;
        if (flock.hitCooldown <= 0 && dx * dx + dy * dy + dz * dz < 42) {
          flock.hitCooldown = 1.5;
          this.damage += 25;
          p.speed = Math.max(12, p.speed - 6);
          this.say('BIRD STRIKE! Damage ' + this.damage + '%', 2.5);
          this.birdHit = this.time;
          if (this.damage >= 100) {
            this.crash('Bird strike tore the wing off — the plane went down.');
            return;
          }
        }
      }
    }

    // Ground: a fresh touchdown is judged on its impact speed, and so is
    // any later descent into the ground. Rolling along a runway is never
    // a crash, however fast; a gentle, aligned touchdown on the far strip
    // after every ring is the win. Anything else that meets the ground
    // is a crash.
    if (p.onGround && (wasAirborne || Math.abs(p.vy) > 1.5)) {
      const onStart = onRunway(p.x, p.z, RUNWAY_START);
      const onEnd = onRunway(p.x, p.z, RUNWAY_END);
      const gentle = Math.abs(p.vy) <= PLANE.maxLandingSink && p.speed <= PLANE.maxLandingSpeed;
      const aligned = Math.abs(p.roll) <= 0.3 && Math.abs(wrapAngle(p.heading)) <= 0.35;
      if ((onStart || onEnd) && gentle && aligned) {
        if (onEnd && this.ringsHit >= RINGS.length) {
          this.land();
          return;
        }
        if (onEnd) {
          this.crash('You touched down before threading every ring.');
          return;
        }
        return; // rolling on the home strip
      }
      if (!(onStart || onEnd)) {
        this.crash('The valley floor is not a runway.');
        return;
      }
      this.crash(
        p.speed > PLANE.maxLandingSpeed
          ? 'Too fast on touchdown — the gear collapsed.'
          : Math.abs(p.vy) > PLANE.maxLandingSink
            ? 'Slammed into the ground — flare sooner next time.'
            : 'Touched down crooked — line up with the strip.',
      );
    }
  }

  land() {
    const p = this.plane;
    this.landingQuality = clamp(1 - Math.abs(p.vy) / PLANE.maxLandingSink, 0.3, 1) * clamp(1 - Math.abs(p.x) / 15, 0.4, 1);
    const timeBonus = Math.round(this.timeLeft * 5);
    const fuelBonus = Math.round(this.fuel * 2);
    const landingBonus = Math.round(this.landingQuality * 500);
    this.score += timeBonus + fuelBonus + landingBonus;
    this.winStats = {
      rings: this.ringsHit,
      timeLeft: this.timeLeft,
      fuel: this.fuel,
      landingQuality: this.landingQuality,
      timeBonus,
      fuelBonus,
      landingBonus,
      score: this.score,
      flightTime: this.time,
    };
    this.mode = MODE_WIN;
    this.say('Touchdown! Meridian Run complete.', 4);
  }

  crash(reason) {
    this.crashReason = reason;
    this.mode = MODE_CRASH;
  }

  // Autopilot for the screenshot scenes: steers at the next ring with a
  // turn-rate controller (bank for the turn rate the heading error asks
  // for, so the nose converges without overshooting), climbs over high
  // ground ahead, slows for tight gates, then flies a steady glide to
  // the far strip and flares for the landing.
  autopilot(dt) {
    const p = this.plane;
    const ring = this.nextRing();
    // After the last ring the target is a point on the runway centreline
    // 100 m ahead of the plane, never a fixed point behind it: flying past
    // a fixed point would flip the steering around and start a circle.
    const target = ring ?? { x: 0, y: 12, z: Math.max(4950, p.z + 100) };
    const dx = target.x - p.x;
    const dz = target.z - p.z;
    const dist = Math.hypot(dx, target.y - p.y, dz);
    const desiredHeading = Math.atan2(dx, dz);
    const headingErr = wrapAngle(desiredHeading - p.heading);
    // Bank angle that produces the turn rate the heading error asks for.
    const bankFor = (err, maxBank) =>
      clamp(Math.atan((clamp(err * 1.2, -0.4, 0.4) * p.speed) / 9.81), -maxBank, maxBank);
    let roll = bankFor(headingErr, 1.0);
    let pitch = clamp((target.y - p.y) * 0.03 - p.vy * 0.06, -0.45, 0.45);
    let throttle = 0.85;
    if (p.speed < 30) throttle = 0.95;
    if (p.speed > 56) throttle = 0.45;
    // Slow for the gate: a slower plane turns tighter and has longer to aim.
    if (ring && dist < 500) throttle = Math.min(throttle, 0.55);

    // Look ahead: climb if the ground rises into the flight path.
    const aheadX = p.x + Math.sin(p.heading) * 140;
    const aheadZ = p.z + Math.cos(p.heading) * 140;
    const aheadGround = groundHeight(aheadX, aheadZ);
    if (aheadGround + 28 > p.y) {
      pitch = Math.max(pitch, 0.42);
      throttle = 0.95;
    }
    // Final approach: track a gentle glide (slope 0.09) that meets the
    // strip at z = 5000, mid-runway. The sink rate is the glide's own sink
    // plus a correction for the error from the path, so the plane rides
    // the path down instead of floating past the strip or diving under it.
    if (!ring) {
      const glideSlope = 0.09;
      const glideY = 6.4 + Math.max(0, 5000 - p.z) * glideSlope;
      if (p.z > 4550) {
        throttle = 0.35;
        const desiredVy = clamp(-glideSlope * p.speed - (p.y - glideY) * 0.15, -4.5, 2.0);
        pitch = clamp((desiredVy - p.vy) * 0.25, -0.45, 0.45);
        roll = bankFor(headingErr, 0.5);
      }
      if (p.z > 4800) throttle = 0.3;
      if (p.z > 5000) throttle = 0.2;
    }
    // The flight model reads pitch and roll as stick fractions: pitch is a
    // fraction of 0.55 rad, roll a fraction of 1.0 rad of bank.
    return { pitch: clamp(pitch / 0.55, -1, 1), roll, throttle };
  }
}

// Storm bounds, exported for the renderer.
export { STORM };
