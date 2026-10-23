// renderer.js — the form on screen.
//
// The clay is drawn by sphere-tracing the same signed distance field the game
// edits, so what you see is the data, not a mesh baked from it. That is what
// makes a local edit show up inside one frame.

import { N } from './field.js?v=23';
import { BP_GLSL } from './blueprints.js?v=23';

const MAX_MARKS = 16;
const MAX_PIXELS = 1.6e6;   // absolute render budget, whatever the display is

const VERT = `#version 300 es
precision highp float;
out vec2 vUv;
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
precision highp sampler3D;

in vec2 vUv;
out vec4 fragColor;

uniform sampler3D uField;
uniform vec3  uCam, uRight, uUp, uFwd;
uniform float uTanHalf, uAspect, uTime, uVoxel, uResY, uScale;
uniform vec4  uCursor;        // xyz + radius, w<0 = off
uniform vec3  uCursorTint;
uniform vec4  uAttn;          // Meikku's attention region
uniform vec4  uPulse;         // xyz + radius of a material pulse, w<0 = off
uniform float uPulseAge;
uniform float uSpin;          // turntable angle: the camera is fixed, the CLAY turns
uniform int   uBp;            // which proposal ghost to draw
uniform vec2  uBpC;           // its centre on screen: dashes are ruled round it
uniform int   uMarkCount;
uniform vec4  uMark[${MAX_MARKS}];      // xyz + radius
uniform vec4  uMarkTint[${MAX_MARKS}];  // rgb + weight

// the march box is wider than the field so the outer keyline, which lives
// just outside the silhouette, is not clipped against the box wall
const float BOX = 1.08;   // room for the pigment that ran past the edge

const vec3 PAPER = vec3(0.988, 0.988, 0.980);
const vec3 GRID  = vec3(0.847, 0.847, 0.827);
const vec3 SLATE = vec3(0.137, 0.137, 0.133);
// Terracotta. Cream read as pastry — nothing said CLAY. Potter's clay is the
// one colour everyone recognises as squeezable earth (the Ring Fit pottery
// minigame is exactly this material).
const vec3 BASE  = vec3(0.886, 0.667, 0.478);
const vec3 TAN   = vec3(0.769, 0.522, 0.345);
const vec3 COCOA = vec3(0.573, 0.365, 0.239);
// the table: cooler, greyer wood so clay and table separate cleanly
const vec3 WOOD1 = vec3(0.796, 0.690, 0.549);
const vec3 WOOD2 = vec3(0.647, 0.541, 0.412);
const float TABLE_Y = -0.575;

// world -> field space: the turntable. One rotation inside fieldAt covers the
// march, the normals, the gradient and the ao without touching any caller.
vec3 toField(vec3 p) {
  float c = cos(uSpin), sn = sin(uSpin);
  return vec3(c * p.x - sn * p.z, p.y, sn * p.x + c * p.z);
}

float fieldAt(vec3 pw) {
  vec3 p = toField(pw);
  vec3 q = clamp(p, vec3(-1.0), vec3(1.0));
  float outside = length(p - q);
  return texture(uField, q * 0.5 + 0.5).r + outside;
}

vec3 fieldNormal(vec3 p) {
  float e = uVoxel * 0.85;
  vec2 k = vec2(1.0, -1.0);
  return normalize(
    k.xyy * fieldAt(p + k.xyy * e) +
    k.yyx * fieldAt(p + k.yyx * e) +
    k.yxy * fieldAt(p + k.yxy * e) +
    k.xxx * fieldAt(p + k.xxx * e));
}

// unnormalised gradient: the brush writes values directly, so |grad| is not 1
// and a distance in field units is not a distance in world units
vec3 fieldGrad(vec3 p) {
  float e = uVoxel * 0.85;
  vec2 k = vec2(1.0, -1.0);
  return (k.xyy * fieldAt(p + k.xyy * e) +
          k.yyx * fieldAt(p + k.yyx * e) +
          k.yxy * fieldAt(p + k.yxy * e) +
          k.xxx * fieldAt(p + k.xxx * e)) / (4.0 * e);
}

${BP_GLSL}

bool boxHit(vec3 ro, vec3 rd, out float t0, out float t1) {
  vec3 inv = 1.0 / rd;
  vec3 a = (vec3(-BOX) - ro) * inv;
  vec3 b = (vec3( BOX) - ro) * inv;
  vec3 lo = min(a, b), hi = max(a, b);
  t0 = max(max(lo.x, lo.y), lo.z);
  t1 = min(min(hi.x, hi.y), hi.z);
  return t1 > max(t0, 0.0);
}

// one hash, three cheap taps — gives the surface a tooth so it reads as clay
// rather than glaze. Perturbs the normal only; never touches fieldAt(), which
// would multiply across all 120 march steps and break the distance bound.
float hash13(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}

float ao(vec3 p, vec3 n) {
  float occ = 0.0, sca = 1.0;
  for (int i = 0; i < 4; i++) {
    float h = 0.014 + 0.055 * float(i);
    float d = fieldAt(p + n * h);
    occ += (h - d) * sca;
    sca *= 0.72;
  }
  return clamp(1.0 - 1.35 * occ, 0.0, 1.0);
}

// Finished terracotta vessels on the table — a tall vase, the flowerpot
// everyone on earth recognises, and a little cup. They are the visual
// sentence "this table makes pottery": you see what the lump can become
// before you touch it. Analytic intersections; the brush can never reach them.
float sphHit(vec3 ro, vec3 rd, vec3 c, float r) {
  vec3 oc = ro - c;
  float b = dot(oc, rd);
  float h = b * b - dot(oc, oc) + r * r;
  if (h < 0.0) return -1.0;
  float t = -b - sqrt(h);
  return t > 0.001 ? t : -1.0;
}

const vec2 VASE_XZ = vec2(-1.65, 0.75);
const vec2 POT_XZ  = vec2(1.62, 0.30);
const vec2 CUP_XZ  = vec2(-1.05, 1.38);
const float POT_Y0 = -0.575;
const float POT_Y1 = -0.255;
const float POT_B  = 0.28125;              // radius(y) = POT_A + POT_B * y
const float POT_A  = 0.3167;               // 0.155 at the base, 0.245 at the rim

float propHit(vec3 ro, vec3 rd, out int outId, out int part) {
  float best = 1e9; outId = 0; part = 0;
  float t;
  // the vase: belly, shoulder, lip — three stacked spheres
  t = sphHit(ro, rd, vec3(VASE_XZ.x, -0.365, VASE_XZ.y), 0.210);
  if (t > 0.0 && t < best) { best = t; outId = 1; part = 0; }
  t = sphHit(ro, rd, vec3(VASE_XZ.x, -0.130, VASE_XZ.y), 0.125);
  if (t > 0.0 && t < best) { best = t; outId = 1; part = 1; }
  t = sphHit(ro, rd, vec3(VASE_XZ.x, 0.010, VASE_XZ.y), 0.070);
  if (t > 0.0 && t < best) { best = t; outId = 1; part = 2; }
  // the flowerpot: a truncated cone, wider at the rim
  {
    vec2 oxz = ro.xz - POT_XZ;
    vec2 dxz = rd.xz;
    float rr0 = POT_A + POT_B * ro.y;
    float rb = POT_B * rd.y;
    float A = dot(dxz, dxz) - rb * rb;
    if (abs(A) > 1e-6) {
      float Bq = dot(oxz, dxz) - rb * rr0;
      float Cq = dot(oxz, oxz) - rr0 * rr0;
      float h = Bq * Bq - A * Cq;
      if (h > 0.0) {
        float rt = sqrt(h);
        for (int k = 0; k < 2; k++) {
          float tt = (-Bq + (k == 0 ? -rt : rt)) / A;
          float yy = ro.y + rd.y * tt;
          if (tt > 0.001 && tt < best && yy > POT_Y0 && yy < POT_Y1) {
            best = tt; outId = 2; part = 0; break;
          }
        }
      }
    }
    // the dark mouth: a disc across the rim
    if (abs(rd.y) > 1e-4) {
      float tt = (POT_Y1 - ro.y) / rd.y;
      if (tt > 0.001 && tt < best) {
        vec2 q = ro.xz + rd.xz * tt - POT_XZ;
        float r1 = POT_A + POT_B * POT_Y1;
        if (dot(q, q) < r1 * r1) { best = tt; outId = 2; part = 1; }
      }
    }
  }
  // the little cup
  t = sphHit(ro, rd, vec3(CUP_XZ.x, -0.475, CUP_XZ.y), 0.100);
  if (t > 0.0 && t < best) { best = t; outId = 3; part = 0; }
  return outId > 0 ? best : -1.0;
}

vec3 propShade(vec3 p, int id, int part, vec3 rd) {
  // the pot's mouth: dark inside, a hint of inner wall toward the edge
  if (id == 2 && part == 1) {
    float r1 = POT_A + POT_B * POT_Y1;
    float rc = length(p.xz - POT_XZ) / r1;
    return mix(COCOA * 0.30, COCOA * 0.55, rc * rc);
  }
  vec3 n;
  if (id == 1) {
    vec3 c = part == 0 ? vec3(VASE_XZ.x, -0.365, VASE_XZ.y)
           : part == 1 ? vec3(VASE_XZ.x, -0.130, VASE_XZ.y)
                       : vec3(VASE_XZ.x, 0.010, VASE_XZ.y);
    n = normalize(p - c);
  } else if (id == 2) {
    vec2 rel = p.xz - POT_XZ;
    float rr = POT_A + POT_B * p.y;
    n = normalize(vec3(rel.x, -POT_B * rr, rel.y));
  } else {
    n = normalize(p - vec3(CUP_XZ.x, -0.475, CUP_XZ.y));
  }

  vec3 key = normalize(vec3(0.42, 0.86, 0.52));
  float lum = max((dot(n, key) + 0.28) / 1.28, 0.0);
  float grain = (hash13(p * 60.0) - 0.5) * 0.08;
  float q = clamp(lum + grain, 0.0, 1.0);
  // fired clay: one shade deeper than the raw lump
  vec3 col = mix(COCOA * 0.90, TAN, smoothstep(0.25, 0.34, q));
  col = mix(col, BASE, smoothstep(0.64, 0.72, q));

  // dark openings on the round vessels
  if (id == 1 && part == 2) col = mix(col, COCOA * 0.30, smoothstep(0.50, 0.80, n.y));
  if (id == 3)              col = mix(col, COCOA * 0.30, smoothstep(0.52, 0.80, n.y));

  // one thin painted band each: the two hands' colours, fired into the glaze
  if (id == 1 && abs(p.y + 0.130) < 0.022) col = mix(col, vec3(0.063, 0.322, 0.800), 0.85);
  if (id == 2 && part == 0 && p.y > POT_Y1 - 0.055) col = mix(col, vec3(0.055, 0.478, 0.259), 0.85);

  // the same pen draws their edges
  float rim = 1.0 - abs(dot(n, -rd));
  col = mix(col, SLATE, smoothstep(0.62, 0.86, rim) * 0.9);
  return col;
}

// The sheet. Screen-space, because the paper does not rotate with the form —
// and a hand-drawn frame is redrawn about nine times a second, not sixty, so
// the grain is quantised in time. At 60Hz it reads as television snow.
float boil() { return floor(uTime * 5.0); }

vec3 paperAt(vec2 cssPx) {
  // dots placed by hand, not by machine: each one drifts inside its cell and
  // no two are quite the same size
  vec2 id = floor((cssPx - 13.0) / 26.0);
  vec2 jit = (vec2(hash13(vec3(id, 1.0)), hash13(vec3(id, 5.0))) - 0.5) * 9.0;
  float rs = 1.0 + hash13(vec3(id, 9.0)) * 0.9;
  vec2 cell = mod(cssPx - 13.0, 26.0) - 13.0 - jit;
  float dotv = 1.0 - smoothstep(rs, rs + 0.9, length(cell));
  vec3 bg = mix(PAPER, GRID, dotv * 0.85);
  float fibre = hash13(vec3(cssPx * 1.7, 0.0)) - 0.5;   // static: the sheet is still
  bg += fibre * 0.012;

  // afternoon in the room: a soft warm patch of light high on the wall, and
  // the corners fall off a little so the table holds the middle
  vec2 res = vec2(uResY * uAspect, uResY);
  vec2 uv = cssPx / res;
  vec2 lp = (uv - vec2(0.76, 0.22)) * vec2(1.0, 1.5);
  float sun = exp(-dot(lp, lp) * 5.5);
  bg += vec3(0.040, 0.030, 0.008) * sun;
  float vig = smoothstep(0.58, 0.92, length(uv - 0.5));
  bg *= 1.0 - vig * 0.055;
  return bg;
}

void main() {
  vec2 cssPx = gl_FragCoord.xy / max(uScale, 0.01);
  vec2 ndc = vUv * 2.0 - 1.0;
  vec3 rd = normalize(uFwd + uRight * ndc.x * uTanHalf * uAspect + uUp * ndc.y * uTanHalf);
  vec3 ro = uCam;

  vec3 col = vec3(0.0);
  float alpha = 0.0;

  float t0, t1;
  bool hit = false;
  vec3 p = vec3(0.0);
  // Closest approach, for the silhouette keyline. Taking the minimum of the
  // per-step samples is not enough: the smallest step is uVoxel*0.42 = 0.0133
  // world units while a pixel is ~0.003, so the true nearest point is stepped
  // straight over and the line breaks up. Estimate it inside the segment.
  float md = 1e9, mdT = 0.0;
  vec3 mdP = vec3(0.0);
  if (boxHit(ro, rd, t0, t1)) {
    float t = max(t0, 0.001);
    float prevD = 1e9;
    for (int i = 0; i < 120; i++) {
      p = ro + rd * t;
      float d = fieldAt(p);
      float y = d * d / (2.0 * prevD);
      float dEst = sqrt(max(d * d - y * y, 0.0));
      // the in-segment estimate is only meaningful on a sane field: on torn
      // ground it manufactures false near-zeros and the pen floods the screen
      if (prevD < 0.5 && d < 0.5 && dEst < md) { md = dEst; mdT = t - y; mdP = ro + rd * mdT; }
      if (d < md) { md = d; mdT = t; mdP = p; }
      if (d < 0.0012) { hit = true; break; }
      prevD = d;
      t += max(d * 0.62, uVoxel * 0.42);
      if (t > t1) break;
    }
  }

  int propId = 0, propPart = 0;
  float tProp = propHit(ro, rd, propId, propPart);
  if (propId > 0 && hit && tProp < mdT) hit = false;      // the prop is in front
  else if (propId > 0 && hit) propId = 0;                 // the form is in front

  if (propId > 0) {
    col = propShade(ro + rd * tProp, propId, propPart, rd);
    alpha = 1.0;
  } else if (hit) {
    vec3 pf = toField(p);      // marks, grain and wobble live ON the clay
    vec3 n = fieldNormal(p);
    // Clay tooth. Only the shading normal is disturbed — ao() and the
    // silhouette keep the clean geometric normal, so the grain cannot eat the
    // outline or speckle the occlusion.
    vec3 g = pf * 74.0;
    vec3 ns = normalize(n + (vec3(hash13(g), hash13(g + 17.3), hash13(g + 41.7)) - 0.5) * 0.08);
    vec3 key = normalize(vec3(0.42, 0.86, 0.52));
    vec3 fill = normalize(vec3(-0.62, 0.18, -0.42));
    // wrap lighting: the terminator softens without a second pass or any samples
    float k = max((dot(ns, key) + 0.28) / 1.28, 0.0);
    float f = max(dot(ns, fill), 0.0) * 0.24;
    float occ = ao(p, n);

    float lum = clamp((0.94 * k + f) * (0.10 + 0.90 * occ), 0.0, 1.0);
    // Crayon, not airbrush: few flat values, and the boundary between them is
    // broken by grain so it reads as something laid down by hand.
    float grain = (hash13(vec3(cssPx * 0.9, 0.0)) + hash13(vec3(cssPx * 2.6, 7.0)) - 1.0) * 0.06;
    float q = clamp(lum + grain, 0.0, 1.0);

    // Three flat values with near-hard jumps, all of them warm. The darkest
    // thing on the whole form is the pen line, never the shading.
    col = mix(COCOA, TAN, smoothstep(0.22, 0.26, q));
    col = mix(col, BASE, smoothstep(0.55, 0.59, q));

    // Who worked here. Hard-edged and saturated: at 0.42 blend on a 0.4 weight
    // this topped out at 17% and decayed to 7% — a stain, not a mark.
    // Pigment settles where the hand pushed: strongest in shade and hollows,
    // thin on the lit crown. A uniform sphere of colour reads as a sticker
    // stuck on the form; this reads as a worked patch.
    // Ink, not stain: each hand's colour covers at full strength with a ragged
    // edge, and carries a small wet highlight so it reads as fresh paint.
    // A face-on dent barely moves the silhouette, and the flat ramp eats the
    // small shading change — so occlusion darkens CONTINUOUSLY. Pressing a
    // hollow into the clay visibly deepens it from any angle.
    col *= 0.80 + 0.20 * occ;

    // Paint, not bruises: the edge sways in big soft lobes. Pixel-scale
    // speckle on a colour boundary reads as mould on flesh.
    float edgeWob = (hash13(floor(pf * 4.0) + 0.5) - 0.5) * 0.12;
    float inkAmt = 0.0;
    for (int i = 0; i < ${MAX_MARKS}; i++) {
      if (i >= uMarkCount) break;
      float d = distance(pf, uMark[i].xyz);
      float rr = uMark[i].w * (1.0 + edgeWob);
      float w = (1.0 - smoothstep(rr * 0.68, rr * 0.84, d)) * uMarkTint[i].a;
      // touched clay reads WET first: the same clay, darker and warmer —
      // a filled colour sphere reads as a bruise or a glass marble. The
      // owner colour survives only as a thin painted contour round the touch.
      vec3 wet = col * vec3(0.64, 0.54, 0.47);
      col = mix(col, wet, w * 0.78);
      col = mix(col, uMarkTint[i].rgb, w * 0.10);
      float contour = (1.0 - smoothstep(rr * 0.80, rr * 0.94, d))
                    * smoothstep(rr * 0.58, rr * 0.74, d);
      col = mix(col, uMarkTint[i].rgb, contour * uMarkTint[i].a * 0.55);
      // the crease: a darker ring where the hand pressed, readable face-on
      float ring = clamp((1.0 - smoothstep(rr * 0.52, rr * 0.76, d))
                       - (1.0 - smoothstep(rr * 0.28, rr * 0.46, d)), 0.0, 1.0);
      col = mix(col, wet * 0.72, ring * uMarkTint[i].a * 0.45);
      inkAmt = max(inkAmt, w);
    }
    float sheen = pow(max(dot(normalize(key - rd), n), 0.0), 22.0);
    col += sheen * inkAmt * 0.26;
    // fingerprint ridges inside fresh presses — fine parallel lines are what
    // say "a finger did this"
    float fp = sin(dot(pf.xy, vec2(96.0, 74.0)) + hash13(floor(pf * 2.5)) * 6.28);
    col *= 1.0 + fp * 0.07 * inkAmt;

    // Meikku's attention: a soft ring that breathes where it is looking
    if (uAttn.w > 0.0) {
      float d = distance(pf, uAttn.xyz);
      float ring = 1.0 - smoothstep(0.0, 0.05, abs(d - uAttn.w * (0.72 + 0.06 * sin(uTime * 2.4))));
      float inside = 1.0 - smoothstep(uAttn.w * 0.2, uAttn.w, d);
      col = mix(col, vec3(0.055, 0.478, 0.259), ring * 0.55 + inside * 0.10);
    }

    // the material asking to be touched
    if (uPulse.w > 0.0) {
      float d = distance(pf, uPulse.xyz);
      float wave = sin(uPulseAge * 4.5 - d * 22.0);
      float band = smoothstep(0.35, 1.0, wave) * (1.0 - smoothstep(0.0, uPulse.w, d));
      col = mix(col, vec3(0.969, 0.776, 0.0), band * 0.42);
    }

    // your own hand
    if (uCursor.w > 0.0) {
      float d = distance(pf, uCursor.xyz);
      float ring = 1.0 - smoothstep(0.0, 0.028, abs(d - uCursor.w * 0.85));
      float inside = 1.0 - smoothstep(uCursor.w * 0.3, uCursor.w * 0.9, d);
      col = mix(col, uCursorTint, ring * 0.75 + inside * 0.12);
    }

    alpha = 1.0;
  } else {
    // Keyline of constant width in CSS pixels, at any zoom. uResY is already
    // divided by the adaptive render scale, so the line does not change
    // thickness when adapt() drops resolution.
    float line = 0.0, bleed = 0.0;
    vec3 bleedCol = SLATE;
    float sd = boil();
    if (md < 1e8) {
      vec3 gv = fieldGrad(mdP);
      float glenRaw = length(gv);
      float glen = max(glenRaw, 0.35);
      float world = md / glen;                   // field units -> world units
      float px = uTanHalf * 2.0 / uResY * max(mdT, 0.001);
      // mdP is the nearest point on the ray, still that far from the skin.
      // Stepping onto the surface makes the noise sit still as the form turns.
      vec3 surfP = mdP - (gv / glen) * world;
      vec3 sf = toField(surfP);                  // the wobble belongs to the clay

      // A drawn line is never one width, and it is redrawn every frame of the
      // animation — hence the boil term. A sparse spike gives the occasional
      // stroke that overshoots instead of merely thickening.
      float n1 = hash13(sf * 4.5 + sd * 0.37);
      float n2 = hash13(sf * 24.0 + sd * 0.19);
      float spike = pow(hash13(sf * 2.1 + sd * 0.11), 8.0) * 2.2;
      float w = 2.2 * (1.0 + 0.60 * n1 + 0.25 * n2 + spike);
      w = max(w, 0.9 / max(uScale, 0.35));       // never thinner than a device pixel
      line = 1.0 - smoothstep(px * w, px * (w + 1.1), world);
      line *= mix(0.74, 1.0, smoothstep(0.10, 0.42, hash13(sf * 3.0 + sd * 0.23)));
      // a chaotic gradient means a tear, not a silhouette — no line there
      line *= smoothstep(0.16, 0.30, glenRaw);

      // Colouring outside the lines. Gated: only the narrow band just outside
      // the silhouette pays for the mark loop, not every background pixel.
      float bleedPx = px * 9.0;
      if (world < bleedPx) {
        for (int i = 0; i < ${MAX_MARKS}; i++) {
          if (i >= uMarkCount) break;
          float d = distance(sf, uMark[i].xyz);
          float mw = 1.0 - smoothstep(uMark[i].w * 0.55, uMark[i].w * 1.05, d);
          if (mw > bleed) { bleed = mw; bleedCol = uMarkTint[i].rgb; }
        }
        float outBand = 1.0 - smoothstep(px * 2.5, bleedPx * (0.5 + n1), world);
        bleed *= outBand * 0.9 * smoothstep(0.25, 0.60, hash13(sf * 8.0 + sd * 0.31));
      }
    }

    col = paperAt(cssPx);

    // The table: a hand-drawn patch of wood under the clay, an uneven oval
    // with a pen outline and wobbly plank lines. It gives the lump a place to
    // sit and a size to be — a thing on a table, not a model in a void.
    float ty = (TABLE_Y - ro.y) / (abs(rd.y) < 1e-5 ? 1e-5 : rd.y);
    if (ty > 0.0 && rd.y < 0.0) {
      vec3 gp = ro + rd * ty;
      float ang = atan(gp.z * 1.35, gp.x);
      float rim = 1.0
        + 0.035 * (hash13(vec3(floor(ang * 5.0), 3.0, 0.0)) - 0.5)
        + 0.02 * sin(ang * 3.0 + 1.7);
      float rr2 = sqrt((gp.x * gp.x) / (2.5 * 2.5) + (gp.z * gp.z) / (1.9 * 1.9));
      float px = uTanHalf * 2.0 / uResY * ty;

      if (rr2 < rim) {
        // planks: flat tones per board, boundaries wobble like a drawn line
        float zl = gp.z * 1.9 + 0.10 * sin(gp.x * 1.4 + 0.8) + 0.05 * sin(gp.x * 3.3);
        float plank = floor(zl);
        float tone = hash13(vec3(plank, 11.0, 0.0));
        vec3 wood = mix(WOOD1, WOOD2, 0.25 + 0.5 * tone);
        // long pencil streaks of grain
        float streak = hash13(vec3(plank, floor(gp.x * 2.1), 4.0));
        wood = mix(wood, WOOD2, smoothstep(0.72, 0.95, streak) * 0.35);
        col = wood;

        // groove lines between boards, in the same pen
        float groove = abs(fract(zl) - 0.5);
        float gl2 = 1.0 - smoothstep(px * 1.4, px * 3.0, (0.5 - groove) / 1.9);
        col = mix(col, SLATE, gl2 * 0.42);

        // pen outline of the table edge
        float edge = 1.0 - smoothstep(px * 1.6, px * 3.6, (rim - rr2) * 1.9);
        col = mix(col, SLATE, edge * 0.85);
      }

      // contact shadows, sitting on the wood
      float sh = (1.0 - smoothstep(0.10, 0.52, length(gp.xz))) * 0.24;
      sh = max(sh, (1.0 - smoothstep(0.17, 0.38, length(gp.xz - VASE_XZ))) * 0.20);
      sh = max(sh, (1.0 - smoothstep(0.13, 0.33, length(gp.xz - POT_XZ))) * 0.20);
      sh = max(sh, (1.0 - smoothstep(0.08, 0.19, length(gp.xz - CUP_XZ))) * 0.20);
      col = mix(col, SLATE, sh * step(rr2, rim));

      // the chosen proposal wears a dashed ring on the wood — the menu is on
      // the table, and this is its "selected" state
      vec2 selXZ = uBp == 0 ? POT_XZ : uBp == 1 ? VASE_XZ : CUP_XZ;
      float selR = uBp == 0 ? 0.36 : uBp == 1 ? 0.31 : 0.18;
      float dsel = abs(length(gp.xz - selXZ) - selR);
      float ringSel = 1.0 - smoothstep(px * 1.6, px * 3.2, dsel);
      float dashS = step(0.35, fract(atan(gp.z - selXZ.y, gp.x - selXZ.x) * 1.9099));
      col = mix(col, SLATE, ringSel * dashS * 0.6 * step(rr2, rim));
    }

    col = mix(col, bleedCol, bleed);
    col = mix(col, SLATE, line);
    alpha = 1.0;
  }

  // ---- the proposal's ghost -------------------------------------------
  // ONE clean dashed profile, the way a pattern sheet draws a vessel: the
  // outline is the ray's closest approach to the blueprint surface (the same
  // technique as the clay's pen keyline, so the width is constant in screen
  // pixels), and the dashes are ruled along the contour in screen space.
  // Interior transparent; hidden where the real clay stands in front.
  {
    vec3 rof = toField(ro);
    vec3 rdf = toField(rd);
    float bt = 0.0, bmd = 1e9, bmdT = 0.0, prevB = 1e9;
    bool bin = false;
    for (int i = 0; i < 44; i++) {
      vec3 bp = rof + rdf * bt;
      float dB = bpSDF(bp, uBp);
      if (dB < 0.004) { bin = true; break; }
      float yB = dB * dB / (2.0 * prevB);
      float est = sqrt(max(dB * dB - yB * yB, 0.0));
      if (prevB < 1e8 && est < bmd) { bmd = est; bmdT = bt - yB; }
      if (dB < bmd) { bmd = dB; bmdT = bt; }
      prevB = dB;
      bt += max(dB * 0.85, 0.012);
      if (bt > 7.0) break;
    }
    if (!bin && bmd < 1e8) {
      float frontT = (propId > 0) ? tProp : (hit ? mdT : 1e9);
      if (bmdT < frontT + 0.02) {
        float pxB = uTanHalf * 2.0 / uResY * max(bmdT, 0.001);
        float lineB = 1.0 - smoothstep(pxB * 2.0, pxB * 3.4, bmd);
        vec2 dc = cssPx - uBpC;
        float dashB = step(0.32, fract(atan(dc.y, dc.x) * 4.138));
        col = mix(col, SLATE, lineB * dashB * 0.55);
      }
    }
  }

  fragColor = vec4(col, 1.0);
}`;

