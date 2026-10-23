// blueprints.js — Meikku's proposals, drawn as dashed outlines round the clay.
//
// Thesis guard ("Proposals, Not A Single Goal"): a blueprint here is NOT a
// final form the system optimises toward. It is Meikku's current, visible,
// switchable proposal — the player can change it at any moment, and when the
// player keeps working against it, Meikku puts the proposal down. The three
// shapes are the same classic vessels that sit finished on the table: what
// the lump could become next.
//
// Each shape exists twice — once in JS (the director reads it, the
// help/hinder sensor measures against it) and once in GLSL (the renderer
// draws its dashed ghost). KEEP THE TWO IN SYNC; they are the same functions.
// All coordinates are FIELD space: the ghost turns with the turntable.

export const BLUEPRINTS = [
  { id: 0, key: 'pot',  zh: '盆', en: 'pot' },
  { id: 1, key: 'vase', zh: '瓶', en: 'vase' },
  { id: 2, key: 'cup',  zh: '杯', en: 'cup' },
];

// signed distance (approximate) from p to blueprint `id`, field space
export function bpSDF(id, x, y, z) {
  if (id === 0) {
    // 盆: the flowerpot — a frustum, wider at the rim. The single most
    // recognisable pottery profile there is; it matches the table prop.
    const ry = 0.30 + 0.55 * (y + 0.56);     // radius grows with height
    const wall = (Math.hypot(x, z) - ry) * 0.87;
    const cap = Math.max(y - 0.10, -0.56 - y);
    return Math.max(wall, cap);
  }
  if (id === 1) {
    // the vase: belly, shoulder, lip — the prop vase grown to lump size
    const belly = Math.hypot(x, y + 0.10, z) - 0.60;
    const shoulder = Math.hypot(x, y - 0.38, z) - 0.34;
    const lip = Math.hypot(x, y - 0.64, z) - 0.19;
    return Math.min(belly, Math.min(shoulder, lip));
  }
  // the cup: a rounded squat cylinder
  const rxz = Math.hypot(x, z) - 0.46;
  const ry = Math.abs(y + 0.20) - 0.34;
  const ox = Math.max(rxz, 0), oy = Math.max(ry, 0);
  return Math.min(Math.max(rxz, ry), 0) + Math.hypot(ox, oy) - 0.04;
}

// the same three shapes for the fragment shader
export const BP_GLSL = /* glsl */ `
float bpSDF(vec3 p, int id) {
  if (id == 0) {
    float ry = 0.30 + 0.55 * (p.y + 0.56);
    float wall = (length(p.xz) - ry) * 0.87;
    float cap = max(p.y - 0.10, -0.56 - p.y);
    return max(wall, cap);
  }
  if (id == 1) {
    float belly = length(vec3(p.x, p.y + 0.10, p.z)) - 0.60;
    float shoulder = length(vec3(p.x, p.y - 0.38, p.z)) - 0.34;
    float lip = length(vec3(p.x, p.y - 0.64, p.z)) - 0.19;
    return min(belly, min(shoulder, lip));
  }
  float rxz = length(p.xz) - 0.46;
  float ry = abs(p.y + 0.20) - 0.34;
  vec2 o2 = vec2(max(rxz, 0.0), max(ry, 0.0));
  return min(max(rxz, ry), 0.0) + length(o2) - 0.04;
}
`;
