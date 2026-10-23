// camera.js — orbit camera plus the small amount of matrix maths the game needs.
// The renderer builds rays from the camera basis; the character layer needs a
// view-projection matrix to place a DOM body in the same space as the form.

export class OrbitCamera {
  constructor() {
    this.target = [0, 0, 0];
    this.yaw = 0.62;
    this.pitch = 0.30;
    this.dist = 3.05;
    this.fov = 0.62;         // radians, vertical
    this.aspect = 1;
    this.eye = [0, 0, 3];
    this.right = [1, 0, 0];
    this.up = [0, 1, 0];
    this.fwd = [0, 0, -1];
    this.viewProj = new Float32Array(16);
    this._yawV = 0; this._pitchV = 0;
    this.update();
  }

  orbit(dx, dy) {
    this.yaw -= dx;
    this.pitch = clamp(this.pitch + dy, -1.32, 1.32);
    this.update();
  }

  zoom(f) { this.dist = clamp(this.dist * f, 1.9, 5.2); this.update(); }

  // a small, interruptible nudge — used when Meikku brings attention somewhere
  nudgeToward(p, k = 0.05) {
    const wantYaw = Math.atan2(p[0], p[2]);
    const wantPitch = clamp(Math.asin(clamp(p[1] / (Math.hypot(...p) || 1), -1, 1)) * 0.7, -0.9, 0.9);
    let dy = wantYaw - this.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    this.yaw += dy * k;
    this.pitch += (wantPitch - this.pitch) * k;
    this.update();
  }

  update() {
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
    this.eye = [
      this.target[0] + this.dist * cp * sy,
      this.target[1] + this.dist * sp,
      this.target[2] + this.dist * cp * cy,
    ];
    this.fwd = norm(sub(this.target, this.eye));
    this.right = norm(cross(this.fwd, [0, 1, 0]));
    this.up = cross(this.right, this.fwd);
    const proj = perspective(this.fov, this.aspect, 0.05, 40);
    const view = lookAt(this.eye, this.target, [0, 1, 0]);
    mul(this.viewProj, proj, view);
  }

  tanHalf() { return Math.tan(this.fov * 0.5); }

  // screen pixel -> world ray
  ray(px, py, w, h) {
    const ndcX = (px / w) * 2 - 1;
    const ndcY = 1 - (py / h) * 2;
    const t = this.tanHalf();
    const d = norm([
      this.fwd[0] + this.right[0] * ndcX * t * this.aspect + this.up[0] * ndcY * t,
      this.fwd[1] + this.right[1] * ndcX * t * this.aspect + this.up[1] * ndcY * t,
      this.fwd[2] + this.right[2] * ndcX * t * this.aspect + this.up[2] * ndcY * t,
    ]);
    return { o: this.eye.slice(), d };
  }

  // world point -> {x, y, behind}
  project(p, w, h) {
    const m = this.viewProj;
    const cx = m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12];
    const cy = m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13];
    const cw = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15];
    const behind = cw <= 0.0001;
    const iw = 1 / (behind ? 0.0001 : cw);
    return { x: (cx * iw * 0.5 + 0.5) * w, y: (0.5 - cy * iw * 0.5) * h, behind, depth: cw };
  }
}

export function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
export function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
export function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
export function scale(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
export function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
export function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
export function norm(a) {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}

function perspective(fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2);
  const nf = 1 / (near - far);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0,
  ]);
}

function lookAt(eye, center, up) {
  const z = norm(sub(eye, center));
  const x = norm(cross(up, z));
  const y = cross(z, x);
  return new Float32Array([
    x[0], y[0], z[0], 0,
    x[1], y[1], z[1], 0,
    x[2], y[2], z[2], 0,
    -dot(x, eye), -dot(y, eye), -dot(z, eye), 1,
  ]);
}

function mul(out, a, b) {
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      out[c * 4 + r] =
        a[0 * 4 + r] * b[c * 4 + 0] +
        a[1 * 4 + r] * b[c * 4 + 1] +
        a[2 * 4 + r] * b[c * 4 + 2] +
        a[3 * 4 + r] * b[c * 4 + 3];
    }
  }
  return out;
}

// Nearest approach of a ray to the clay, projected onto the surface. This is
// what lets a stroke BEGIN just outside the silhouette and smear across it:
// human drags start near the thing, not on a mathematically exact hit.
export function nearestSurface(field, o, d, tMax = 12) {
  let t0 = 0, t1 = tMax;
  for (let a = 0; a < 3; a++) {
    const inv = 1 / (d[a] === 0 ? 1e-8 : d[a]);
    let ta = (-1.2 - o[a]) * inv, tb = (1.2 - o[a]) * inv;
    if (ta > tb) { const s = ta; ta = tb; tb = s; }
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
  }
  if (t1 < t0) return null;
  let t = Math.max(t0, 0.001), best = Infinity, bp = null;
  for (let i = 0; i < 140 && t < t1; i++) {
    const p = [o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t];
    const dist = field.sample(p[0], p[1], p[2]);
    if (dist < best) { best = dist; bp = p; }
    if (dist < 0.0015) break;
    t += Math.max(dist * 0.5, 0.008);
  }
  if (!bp) return null;
  let p = bp;
  for (let i = 0; i < 2; i++) {
    const dv = field.sample(p[0], p[1], p[2]);
    const n = field.normal(p[0], p[1], p[2]);
    p = [p[0] - n[0] * dv, p[1] - n[1] * dv, p[2] - n[2] * dv];
  }
  return { p, dist: Math.max(best, 0) };
}

// CPU sphere trace against the clay — used for picking and for Meikku's own
// look at the form. Same field the shader marches, so what it "sees" is real.
export function traceField(field, o, d, tMax = 12) {
  // enter the [-1,1] box first
  let t0 = 0, t1 = tMax;
  for (let a = 0; a < 3; a++) {
    const inv = 1 / (d[a] === 0 ? 1e-8 : d[a]);
    let ta = (-1 - o[a]) * inv, tb = (1 - o[a]) * inv;
    if (ta > tb) { const s = ta; ta = tb; tb = s; }
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
  }
  if (t1 < t0) return null;
  let t = Math.max(t0, 0.001);
  for (let i = 0; i < 160 && t < t1; i++) {
    const p = [o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t];
    const dist = field.sample(p[0], p[1], p[2]);
    if (dist < 0.0015) {
      return { p, t, n: field.normal(p[0], p[1], p[2]) };
    }
    t += Math.max(dist * 0.55, 0.006);
  }
  return null;
}
