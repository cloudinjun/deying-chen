// field.js — the clay itself.
//
// A signed distance field on a 64^3 grid over the box [-1,1]^3. Negative is
// inside. Every change a player or Meikku makes is a local brush op against
// this array, and every op keeps the voxels it overwrote so it can be undone.
// The material's own behaviour (elastic slump) lives here too, because it has
// to be a rule of the world, not a scripted effect.

import { LANG } from './lines.js?v=23';

export const N = 64;
export const H = 2 / (N - 1);
export const CLAMP = 0.65;

export function idx(i, j, k) { return i + N * (j + N * k); }
export function gridToWorld(i) { return (i / (N - 1)) * 2 - 1; }
export function worldToGrid(x) { return (x + 1) * 0.5 * (N - 1); }

function clampi(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

export class ClayField {
  constructor() {
    this.data = new Float32Array(N * N * N);
    this.version = 0;
    this.dirty = null;          // {i0,j0,k0,i1,j1,k1} pending GPU upload
    this.loaded = [];           // regions still settling (material memory)
  }

  // ---- creation -------------------------------------------------------

  reset(seed = 1) {
    const s = seed * 1.7;
    const d = this.data;
    for (let k = 0; k < N; k++) {
      const z = gridToWorld(k);
      for (let j = 0; j < N; j++) {
        const y = gridToWorld(j);
        for (let i = 0; i < N; i++) {
          const x = gridToWorld(i);
          const r = Math.sqrt(x * x + y * y + z * z);
          // a hand-sized lump, not a maths sphere
          const wob =
            0.085 * Math.sin(2.7 * x + s) * Math.cos(2.2 * y - s * 0.6) +
            0.060 * Math.sin(3.1 * z + s * 1.4) +
            0.042 * Math.cos(3.8 * y + 2.0 * x);
          // A lump that was PUT DOWN: the base flattens where it met the
          // table. It does not hover on a mathematician's sphere.
          const lump = r - (0.58 + wob);
          const cut = -(y + 0.56);
          d[idx(i, j, k)] = clamp(Math.max(lump, cut), -CLAMP, CLAMP);
        }
      }
    }
    this.loaded.length = 0;
    this.markDirty({ i0: 0, j0: 0, k0: 0, i1: N - 1, j1: N - 1, k1: N - 1 });
    this.version++;
  }

  load(arr) {
    this.data.set(arr);
    this.loaded.length = 0;
    this.markDirty({ i0: 0, j0: 0, k0: 0, i1: N - 1, j1: N - 1, k1: N - 1 });
    this.version++;
  }

  // ---- sampling -------------------------------------------------------

  sample(x, y, z) {
    const gx = worldToGrid(x), gy = worldToGrid(y), gz = worldToGrid(z);
    const i = Math.floor(gx), j = Math.floor(gy), k = Math.floor(gz);
    if (i < 0 || j < 0 || k < 0 || i >= N - 1 || j >= N - 1 || k >= N - 1) {
      // outside the block: distance to the block plus a safe margin
      const dx = Math.max(Math.abs(x) - 1, 0);
      const dy = Math.max(Math.abs(y) - 1, 0);
      const dz = Math.max(Math.abs(z) - 1, 0);
      return Math.sqrt(dx * dx + dy * dy + dz * dz) + 0.25;
    }
    const fx = gx - i, fy = gy - j, fz = gz - k;
    const d = this.data;
    const c000 = d[idx(i, j, k)], c100 = d[idx(i + 1, j, k)];
    const c010 = d[idx(i, j + 1, k)], c110 = d[idx(i + 1, j + 1, k)];
    const c001 = d[idx(i, j, k + 1)], c101 = d[idx(i + 1, j, k + 1)];
    const c011 = d[idx(i, j + 1, k + 1)], c111 = d[idx(i + 1, j + 1, k + 1)];
    const x00 = c000 + (c100 - c000) * fx, x10 = c010 + (c110 - c010) * fx;
    const x01 = c001 + (c101 - c001) * fx, x11 = c011 + (c111 - c011) * fx;
    const y0 = x00 + (x10 - x00) * fy, y1 = x01 + (x11 - x01) * fy;
    return y0 + (y1 - y0) * fz;
  }

  normal(x, y, z) {
    const e = H * 0.9;
    const nx = this.sample(x + e, y, z) - this.sample(x - e, y, z);
    const ny = this.sample(x, y + e, z) - this.sample(x, y - e, z);
    const nz = this.sample(x, y, z + e) - this.sample(x, y, z - e);
    const l = Math.hypot(nx, ny, nz) || 1;
    return [nx / l, ny / l, nz / l];
  }

  // ---- brush ----------------------------------------------------------

  boxOf(x, y, z, r) {
    const pad = 1;
    return {
      i0: clampi(Math.floor(worldToGrid(x - r)) - pad, 0, N - 1),
      j0: clampi(Math.floor(worldToGrid(y - r)) - pad, 0, N - 1),
      k0: clampi(Math.floor(worldToGrid(z - r)) - pad, 0, N - 1),
      i1: clampi(Math.ceil(worldToGrid(x + r)) + pad, 0, N - 1),
      j1: clampi(Math.ceil(worldToGrid(y + r)) + pad, 0, N - 1),
      k1: clampi(Math.ceil(worldToGrid(z + r)) + pad, 0, N - 1),
    };
  }

  readBox(box) {
    const w = box.i1 - box.i0 + 1, h = box.j1 - box.j0 + 1, d = box.k1 - box.k0 + 1;
    const out = new Float32Array(w * h * d);
    let n = 0;
    for (let k = box.k0; k <= box.k1; k++)
      for (let j = box.j0; j <= box.j1; j++)
        for (let i = box.i0; i <= box.i1; i++) out[n++] = this.data[idx(i, j, k)];
    return out;
  }

  writeBox(box, arr) {
    let n = 0;
    for (let k = box.k0; k <= box.k1; k++)
      for (let j = box.j0; j <= box.j1; j++)
        for (let i = box.i0; i <= box.i1; i++) this.data[idx(i, j, k)] = arr[n++];
    this.markDirty(box);
    this.version++;
  }

  // op: {tool:'pull'|'press'|'smooth', x,y,z, radius, strength}
  // returns an undo record, or null when the op changed nothing.
  //
  // Clay conserves volume: a press does not delete material, it moves it — the
  // dent is ringed by a bulge of displaced clay, a pull necks slightly at its
  // base. This ring is THE visual signature that says clay rather than foam.
  // Saved fields from before the island guard carry floating crumbs and
  // shards. One pass turns any solid voxel whose whole neighbourhood is air
  // back into air; two passes at load kill the two-voxel islands too.
  sanitize() {
    const d = this.data;
    let fixed = 0;
    for (let k = 1; k < N - 1; k++)
      for (let j = 1; j < N - 1; j++)
        for (let i = 1; i < N - 1; i++) {
          const at = idx(i, j, k);
          if (d[at] >= 0.02) continue;
          const nmin = Math.min(
            d[idx(i - 1, j, k)], d[idx(i + 1, j, k)],
            d[idx(i, j - 1, k)], d[idx(i, j + 1, k)],
            d[idx(i, j, k - 1)], d[idx(i, j, k + 1)]);
          if (nmin > 0.03) { d[at] = 0.04; fixed++; }
        }
    return fixed;
  }

  applyBrush(op) {
    const { x, y, z, radius: r } = op;
    const reach = op.tool === 'smooth' ? r : r * 1.45;
    const box = this.boxOf(x, y, z, reach);
    const before = this.readBox(box);
    const w = box.i1 - box.i0 + 1, h = box.j1 - box.j0 + 1;
    const d = this.data;
    let moved = 0;

    for (let k = box.k0; k <= box.k1; k++) {
      const wz = gridToWorld(k), dz = wz - z;
      for (let j = box.j0; j <= box.j1; j++) {
        const wy = gridToWorld(j), dy = wy - y;
        for (let i = box.i0; i <= box.i1; i++) {
          const wx = gridToWorld(i), dx = wx - x;
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (dist > reach) continue;
          const tn = dist / r;
          const bell = tn < 1 ? (1 - tn * tn) * (1 - tn * tn) : 0;
          const rg = (tn - 1.08) / 0.34;
          const ring = Math.exp(-rg * rg * 2.0);      // displaced material piles here
          const t = 1 - Math.min(1, tn);
          const fall = t * t * (3 - 2 * t);
          const at = idx(i, j, k);
          const prev = d[at];
          let next = prev;
          if (op.tool === 'pull') {
            next = prev - op.strength * (bell - 0.42 * ring);
            // matter grows only FROM matter: a pull may not turn an isolated
            // air voxel solid — that is where the floating crumbs came from
            if (prev > 0.05 && next < 0.02) {
              const nmin = Math.min(
                d[idx(i > 0 ? i - 1 : i, j, k)], d[idx(i < N - 1 ? i + 1 : i, j, k)],
                d[idx(i, j > 0 ? j - 1 : j, k)], d[idx(i, j < N - 1 ? j + 1 : j, k)],
                d[idx(i, j, k > 0 ? k - 1 : k)], d[idx(i, j, k < N - 1 ? k + 1 : k)]);
              if (nmin > 0.03) next = Math.max(next, 0.03);
            }
          }
          else if (op.tool === 'press') next = prev + op.strength * (bell - 0.58 * ring);
          else if (op.tool === 'smooth') {
            if (tn > 1) { continue; }
            // average of the six neighbours read from the untouched copy
            const li = i - box.i0, lj = j - box.j0, lk = k - box.k0;
            let sum = 0, cnt = 0;
            const get = (a, b, c) => {
              if (a < 0 || b < 0 || c < 0 || a >= w || b >= h || c >= (box.k1 - box.k0 + 1)) return null;
              return before[a + w * (b + h * c)];
            };
            for (const o of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
              const v = get(li + o[0], lj + o[1], lk + o[2]);
              if (v !== null) { sum += v; cnt++; }
            }
            if (cnt) next = prev + (sum / cnt - prev) * Math.min(1, op.strength * fall * 14);
          }
          next = clamp(next, -CLAMP, CLAMP);
          d[at] = next;
          moved += Math.abs(next - prev);
        }
      }
    }
    if (moved < 1e-6) return null;
    this.markDirty(box);
    this.version++;
    return { box, before, moved };
  }

  undo(rec) {
    if (!rec) return;
    this.writeBox(rec.box, rec.before);
  }

  // ---- material behaviour --------------------------------------------
  // A strong push loads the clay. Loaded clay keeps moving after the hand
  // leaves: it relaxes and sags. Both sides have to look at the result.

  load_region(x, y, z, r, amount) {
    const hit = this.loaded.find(l =>
      Math.hypot(l.x - x, l.y - y, l.z - z) < r * 0.6);
    if (hit) { hit.amount = Math.min(1, hit.amount + amount); hit.age = 0; return hit; }
    const reg = { x, y, z, r: r * 1.15, amount: Math.min(1, amount), age: 0, life: 1.9, reported: false };
    this.loaded.push(reg);
    return reg;
  }

  // Returns one step per region that visibly moved: {reg, k, rec}. The caller
  // must log `k` — what the clay does on its own is an operation like any
  // other, and a replay that cannot reproduce it is a screen recording, not a
  // replay. `rec` is the undo record for that step.
  settle(dt) {
    if (!this.loaded.length) return [];
    const steps = [];
    for (let n = this.loaded.length - 1; n >= 0; n--) {
      const reg = this.loaded[n];
      reg.age += dt;
      if (reg.age > reg.life || reg.amount < 0.02) { this.loaded.splice(n, 1); continue; }
      const decay = 1 - reg.age / reg.life;
      const k = reg.amount * decay * Math.min(dt, 0.05) * 3.2;
      if (k > 0.0005) steps.push({ reg, k, rec: this.relaxRegion(reg, k) });
    }
    return steps;
  }

  // replaying a logged settle step: same region, same k, same result
  applySettle(op) {
    return this.relaxRegion({ x: op.x, y: op.y, z: op.z, r: op.radius }, op.strength);
  }

  relaxRegion(reg, k) {
    const box = this.boxOf(reg.x, reg.y, reg.z, reg.r);
    const before = this.readBox(box);
    const src = before;
    const w = box.i1 - box.i0 + 1, h = box.j1 - box.j0 + 1, dp = box.k1 - box.k0 + 1;
    const get = (a, b, c) => src[clampi(a, 0, w - 1) + w * (clampi(b, 0, h - 1) + h * clampi(c, 0, dp - 1))];
    const d = this.data;
    const sag = 0.55;  // how much of the relaxation is gravity rather than surface tension

    for (let k2 = 0; k2 < dp; k2++) {
      const wz = gridToWorld(box.k0 + k2), dz = wz - reg.z;
      for (let j = 0; j < h; j++) {
        const wy = gridToWorld(box.j0 + j), dy = wy - reg.y;
        for (let i = 0; i < w; i++) {
          const wx = gridToWorld(box.i0 + i), dx = wx - reg.x;
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (dist > reg.r) continue;
          const t = 1 - dist / reg.r;
          const fall = t * t;
          const here = get(i, j, k2);
          const avg = (get(i + 1, j, k2) + get(i - 1, j, k2) + get(i, j + 1, k2) +
                       get(i, j - 1, k2) + get(i, j, k2 + 1) + get(i, j, k2 - 1)) / 6;
          const above = get(i, j + 1, k2);       // pulling the field down = material sags
          const target = avg * (1 - sag) + above * sag;
          const at = idx(box.i0 + i, box.j0 + j, box.k0 + k2);
          d[at] = clamp(here + (target - here) * Math.min(0.9, k * fall * 6), -CLAMP, CLAMP);
        }
      }
    }
    this.markDirty(box);
    this.version++;
    return { box, before, moved: 0 };
  }

  // ---- bookkeeping ----------------------------------------------------

  markDirty(box) {
    if (!this.dirty) { this.dirty = { ...box }; return; }
    const d = this.dirty;
    d.i0 = Math.min(d.i0, box.i0); d.j0 = Math.min(d.j0, box.j0); d.k0 = Math.min(d.k0, box.k0);
    d.i1 = Math.max(d.i1, box.i1); d.j1 = Math.max(d.j1, box.j1); d.k1 = Math.max(d.k1, box.k1);
  }

  takeDirty() { const d = this.dirty; this.dirty = null; return d; }

  snapshot() { return this.data.slice(); }
}

export function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

// Which named region of the form is this point in? Regions are how both sides
// talk about "there" without coordinates, and what a memory is attached to.
const FACES = [
  { key: 'top',    zh: '上面',   en: 'top' },
  { key: 'bottom', zh: '下面',   en: 'underside' },
  { key: 'front',  zh: '这一面', en: 'near face' },
  { key: 'back',   zh: '背面',   en: 'back' },
  { key: 'left',   zh: '左边',   en: 'left side' },
  { key: 'right',  zh: '右边',   en: 'right side' },
];

export function regionOf(x, y, z) {
  const ax = Math.abs(x), ay = Math.abs(y), az = Math.abs(z);
  let axis = 0;
  if (ay >= ax && ay >= az) axis = 1; else if (az >= ax) axis = 2;
  const sign = axis === 0 ? x : axis === 1 ? y : z;
  const cell = [
    Math.round(clamp(x, -1, 1) * 2),
    Math.round(clamp(y, -1, 1) * 2),
    Math.round(clamp(z, -1, 1) * 2),
  ];
  const f = FACES[axis === 1 ? (sign > 0 ? 0 : 1) : axis === 2 ? (sign > 0 ? 2 : 3) : (sign > 0 ? 5 : 4)];
  return {
    id: `region_${cell[0] + 2}${cell[1] + 2}${cell[2] + 2}`,
    face: f.key,
    zh: f.zh,
    en: f.en,
    label: LANG === 'zh' ? f.zh : f.en,
  };
}