// float -> half, without allocating per value
const _f32 = new Float32Array(1);
const _i32 = new Int32Array(_f32.buffer);
function halfOf(v) {
  _f32[0] = v;
  const x = _i32[0];
  let bits = (x >> 16) & 0x8000;
  let m = (x >> 12) & 0x07ff;
  const e = (x >> 23) & 0xff;
  if (e < 103) return bits;
  if (e > 142) return bits | 0x7c00;
  if (e < 113) { m |= 0x0800; return bits | ((m >> (114 - e)) + ((m >> (113 - e)) & 1)); }
  bits |= ((e - 112) << 10) | (m >> 1);
  return bits + (m & 1);
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', {
      alpha: false, antialias: false, premultipliedAlpha: false,
      preserveDrawingBuffer: false, powerPreference: 'high-performance',
    });
    if (!gl) throw new Error('WebGL2 not available');
    this.gl = gl;

    this.prog = link(gl, VERT, FRAG);
    gl.useProgram(this.prog);
    this.u = {};
    for (const name of ['uField', 'uCam', 'uRight', 'uUp', 'uFwd', 'uTanHalf', 'uAspect',
      'uTime', 'uVoxel', 'uResY', 'uScale', 'uCursor', 'uCursorTint', 'uAttn', 'uPulse', 'uPulseAge',
      'uMarkCount', 'uMark', 'uMarkTint', 'uSpin', 'uBp', 'uBpC']) {
      this.u[name] = gl.getUniformLocation(this.prog, name);
    }

    this.vao = gl.createVertexArray();

    // R16F is 2 bytes per texel, so a dirty box of odd width has rows that are
    // not a multiple of the default 4-byte unpack alignment. texSubImage3D then
    // wants a larger buffer than we pass and rejects the whole upload — the
    // edit simply never reached the GPU until the next full upload.
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.pixelStorei(gl.PACK_ALIGNMENT, 1);   // the same trap on the readPixels side

    this.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_3D, this.tex);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
    gl.texStorage3D(gl.TEXTURE_3D, 1, gl.R16F, N, N, N);

    this.halfFull = new Uint16Array(N * N * N);
    this.halfBox = new Uint16Array(N * N * N);
    this.scale = Math.min(window.devicePixelRatio || 1, 1.5);
    this.markBuf = new Float32Array(MAX_MARKS * 4);
    this.tintBuf = new Float32Array(MAX_MARKS * 4);
    this.frameMs = 16;
  }

  uploadAll(field) {
    const gl = this.gl;
    const src = field.data, dst = this.halfFull;
    for (let i = 0; i < src.length; i++) dst[i] = halfOf(src[i]);
    gl.bindTexture(gl.TEXTURE_3D, this.tex);
    gl.texSubImage3D(gl.TEXTURE_3D, 0, 0, 0, 0, N, N, N, gl.RED, gl.HALF_FLOAT, dst);
  }

  uploadDirty(field) {
    const box = field.takeDirty();
    if (!box) return;
    const w = box.i1 - box.i0 + 1, h = box.j1 - box.j0 + 1, d = box.k1 - box.k0 + 1;
    if (w * h * d > N * N * N * 0.4) { this.uploadAll(field); return; }
    const gl = this.gl, src = field.data, dst = this.halfBox;
    let n = 0;
    for (let k = box.k0; k <= box.k1; k++)
      for (let j = box.j0; j <= box.j1; j++)
        for (let i = box.i0; i <= box.i1; i++)
          dst[n++] = halfOf(src[i + N * (j + N * k)]);
    gl.bindTexture(gl.TEXTURE_3D, this.tex);
    gl.texSubImage3D(gl.TEXTURE_3D, 0, box.i0, box.j0, box.k0, w, h, d,
      gl.RED, gl.HALF_FLOAT, dst.subarray(0, n));
  }

  resize() {
    const c = this.canvas;
    const w = Math.max(1, Math.round(c.clientWidth * this.scale));
    const h = Math.max(1, Math.round(c.clientHeight * this.scale));
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    return c.clientWidth / Math.max(1, c.clientHeight);
  }

  // marks: [{p:[x,y,z], r, color:[r,g,b], weight}]
  draw(cam, state, marks, voxel, time) {
    const gl = this.gl;
    this.resize();
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.prog);
    gl.bindVertexArray(this.vao);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_3D, this.tex);
    gl.uniform1i(this.u.uField, 0);

    gl.uniform3fv(this.u.uCam, cam.eye);
    gl.uniform3fv(this.u.uRight, cam.right);
    gl.uniform3fv(this.u.uUp, cam.up);
    gl.uniform3fv(this.u.uFwd, cam.fwd);
    gl.uniform1f(this.u.uTanHalf, cam.tanHalf());
    gl.uniform1f(this.u.uAspect, cam.aspect);
    gl.uniform1f(this.u.uTime, time);
    gl.uniform1f(this.u.uVoxel, voxel);
    // in CSS pixels, so the keyline keeps its width when adapt() drops scale
    gl.uniform1f(this.u.uResY, this.canvas.height / this.scale);
    gl.uniform1f(this.u.uScale, this.scale);

    gl.uniform1f(this.u.uSpin, state.spin || 0);
    gl.uniform1i(this.u.uBp, state.bp | 0);
    gl.uniform2fv(this.u.uBpC, state.bpC || [0, 0]);
    gl.uniform4fv(this.u.uCursor, state.cursor || [0, 0, 0, -1]);
    gl.uniform3fv(this.u.uCursorTint, state.cursorTint || [0.063, 0.322, 0.800]);
    gl.uniform4fv(this.u.uAttn, state.attn || [0, 0, 0, -1]);
    gl.uniform4fv(this.u.uPulse, state.pulse || [0, 0, 0, -1]);
    gl.uniform1f(this.u.uPulseAge, state.pulseAge || 0);

    const count = Math.min(marks.length, MAX_MARKS);
    for (let i = 0; i < count; i++) {
      const m = marks[i];
      // paint dries by shrinking, at full colour, then it is gone — never a
      // pale stain lingering like a bruise
      const life = Math.min(1, m.weight / 0.85);
      this.markBuf[i * 4] = m.p[0]; this.markBuf[i * 4 + 1] = m.p[1];
      this.markBuf[i * 4 + 2] = m.p[2]; this.markBuf[i * 4 + 3] = m.r * (0.3 + 0.7 * life);
      this.tintBuf[i * 4] = m.color[0]; this.tintBuf[i * 4 + 1] = m.color[1];
      this.tintBuf[i * 4 + 2] = m.color[2]; this.tintBuf[i * 4 + 3] = Math.min(1, m.weight * 1.8);
    }
    gl.uniform1i(this.u.uMarkCount, count);
    gl.uniform4fv(this.u.uMark, this.markBuf);
    gl.uniform4fv(this.u.uMarkTint, this.tintBuf);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  // Drop resolution rather than responsiveness — but against an absolute pixel
  // budget. Clamping the ratio alone leaves a 4K wall at 3.5M pixels even at
  // the 0.65 floor, which is where the 45fps floor actually breaks.
  adapt(dtMs) {
    this.frameMs = this.frameMs * 0.9 + dtMs * 0.1;
    const ceiling = Math.min(window.devicePixelRatio || 1, 1.5);
    if (this.frameMs > 26 && this.scale > 0.5) this.scale = Math.max(0.5, this.scale - 0.08);
    else if (this.frameMs < 13 && this.scale < ceiling) {
      this.scale = Math.min(ceiling, this.scale + 0.04);
    }
    const cssPx = Math.max(1, this.canvas.clientWidth * this.canvas.clientHeight);
    const maxScale = Math.sqrt(MAX_PIXELS / cssPx);
    if (this.scale > maxScale) this.scale = Math.max(0.35, maxScale);
  }
}

function link(gl, vsrc, fsrc) {
  const vs = compile(gl, gl.VERTEX_SHADER, vsrc);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fsrc);
  const p = gl.createProgram();
  gl.attachShader(p, vs); gl.attachShader(p, fs); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error('link: ' + gl.getProgramInfoLog(p));
  }
  return p;
}

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    throw new Error('shader: ' + gl.getShaderInfoLog(s));
  }
  return s;
}
