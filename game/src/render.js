// Meridian Run — everything the eye sees.
// One clear job: project the 3D world onto the canvas and draw the sky,
// terrain, runway, rings, clouds, birds, aircraft, cockpit, HUD and screens.
// No game rules here; it only reads the Game.
import { COLOURS, RINGS, RUNWAY_START, RUNWAY_END, STORM, PLANE } from './config.js';
import { clamp, mulberry32, fbm2 } from './random.js';
import { groundHeight, terrainColour, inStorm } from './terrain.js';
import { MODE_TITLE, MODE_PLAY, MODE_WIN, MODE_CRASH, MODE_PAUSED } from './world.js';

const FOV = (68 * Math.PI) / 180;
const GRID_X0 = -1200;
const GRID_X1 = 1200;
const GRID_Z0 = -250;
const GRID_Z1 = 5650;
const CELL = 50;

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.W = 0;
    this.H = 0;
    this.f = 600;
    this.clouds = this.makeClouds();
    this.buildTerrainGrid();
  }

  makeClouds() {
    const rng = mulberry32(20261126);
    const clouds = [];
    for (let i = 0; i < 28; i += 1) {
      clouds.push({
        x: rng() * 1500 - 750,
        y: 250 + rng() * 190,
        z: rng() * 5400,
        s: 50 + rng() * 90,
        dark: false,
      });
    }
    for (let i = 0; i < 14; i += 1) {
      clouds.push({
        x: (rng() * 2 - 1) * STORM.halfWidth,
        y: 210 + rng() * 120,
        z: STORM.z0 + rng() * (STORM.z1 - STORM.z0),
        s: 90 + rng() * 140,
        dark: true,
      });
    }
    return clouds;
  }

  buildTerrainGrid() {
    const cols = (GRID_X1 - GRID_X0) / CELL + 1;
    const rows = (GRID_Z1 - GRID_Z0) / CELL + 1;
    this.gridCols = cols;
    this.gridRows = rows;
    this.gridH = new Float32Array(cols * rows);
    this.gridC = new Uint8Array(cols * rows * 3);
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const x = GRID_X0 + c * CELL;
        const z = GRID_Z0 + r * CELL;
        const h = groundHeight(x, z);
        this.gridH[r * cols + c] = h;
        const col = terrainColour(x, z, h);
        this.gridC[(r * cols + c) * 3] = col[0];
        this.gridC[(r * cols + c) * 3 + 1] = col[1];
        this.gridC[(r * cols + c) * 3 + 2] = col[2];
      }
    }
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.W = w;
    this.H = h;
    this.f = (h / 2) / Math.tan(FOV / 2);
  }

  // Camera basis for this frame, from the plane and the chosen view.
  // The chase camera looks along the plane's heading, level, so the
  // horizon stays steady while the plane climbs and dives; the cockpit
  // camera follows the nose, damped, so the pilot sees where it points.
  computeCamera(game) {
    const p = game.plane;
    const hSin = Math.sin(p.heading);
    const hCos = Math.cos(p.heading);
    let cam;
    let look;
    if (game.camera === 'cockpit') {
      const pitch = p.pitch * 0.5;
      const fwdX = hSin * Math.cos(pitch);
      const fwdY = Math.sin(pitch);
      const fwdZ = hCos * Math.cos(pitch);
      cam = { x: p.x + fwdX * 1.6, y: p.y + 0.9, z: p.z + fwdZ * 1.6 };
      look = { x: p.x + fwdX * 80, y: p.y + fwdY * 80, z: p.z + fwdZ * 80 };
    } else {
      // Title: further back and higher, looking slightly down the strip,
      // so the parked plane reads on the runway below the title panel.
      const dist = game.mode === MODE_TITLE ? 30 : 22;
      const height = game.mode === MODE_TITLE ? 10 : 5.5;
      // On the title screen the camera looks up a touch, which pushes the
      // parked plane down the frame, clear of the title panel.
      const lookY = game.mode === MODE_TITLE ? p.y + 9 : p.y + 2.5;
      cam = { x: p.x - hSin * dist, y: p.y + height, z: p.z - hCos * dist };
      look = { x: p.x + hSin * 30, y: lookY, z: p.z + hCos * 30 };
    }
    let fx = look.x - cam.x;
    let fy = look.y - cam.y;
    let fz = look.z - cam.z;
    const fl = Math.hypot(fx, fy, fz) || 1;
    fx /= fl;
    fy /= fl;
    fz /= fl;
    // right = world-up x fwd; up = fwd x right (a right-handed basis, so
    // the sky projects above the horizon and the ground below it).
    let rx = fz;
    let ry = 0;
    let rz = -fx;
    const rl = Math.hypot(rx, ry, rz) || 1;
    rx /= rl;
    ry /= rl;
    rz /= rl;
    let ux = fy * rz - fz * ry;
    let uy = fz * rx - fx * rz;
    let uz = fx * ry - fy * rx;
    const roll = p.roll * (game.camera === 'cockpit' ? 0.55 : 0.45);
    const cr = Math.cos(roll);
    const sr = Math.sin(roll);
    const nrx = rx * cr + ux * sr;
    const nry = ry * cr + uy * sr;
    const nrz = rz * cr + uz * sr;
    const nux = ux * cr - rx * sr;
    const nuy = uy * cr - ry * sr;
    const nuz = uz * cr - rz * sr;
    this.cam = cam;
    this.fwd = { x: fx, y: fy, z: fz };
    this.right = { x: nrx, y: nry, z: nrz };
    this.up = { x: nux, y: nuy, z: nuz };
    this.yaw = p.heading;
  }

  // Project a world point. Null when behind the camera.
  project(x, y, z) {
    const dx = x - this.cam.x;
    const dy = y - this.cam.y;
    const dz = z - this.cam.z;
    const cz = dx * this.fwd.x + dy * this.fwd.y + dz * this.fwd.z;
    if (cz < 0.6) return null;
    const cx = dx * this.right.x + dy * this.right.y + dz * this.right.z;
    const cy = dx * this.up.x + dy * this.up.y + dz * this.up.z;
    const s = this.f / cz;
    return { x: this.W / 2 + cx * s, y: this.H / 2 - cy * s, s, z: cz };
  }

  draw(game, time) {
    this.resize();
    this.computeCamera(game);
    const ctx = this.ctx;
    const { W, H } = this;
    this.drawSky(game, time);
    this.drawGroundSkirt();
    this.drawTerrain();
    this.drawRunway(RUNWAY_START);
    this.drawRunway(RUNWAY_END);
    this.drawRings(game, time);
    this.drawClouds();
    this.drawBirds(game, time);
    if (game.camera === 'chase') {
      this.drawPlaneShadow(game);
      this.drawPlane(game, time);
    }
    if (game.flash > 0) {
      ctx.fillStyle = `rgba(220,225,255,${(game.flash * 0.28).toFixed(3)})`;
      ctx.fillRect(0, 0, W, H);
    }
    if (game.camera === 'cockpit') this.drawCockpit(game, time);
    if (game.mode === MODE_PLAY || game.mode === MODE_PAUSED) this.drawHUD(game, time);
    this.drawMessages(game);
    if (game.mode === MODE_TITLE) this.drawTitle(game);
    else if (game.mode === MODE_WIN) this.drawWin(game);
    else if (game.mode === MODE_CRASH) this.drawCrash(game);
    else if (game.mode === MODE_PAUSED) this.drawPaused();
  }

  drawSky(game, time) {
    const ctx = this.ctx;
    const { W, H } = this;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, COLOURS.skyTop);
    g.addColorStop(0.42, COLOURS.skyMid);
    g.addColorStop(0.62, COLOURS.skyLow);
    g.addColorStop(0.72, COLOURS.horizon);
    g.addColorStop(1, '#8a7a68');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // Low morning sun, ahead and to the left of the valley.
    const sunDir = { x: -0.45, y: 0.22, z: 0.86 };
    const sun = this.project(
      this.cam.x + sunDir.x * 3000,
      this.cam.y + sunDir.y * 3000,
      this.cam.z + sunDir.z * 3000,
    );
    if (sun) {
      const glow = ctx.createRadialGradient(sun.x, sun.y, 4, sun.x, sun.y, 150);
      glow.addColorStop(0, 'rgba(255,217,160,0.95)');
      glow.addColorStop(0.25, 'rgba(255,190,120,0.55)');
      glow.addColorStop(1, 'rgba(255,190,120,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(sun.x - 160, sun.y - 160, 320, 320);
      ctx.fillStyle = COLOURS.sun;
      ctx.beginPath();
      ctx.arc(sun.x, sun.y, 26, 0, Math.PI * 2);
      ctx.fill();
    }
    this.drawBackdropRidges();
  }

  // Two jagged mountain silhouettes on the horizon, parallaxed by heading.
  drawBackdropRidges() {
    const ctx = this.ctx;
    const { W, H } = this;
    const horizonY = H * 0.55;
    const layers = [
      { amp: 90, base: 0, colour: 'rgba(96,86,150,0.55)', seed: 4.7, parallax: 0.9 },
      { amp: 130, base: 26, colour: 'rgba(62,72,112,0.8)', seed: 9.2, parallax: 1.6 },
    ];
    for (const layer of layers) {
      ctx.fillStyle = layer.colour;
      ctx.beginPath();
      ctx.moveTo(-20, horizonY + 4);
      for (let sx = -20; sx <= W + 20; sx += 36) {
        const a = (sx / W) * 6 + this.yaw * layer.parallax + layer.seed;
        const peak = horizonY - layer.base - fbm2(a, layer.seed, 3, 77) * layer.amp;
        ctx.lineTo(sx, peak);
      }
      ctx.lineTo(W + 20, horizonY + 4);
      ctx.closePath();
      ctx.fill();
    }
  }

  // Fill a quad (or the triangle that is left of it when a corner is
  // behind the camera) so the near ground never leaves holes that show sky.
  fillQuad(ctx, points, fill) {
    const pts = points.filter(Boolean);
    if (pts.length < 3) return;
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    ctx.fill();
  }

  // World-space quad: clip the polygon against the camera's near plane in
  // view space, then project. Simply dropping a behind-camera corner would
  // cut the quad short and leave sky showing through the near ground, so
  // the clip — not the drop — is what keeps the valley floor solid.
  clipProjectQuad(points) {
    const NEAR = 0.6;
    let poly = points.map(([x, y, z]) => {
      const dx = x - this.cam.x;
      const dy = y - this.cam.y;
      const dz = z - this.cam.z;
      return {
        cx: dx * this.right.x + dy * this.right.y + dz * this.right.z,
        cy: dx * this.up.x + dy * this.up.y + dz * this.up.z,
        cz: dx * this.fwd.x + dy * this.fwd.y + dz * this.fwd.z,
      };
    });
    const cross = (a, b) => {
      const t = (NEAR - a.cz) / (b.cz - a.cz);
      return {
        cx: a.cx + (b.cx - a.cx) * t,
        cy: a.cy + (b.cy - a.cy) * t,
        cz: NEAR,
      };
    };
    const clipped = [];
    for (let i = 0; i < poly.length; i += 1) {
      const cur = poly[i];
      const prev = poly[(i + poly.length - 1) % poly.length];
      const curIn = cur.cz >= NEAR;
      const prevIn = prev.cz >= NEAR;
      if (curIn) {
        if (!prevIn) clipped.push(cross(prev, cur));
        clipped.push(cur);
      } else if (prevIn) {
        clipped.push(cross(prev, cur));
      }
    }
    if (clipped.length < 3) return null;
    return clipped.map((p) => {
      const s = this.f / p.cz;
      return { x: this.W / 2 + p.cx * s, y: this.H / 2 - p.cy * s };
    });
  }

  fillQuad3D(ctx, points, fill) {
    const sp = this.clipProjectQuad(points);
    if (sp) this.fillQuad(ctx, sp, fill);
  }

  // A flat valley floor under everything: the terrain grid ends at its
  // edges, and without this the sky gradient would show through below the
  // horizon wherever the grid runs out. Drawn first, the grid paints over it.
  drawGroundSkirt() {
    const ctx = this.ctx;
    const zNear = this.cam.z + 1;
    this.fillQuad3D(ctx, [
      [-4000, 5.5, zNear],
      [4000, 5.5, zNear],
      [4000, 5.5, 7000],
      [-4000, 5.5, 7000],
    ], 'rgb(88,140,66)');
  }

  drawTerrain() {
    const ctx = this.ctx;
    const { W, H } = this;
    const camZ = this.cam.z;
    const zNear = Math.max(GRID_Z0, Math.floor((camZ - 120) / CELL) * CELL);
    const zFar = Math.min(GRID_Z1 - CELL, Math.ceil((camZ + 1050) / CELL) * CELL);
    const xNear = Math.max(GRID_X0, Math.floor((this.cam.x - 1100) / CELL) * CELL);
    const xFar = Math.min(GRID_X1 - CELL, Math.ceil((this.cam.x + 1100) / CELL) * CELL);
    const cols = this.gridCols;
    for (let z = zFar; z >= zNear; z -= CELL) {
      const r = (z - GRID_Z0) / CELL;
      for (let x = xNear; x <= xFar; x += CELL) {
        const c = (x - GRID_X0) / CELL;
        const i00 = r * cols + c;
        const i10 = r * cols + c + 1;
        const i01 = (r + 1) * cols + c;
        const i11 = (r + 1) * cols + c + 1;
        const sp = this.clipProjectQuad([
          [x, this.gridH[i00], z],
          [x + CELL, this.gridH[i10], z],
          [x + CELL, this.gridH[i11], z + CELL],
          [x, this.gridH[i01], z + CELL],
        ]);
        if (!sp) continue;
        const minX = Math.min(...sp.map((q) => q.x));
        const maxX = Math.max(...sp.map((q) => q.x));
        const minY = Math.min(...sp.map((q) => q.y));
        const maxY = Math.max(...sp.map((q) => q.y));
        if (maxX < -40 || minX > W + 40 || maxY < -40 || minY > H + 40) continue;
        const rr = Math.round((this.gridC[i00 * 3] + this.gridC[i10 * 3] + this.gridC[i01 * 3] + this.gridC[i11 * 3]) / 4);
        const gg = Math.round((this.gridC[i00 * 3 + 1] + this.gridC[i10 * 3 + 1] + this.gridC[i01 * 3 + 1] + this.gridC[i11 * 3 + 1]) / 4);
        const bb = Math.round((this.gridC[i00 * 3 + 2] + this.gridC[i10 * 3 + 2] + this.gridC[i01 * 3 + 2] + this.gridC[i11 * 3 + 2]) / 4);
        this.fillQuad(ctx, sp, `rgb(${rr},${gg},${bb})`);
      }
    }
  }

  drawRunway(runway) {
    const ctx = this.ctx;
    const ground = 6;
    const half = runway.width / 2;
    for (let z = runway.z0; z < runway.z1; z += 40) {
      const zFarSeg = Math.min(z + 40, runway.z1);
      this.fillQuad3D(ctx, [
        [runway.x - half, ground + 0.15, z],
        [runway.x + half, ground + 0.15, z],
        [runway.x + half, ground + 0.15, zFarSeg],
        [runway.x - half, ground + 0.15, zFarSeg],
      ], COLOURS.runway);
    }
    // Centreline dashes and threshold bars.
    for (let z = runway.z0 + 20; z < runway.z1 - 10; z += 80) {
      this.fillQuad3D(ctx, [
        [runway.x - 0.9, ground + 0.3, z],
        [runway.x + 0.9, ground + 0.3, z],
        [runway.x + 0.9, ground + 0.3, z + 22],
        [runway.x - 0.9, ground + 0.3, z + 22],
      ], 'rgba(240,240,230,0.9)');
    }
    for (const z of [runway.z0 + 8, runway.z1 - 12]) {
      for (const bx of [-10, -3.5, 3.5, 10]) {
        this.fillQuad3D(ctx, [
          [runway.x + bx - 2.2, ground + 0.3, z],
          [runway.x + bx + 2.2, ground + 0.3, z],
          [runway.x + bx + 2.2, ground + 0.3, z + 6],
          [runway.x + bx - 2.2, ground + 0.3, z + 6],
        ], 'rgba(240,240,230,0.9)');
      }
    }
    // Amber edge lights.
    ctx.fillStyle = 'rgba(255,176,66,0.95)';
    for (let z = runway.z0 + 10; z < runway.z1; z += 100) {
      for (const sx of [-half - 2, half + 2]) {
        const p = this.project(runway.x + sx, ground + 1.2, z);
        if (!p) continue;
        const r = Math.max(1.5, 0.6 * p.s);
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  drawRings(game, time) {
    const ctx = this.ctx;
    const sorted = RINGS.map((ring, i) => ({ ring, i })).sort(
      (a, b) => Math.hypot(b.ring.x - game.plane.x, b.ring.z - game.plane.z) - Math.hypot(a.ring.x - game.plane.x, a.ring.z - game.plane.z),
    );
    for (const { ring, i } of sorted) {
      const dist = Math.hypot(ring.x - game.plane.x, ring.y - game.plane.y, ring.z - game.plane.z);
      if (dist > 1400) continue;
      const isNext = i === game.ringsHit;
      const isDone = i < game.ringsHit;
      const colour = isDone ? COLOURS.ringDone : isNext ? COLOURS.ringNext : COLOURS.ringFuture;
      const pulse = isNext ? 0.75 + 0.25 * Math.sin(time * 5) : 0.8;
      const pts = [];
      let ok = true;
      for (let k = 0; k < 40; k += 1) {
        const a = (k / 40) * Math.PI * 2;
        const p = this.project(ring.x + Math.cos(a) * ring.radius, ring.y + Math.sin(a) * ring.radius, ring.z);
        if (!p) {
          ok = false;
          break;
        }
        pts.push(p);
      }
      if (!ok || pts.length < 3) continue;
      // Translucent disc so the hoop reads even against bright sky.
      ctx.fillStyle = isNext ? 'rgba(255,180,0,0.10)' : isDone ? 'rgba(61,220,132,0.05)' : 'rgba(255,122,60,0.06)';
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let k = 1; k < pts.length; k += 1) ctx.lineTo(pts[k].x, pts[k].y);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = colour;
      ctx.globalAlpha = pulse;
      ctx.lineWidth = Math.max(2, 1.4 * pts[0].s);
      ctx.shadowColor = colour;
      ctx.shadowBlur = isNext ? 22 : 8;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let k = 1; k < pts.length; k += 1) ctx.lineTo(pts[k].x, pts[k].y);
      ctx.closePath();
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
      // A light beam over the next ring so the pilot can find it from afar.
      if (isNext) {
        const top = this.project(ring.x, ring.y + 90, ring.z);
        const centre = this.project(ring.x, ring.y, ring.z);
        if (top && centre) {
          const grad = ctx.createLinearGradient(centre.x, centre.y, top.x, top.y);
          grad.addColorStop(0, 'rgba(255,180,0,0.35)');
          grad.addColorStop(1, 'rgba(255,180,0,0)');
          ctx.strokeStyle = grad;
          ctx.lineWidth = Math.max(3, 1.2 * centre.s);
          ctx.beginPath();
          ctx.moveTo(centre.x, centre.y);
          ctx.lineTo(top.x, top.y);
          ctx.stroke();
        }
      }
    }
  }

  drawClouds() {
    const ctx = this.ctx;
    const sorted = this.clouds
      .map((c) => ({ c, d: Math.hypot(c.x - this.cam.x, c.y - this.cam.y, c.z - this.cam.z) }))
      .filter((e) => e.d < 1600)
      .sort((a, b) => b.d - a.d);
    for (const { c, d } of sorted) {
      const p = this.project(c.x, c.y, c.z);
      if (!p) continue;
      const s = c.s * p.s;
      if (s < 4) continue;
      ctx.fillStyle = c.dark ? 'rgba(52,48,72,0.8)' : 'rgba(255,244,230,0.62)';
      for (const [ox, oy, r] of [[-0.5, 0.1, 0.55], [0, -0.12, 0.7], [0.5, 0.08, 0.5], [0.1, 0.15, 0.6]]) {
        ctx.beginPath();
        ctx.ellipse(p.x + ox * s, p.y + oy * s, r * s, r * s * 0.55, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  drawBirds(game, time) {
    const ctx = this.ctx;
    ctx.strokeStyle = 'rgba(30,28,34,0.9)';
    ctx.lineWidth = 2;
    for (const flock of game.birds) {
      const t = ((time * flock.speed + flock.offset) % 640) - 320;
      const bx = flock.fromX < 0 ? t : -t;
      for (let i = 0; i < flock.count; i += 1) {
        const ox = (i - flock.count / 2) * 7;
        const oy = Math.sin(time * 3 + flock.phase + i) * 1.5;
        const p = this.project(bx + ox, flock.y + oy, flock.z);
        if (!p || p.z > 500) continue;
        const w = clamp(2.2 * p.s, 2, 22);
        const flap = Math.sin(time * 9 + flock.phase + i * 1.3) * w * 0.45;
        ctx.beginPath();
        ctx.moveTo(p.x - w, p.y - flap);
        ctx.lineTo(p.x, p.y);
        ctx.lineTo(p.x + w, p.y - flap);
        ctx.stroke();
      }
    }
  }

  drawPlaneShadow(game) {
    const ctx = this.ctx;
    const p = game.plane;
    const ground = groundHeight(p.x, p.z);
    const shadow = this.project(p.x, ground + 0.5, p.z);
    if (!shadow) return;
    const rx = Math.max(4, (PLANE.wingspan * shadow.s) / 2);
    ctx.fillStyle = 'rgba(20,24,20,0.25)';
    ctx.beginPath();
    ctx.ellipse(shadow.x, shadow.y, rx, rx * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // The bush plane from behind and above: cream wings with red tips, a red
  // stripe down the fuselage, tailplane, fin and wingtip nav lights.
  drawPlane(game, time) {
    const ctx = this.ctx;
    const p = game.plane;
    const pos = this.project(p.x, p.y, p.z);
    if (!pos) return;
    const w = PLANE.wingspan * pos.s;
    const h = w * 0.62;
    ctx.save();
    ctx.translate(pos.x, pos.y - p.pitch * 30);
    ctx.rotate(p.roll * 0.85);
    const propSpin = time * 40;
    // Spinning prop disc, seen edge-on past the nose.
    ctx.fillStyle = 'rgba(205,225,255,0.13)';
    ctx.beginPath();
    ctx.ellipse(0, -h * 0.44, w * 0.035, h * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(230,240,255,0.4)';
    ctx.lineWidth = Math.max(1, w * 0.006);
    ctx.beginPath();
    ctx.moveTo(0, -h * 0.44 - h * 0.2 * Math.cos(propSpin));
    ctx.lineTo(0, -h * 0.44 + h * 0.2 * Math.cos(propSpin));
    ctx.stroke();
    // Main wings.
    ctx.fillStyle = '#f2e8d5';
    ctx.beginPath();
    ctx.moveTo(-w / 2, h * 0.02);
    ctx.quadraticCurveTo(-w * 0.28, -h * 0.16, -w * 0.06, -h * 0.1);
    ctx.lineTo(w * 0.06, -h * 0.1);
    ctx.quadraticCurveTo(w * 0.28, -h * 0.16, w / 2, h * 0.02);
    ctx.quadraticCurveTo(w * 0.3, h * 0.1, w * 0.05, h * 0.08);
    ctx.lineTo(-w * 0.05, h * 0.08);
    ctx.quadraticCurveTo(-w * 0.3, h * 0.1, -w / 2, h * 0.02);
    ctx.closePath();
    ctx.fill();
    // Red wingtips.
    ctx.fillStyle = '#c0392b';
    ctx.beginPath();
    ctx.moveTo(-w / 2, h * 0.02);
    ctx.quadraticCurveTo(-w * 0.44, -h * 0.12, -w * 0.36, -h * 0.08);
    ctx.lineTo(-w * 0.36, h * 0.06);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(w / 2, h * 0.02);
    ctx.quadraticCurveTo(w * 0.44, -h * 0.12, w * 0.36, -h * 0.08);
    ctx.lineTo(w * 0.36, h * 0.06);
    ctx.closePath();
    ctx.fill();
    // Fuselage, seen from behind.
    ctx.fillStyle = '#f2e8d5';
    ctx.beginPath();
    ctx.roundRect(-w * 0.045, -h * 0.28, w * 0.09, h * 0.52, w * 0.04);
    ctx.fill();
    ctx.fillStyle = '#c0392b';
    ctx.fillRect(-w * 0.012, -h * 0.28, w * 0.024, h * 0.52);
    // Tailplane and fin.
    ctx.fillStyle = '#e8dcc4';
    ctx.beginPath();
    ctx.moveTo(-w * 0.2, h * 0.2);
    ctx.lineTo(w * 0.2, h * 0.2);
    ctx.lineTo(w * 0.14, h * 0.3);
    ctx.lineTo(-w * 0.14, h * 0.3);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#c0392b';
    ctx.beginPath();
    ctx.moveTo(0, -h * 0.28);
    ctx.lineTo(-w * 0.03, -h * 0.02);
    ctx.lineTo(w * 0.03, -h * 0.02);
    ctx.closePath();
    ctx.fill();
    // Nav lights: red on the port (screen right, seen from behind), green
    // starboard, white strobe blinking at the tail.
    ctx.fillStyle = '#ff2d2d';
    ctx.beginPath();
    ctx.arc(w * 0.48, h * 0.02, Math.max(2, w * 0.012), 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2dff7a';
    ctx.beginPath();
    ctx.arc(-w * 0.48, h * 0.02, Math.max(2, w * 0.012), 0, Math.PI * 2);
    ctx.fill();
    if (Math.sin(time * 4) > 0.2) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, h * 0.3, Math.max(2, w * 0.012), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // ---- Cockpit view: lit instruments over the windshield ----
  drawCockpit(game, time) {
    const ctx = this.ctx;
    const { W, H } = this;
    const p = game.plane;
    // Prop blur ahead of the nose: a faint disc, just enough to sell spin.
    ctx.fillStyle = 'rgba(210,228,255,0.06)';
    ctx.beginPath();
    ctx.ellipse(W / 2, H * 0.34, 80, 110, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(235,242,255,0.30)';
    ctx.lineWidth = 3;
    const a = time * 42;
    ctx.beginPath();
    ctx.moveTo(W / 2 - Math.sin(a) * 70, H * 0.34 - Math.cos(a) * 100);
    ctx.lineTo(W / 2 + Math.sin(a) * 70, H * 0.34 + Math.cos(a) * 100);
    ctx.stroke();
    // Windshield pillars.
    ctx.strokeStyle = '#1c1e26';
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.moveTo(W * 0.06, H);
    ctx.lineTo(W * 0.3, 0);
    ctx.moveTo(W * 0.94, H);
    ctx.lineTo(W * 0.7, 0);
    ctx.stroke();
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(0, H * 0.06);
    ctx.lineTo(W, H * 0.06);
    ctx.stroke();
    // Dashboard panel.
    const panelY = H * 0.66;
    const grad = ctx.createLinearGradient(0, panelY, 0, H);
    grad.addColorStop(0, '#2a2d38');
    grad.addColorStop(1, '#14161d');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(0, H);
    ctx.lineTo(0, panelY + 26);
    ctx.quadraticCurveTo(W / 2, panelY - 14, W, panelY + 26);
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#454a58';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, panelY + 26);
    ctx.quadraticCurveTo(W / 2, panelY - 14, W, panelY + 26);
    ctx.stroke();

    const cx = W / 2;
    const cy = panelY + (H - panelY) / 2 + 6;
    this.drawAttitude(cx, cy, 62, p);
    this.drawDial(cx - 150, cy, 52, 'KTS', p.speed * 1.944, 0, 140, '#5ec8f2');
    this.drawDial(cx + 150, cy, 52, 'FT', p.y * 3.281, 0, 1200, '#ffd166');
    this.drawCompassTape(p.heading);
    this.drawFuelThrottle(game, W - 120, panelY + 18);
    // Warning lights, told apart by colour and position.
    this.drawWarning(W - 260, panelY + 20, 'STALL', '#ff3b30', p.stalled && Math.sin(time * 8) > 0);
    this.drawWarning(W - 260, panelY + 52, 'FUEL', '#ffb400', game.fuel < 25 && Math.sin(time * 6) > 0);
    this.drawWarning(W - 260, panelY + 84, 'DAMAGE', '#ff7a3c', game.damage >= 50);
  }

  drawAttitude(cx, cy, r, p) {
    const ctx = this.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(cx, cy);
    ctx.rotate(-p.roll);
    ctx.translate(0, p.pitch * r * 1.4);
    ctx.fillStyle = '#4a7ec2';
    ctx.fillRect(-r, -r * 2, r * 2, r * 2);
    ctx.fillStyle = '#6b4a2f';
    ctx.fillRect(-r, 0, r * 2, r * 2);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-r, 0);
    ctx.lineTo(r, 0);
    ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = '#d8dce6';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    // Fixed aircraft symbol.
    ctx.strokeStyle = '#ffd166';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx - 22, cy);
    ctx.lineTo(cx - 6, cy);
    ctx.moveTo(cx + 6, cy);
    ctx.lineTo(cx + 22, cy);
    ctx.moveTo(cx, cy - 4);
    ctx.lineTo(cx, cy + 4);
    ctx.stroke();
    ctx.fillStyle = '#d8dce6';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('ATT', cx, cy + r + 14);
  }

  drawDial(cx, cy, r, label, value, min, max, colour) {
    const ctx = this.ctx;
    ctx.fillStyle = '#101218';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#454a58';
    ctx.lineWidth = 2;
    ctx.stroke();
    for (let i = 0; i <= 10; i += 1) {
      const a = Math.PI * 0.75 + (i / 10) * Math.PI * 1.5;
      const x1 = cx + Math.cos(a) * (r - 6);
      const y1 = cy + Math.sin(a) * (r - 6);
      const x2 = cx + Math.cos(a) * (r - 14);
      const y2 = cy + Math.sin(a) * (r - 14);
      ctx.strokeStyle = '#8a90a0';
      ctx.lineWidth = i % 5 === 0 ? 2.5 : 1;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
    const frac = clamp((value - min) / (max - min), 0, 1);
    const na = Math.PI * 0.75 + frac * Math.PI * 1.5;
    ctx.strokeStyle = colour;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(na) * (r - 10), cy + Math.sin(na) * (r - 10));
    ctx.stroke();
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e8eaf0';
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(String(Math.round(value)), cx, cy + r * 0.45);
    ctx.fillStyle = '#9aa0b0';
    ctx.font = 'bold 10px system-ui, sans-serif';
    ctx.fillText(label, cx, cy + r + 14);
  }

  drawCompassTape(headingDeg) {
    const ctx = this.ctx;
    const { W } = this;
    const hdg = ((headingDeg * 180) / Math.PI % 360 + 360) % 360;
    const cx = W / 2;
    const top = 46;
    ctx.fillStyle = 'rgba(16,18,24,0.72)';
    ctx.fillRect(cx - 190, top - 16, 380, 34);
    ctx.strokeStyle = '#454a58';
    ctx.strokeRect(cx - 190, top - 16, 380, 34);
    const names = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
    for (let d = -120; d <= 120; d += 15) {
      const deg = Math.round((hdg + d) / 15) * 15;
      const norm = ((deg % 360) + 360) % 360;
      const x = cx + (d / 120) * 185;
      const major = norm % 45 === 0;
      ctx.strokeStyle = major ? '#e8eaf0' : '#8a90a0';
      ctx.lineWidth = major ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(x, top + 12);
      ctx.lineTo(x, top + (major ? 2 : 7));
      ctx.stroke();
      if (major) {
        ctx.fillStyle = '#e8eaf0';
        ctx.font = 'bold 11px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(names[norm] ?? String(norm), x, top - 2);
      }
    }
    ctx.fillStyle = '#ffd166';
    ctx.beginPath();
    ctx.moveTo(cx - 6, top + 18);
    ctx.lineTo(cx + 6, top + 18);
    ctx.lineTo(cx, top + 26);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffd166';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(String(Math.round(hdg)).padStart(3, '0'), cx, top + 42);
  }

  drawFuelThrottle(game, x, y) {
    const ctx = this.ctx;
    // Fuel bar, green to amber to red.
    ctx.fillStyle = '#101218';
    ctx.fillRect(x, y, 18, 86);
    const fuelH = 86 * (game.fuel / 100);
    ctx.fillStyle = game.fuel > 50 ? '#3ddc84' : game.fuel > 25 ? '#ffb400' : '#ff3b30';
    ctx.fillRect(x + 2, y + 86 - fuelH, 14, fuelH);
    ctx.fillStyle = '#e8eaf0';
    ctx.font = 'bold 10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('FUEL', x + 9, y + 100);
    // Throttle lever position.
    ctx.fillStyle = '#101218';
    ctx.fillRect(x + 34, y, 18, 86);
    ctx.fillStyle = '#5ec8f2';
    const thY = y + 86 - 86 * game.throttle;
    ctx.fillRect(x + 36, thY - 4, 14, 8);
    ctx.fillStyle = '#e8eaf0';
    ctx.fillText('THR', x + 43, y + 100);
  }

  drawWarning(x, y, label, colour, on) {
    const ctx = this.ctx;
    ctx.fillStyle = on ? colour : '#2a2d38';
    ctx.beginPath();
    ctx.arc(x, y, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#454a58';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = on ? colour : '#6a7080';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(label, x + 14, y + 4);
  }

  // ---- HUD ----
  drawHUD(game, time) {
    const ctx = this.ctx;
    const { W, H } = this;
    const p = game.plane;
    const hdg = ((p.heading * 180) / Math.PI % 360 + 360) % 360;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    // Top-left instrument block: altitude, speed, heading.
    this.hudPanel(16, 16, 250, 108);
    ctx.fillStyle = '#9aa0b0';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.fillText('ALT', 30, 38);
    ctx.fillText('SPD', 30, 70);
    ctx.fillText('HDG', 30, 102);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 26px system-ui, sans-serif';
    ctx.fillText(`${Math.round(p.y * 3.281)} ft`, 92, 40);
    ctx.fillText(`${Math.round(p.speed * 1.944)} kt`, 92, 72);
    ctx.fillText(`${String(Math.round(hdg)).padStart(3, '0')}°`, 92, 104);
    // Top-right mission block: time, fuel, rings, score.
    this.hudPanel(W - 266, 16, 250, 108);
    ctx.fillStyle = '#9aa0b0';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.fillText('TIME', W - 252, 38);
    ctx.fillText('FUEL', W - 252, 70);
    ctx.fillText('RINGS', W - 252, 102);
    ctx.fillStyle = game.timeLeft < 30 ? '#ff5a4e' : '#ffffff';
    ctx.font = 'bold 26px system-ui, sans-serif';
    const mm = Math.floor(game.timeLeft / 60);
    const ss = Math.floor(game.timeLeft % 60);
    ctx.fillText(`${mm}:${String(ss).padStart(2, '0')}`, W - 178, 40);
    ctx.fillStyle = game.fuel > 50 ? '#3ddc84' : game.fuel > 25 ? '#ffb400' : '#ff5a4e';
    ctx.fillRect(W - 178, 56, 120 * (game.fuel / 100), 16);
    ctx.strokeStyle = '#454a58';
    ctx.strokeRect(W - 178, 56, 120, 16);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`${game.ringsHit}/${RINGS.length}`, W - 178, 104);
    ctx.fillStyle = '#ffd166';
    ctx.font = 'bold 20px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`${game.score} PTS`, W - 16, 104);
    ctx.textAlign = 'left';
    // Next-ring distance and an edge arrow when it is off screen.
    // In the cockpit the compass tape sits at the top, so the line drops
    // below it instead of printing over it.
    const ring = game.nextRing();
    if (ring) {
      const dist = Math.hypot(ring.x - p.x, ring.y - p.y, ring.z - p.z);
      ctx.fillStyle = '#ffb400';
      ctx.font = 'bold 16px system-ui, sans-serif';
      ctx.textAlign = 'center';
      const ringY = game.camera === 'cockpit' ? 96 : 44;
      ctx.fillText(`RING ${game.ringsHit + 1} — ${Math.round(dist)} m`, W / 2, ringY);
      const rp = this.project(ring.x, ring.y, ring.z);
      if (rp && (rp.x < 40 || rp.x > W - 40 || rp.y < 60 || rp.y > H - 60)) {
        const ax = clamp(rp.x, 60, W - 60);
        const ay = clamp(rp.y, 80, H - 80);
        const ang = Math.atan2(rp.y - ay, rp.x - ax);
        ctx.save();
        ctx.translate(ax, ay);
        ctx.rotate(ang);
        ctx.fillStyle = '#ffb400';
        ctx.beginPath();
        ctx.moveTo(14, 0);
        ctx.lineTo(-8, -9);
        ctx.lineTo(-8, 9);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      ctx.textAlign = 'left';
    } else if (game.mode === MODE_PLAY) {
      ctx.fillStyle = '#3ddc84';
      ctx.font = 'bold 16px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('ALL RINGS — LAND ON THE FAR STRIP', W / 2, game.camera === 'cockpit' ? 96 : 44);
      ctx.textAlign = 'left';
    }
    // Warnings, centre screen.
    let wy = 76;
    if (p.stalled && game.mode === MODE_PLAY) {
      this.warningText('STALL — PUSH THE NOSE DOWN', wy, Math.sin(time * 10) > 0);
      wy += 30;
    }
    if (game.fuel <= 0 && game.mode === MODE_PLAY) {
      this.warningText('ENGINE OUT — GLIDE TO THE STRIP', wy, true);
      wy += 30;
    }
    if (game.fuel > 0 && game.fuel < 25 && game.mode === MODE_PLAY) {
      this.warningText('LOW FUEL', wy, Math.sin(time * 6) > 0);
      wy += 30;
    }
    if (inStorm(p.x, p.z)) {
      this.warningText('STORM — TURBULENCE', wy, true);
      wy += 30;
    } else if (p.z > 2600 && p.z < STORM.z0 && game.mode === MODE_PLAY) {
      this.warningText('STORM CELL AHEAD — CLIMB OR SKIRT IT', wy, false);
    }
    // Controls hint, early in the flight.
    if (game.mode === MODE_PLAY && game.time < 12) {
      ctx.fillStyle = 'rgba(232,234,240,0.85)';
      ctx.font = '15px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('↑↓ pitch · ←→ bank · Shift throttle up · Ctrl throttle down · C camera · M sound', W / 2, H - 18);
      ctx.textAlign = 'left';
    }
  }

  hudPanel(x, y, w, h) {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(12,14,20,0.62)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(120,128,150,0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w, h);
  }

  warningText(text, y, visible) {
    if (!visible) return;
    const ctx = this.ctx;
    ctx.fillStyle = '#ff3b30';
    ctx.font = 'bold 20px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(text, this.W / 2, y);
    ctx.textAlign = 'left';
  }

  drawMessages(game) {
    // The win and crash panels carry their own text; notices stay off them.
    if (game.mode === MODE_WIN || game.mode === MODE_CRASH) return;
    const ctx = this.ctx;
    ctx.textAlign = 'center';
    let y = this.H * 0.62;
    for (const m of game.messages) {
      if (game.time > m.until) continue;
      ctx.fillStyle = 'rgba(12,14,20,0.6)';
      const w = ctx.measureText(m.text).width + 28;
      ctx.fillRect(this.W / 2 - w / 2, y - 20, w, 28);
      ctx.fillStyle = '#ffd166';
      ctx.font = 'bold 16px system-ui, sans-serif';
      ctx.fillText(m.text, this.W / 2, y);
      y += 34;
    }
    ctx.textAlign = 'left';
  }

  // ---- Screens ----
  panel(cx, cy, w, h) {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(10,12,18,0.78)';
    ctx.fillRect(cx - w / 2, cy - h / 2, w, h);
    ctx.strokeStyle = 'rgba(255,180,0,0.7)';
    ctx.lineWidth = 2;
    ctx.strokeRect(cx - w / 2, cy - h / 2, w, h);
  }

  drawTitle(game) {
    const ctx = this.ctx;
    const { W, H } = this;
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, 'rgba(10,12,26,0.25)');
    grad.addColorStop(1, 'rgba(10,12,26,0.55)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd166';
    ctx.font = 'bold 64px system-ui, sans-serif';
    ctx.fillText('MERIDIAN RUN', W / 2, H * 0.24);
    ctx.fillStyle = '#ffffff';
    ctx.font = '22px system-ui, sans-serif';
    ctx.fillText('A bush-plane time trial through the Meridian valley', W / 2, H * 0.24 + 38);
    this.panel(W / 2, H * 0.5, 560, 190);
    ctx.fillStyle = '#e8eaf0';
    ctx.font = '17px system-ui, sans-serif';
    const lines = [
      'Thread all 8 rings against the clock — each ring buys +8 s and fuel.',
      'Mind the storm cell past ring 4, and the birds crossing the valley.',
      'Then put her down on the far strip to bank your time bonus.',
      '',
      '↑ ↓ pitch      ← → bank      Shift / Ctrl throttle      C camera      M sound',
      'Mouse steers too.  P pauses.',
    ];
    lines.forEach((line, i) => ctx.fillText(line, W / 2, H * 0.5 - 62 + i * 26));
    ctx.fillStyle = '#ffd166';
    ctx.font = 'bold 24px system-ui, sans-serif';
    ctx.fillText('Press ENTER or click to fly', W / 2, H * 0.5 + 118);
    ctx.fillStyle = 'rgba(232,234,240,0.7)';
    ctx.font = '14px system-ui, sans-serif';
    ctx.fillText('Meridian Run — an original game. No network, no downloads, just the valley.', W / 2, H - 24);
    ctx.textAlign = 'left';
  }

  drawWin(game) {
    const ctx = this.ctx;
    const { W, H } = this;
    const s = game.winStats;
    this.panel(W / 2, H * 0.38, 520, 340);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#3ddc84';
    ctx.font = 'bold 44px system-ui, sans-serif';
    ctx.fillText('MISSION COMPLETE', W / 2, H * 0.38 - 118);
    ctx.fillStyle = '#e8eaf0';
    ctx.font = '19px system-ui, sans-serif';
    const rows = [
      ['Rings threaded', `${s.rings} / ${RINGS.length}`],
      ['Time left', `${Math.floor(s.timeLeft / 60)}:${String(Math.floor(s.timeLeft % 60)).padStart(2, '0')}  (+${s.timeBonus} pts)`],
      ['Fuel left', `${Math.round(s.fuel)}%  (+${s.fuelBonus} pts)`],
      ['Landing', `${Math.round(s.landingQuality * 100)}% smooth  (+${s.landingBonus} pts)`],
      ['Flight time', `${Math.round(s.flightTime)} s`],
    ];
    rows.forEach((row, i) => {
      const y = H * 0.38 - 66 + i * 32;
      ctx.textAlign = 'left';
      ctx.fillText(row[0], W / 2 - 220, y);
      ctx.textAlign = 'right';
      ctx.fillText(row[1], W / 2 + 220, y);
    });
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd166';
    ctx.font = 'bold 34px system-ui, sans-serif';
    ctx.fillText(`${s.score} PTS`, W / 2, H * 0.38 + 108);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 20px system-ui, sans-serif';
    ctx.fillText('Press R to fly again', W / 2, H * 0.38 + 146);
    ctx.textAlign = 'left';
  }

  drawCrash(game) {
    const ctx = this.ctx;
    const { W, H } = this;
    this.panel(W / 2, H * 0.38, 560, 250);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff5a4e';
    ctx.font = 'bold 44px system-ui, sans-serif';
    ctx.fillText('CRASHED', W / 2, H * 0.38 - 72);
    ctx.fillStyle = '#e8eaf0';
    ctx.font = '19px system-ui, sans-serif';
    const words = game.crashReason.split(' ');
    let line = '';
    const lines = [];
    for (const word of words) {
      if ((line + ' ' + word).trim().length > 52) {
        lines.push(line.trim());
        line = word;
      } else line += ' ' + word;
    }
    lines.push(line.trim());
    lines.forEach((l, i) => ctx.fillText(l, W / 2, H * 0.38 - 28 + i * 26));
    ctx.fillStyle = '#ffd166';
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.fillText(`Rings ${game.ringsHit}/${RINGS.length}   ·   ${game.score} PTS`, W / 2, H * 0.38 + 62);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 20px system-ui, sans-serif';
    ctx.fillText('Press R to try again', W / 2, H * 0.38 + 100);
    ctx.textAlign = 'left';
  }

  drawPaused() {
    const ctx = this.ctx;
    const { W, H } = this;
    ctx.fillStyle = 'rgba(10,12,18,0.5)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 40px system-ui, sans-serif';
    ctx.fillText('PAUSED', W / 2, H / 2);
    ctx.font = '19px system-ui, sans-serif';
    ctx.fillText('Press P to resume', W / 2, H / 2 + 36);
    ctx.textAlign = 'left';
  }
}
