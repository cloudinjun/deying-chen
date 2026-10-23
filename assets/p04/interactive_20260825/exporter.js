// exporter.js — taking the form out of the game.
//
// PNG card for sharing, GLB for anything that reads meshes, and the raw
// operation log so the picture can be checked against what actually happened.
// The provenance line is printed on the card on purpose: this object is
// born-digital and must never be shown as a verified twin.

import { N, gridToWorld } from './field.js?v=23';

// The official mark, preloaded so the synchronous card composer can use it.
// Small, in the corner, with its quarter-height clear space — a signature,
// not a watermark.
const LOGO = new Image();
LOGO.src = 'meikku_logo_highfive_slate.svg';
const SEAL = new Image();
SEAL.src = 'seal-highfive.svg';

export function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// ---- PNG card ---------------------------------------------------------

export function makeCard(glCanvas, meta) {
  const W = 1600, H = 1000;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');

  g.fillStyle = '#FCFCFA'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#D8D8D3';
  for (let y = 26; y < H; y += 34) for (let x = 26; x < W; x += 34) {
    g.beginPath(); g.arc(x, y, 1.7, 0, Math.PI * 2); g.fill();
  }

  const pad = 46, top = 132, bot = 118;
  const iw = W - pad * 2, ih = H - top - bot;
  const sc = Math.min(iw / glCanvas.width, ih / glCanvas.height);
  const dw = glCanvas.width * sc, dh = glCanvas.height * sc;
  g.drawImage(glCanvas, pad + (iw - dw) / 2, top + (ih - dh) / 2, dw, dh);

  g.fillStyle = '#232322';
  g.font = '600 46px Bungee, Impact, sans-serif';
  g.fillText((meta.name || 'UNTITLED FORM').toUpperCase(), pad, 74);
  g.font = '700 20px "Space Grotesk", sans-serif';
  g.fillStyle = '#5C5C58';
  g.fillText(`${meta.mode}  ·  ${meta.ops} operations  ·  ${meta.moments} shared moments  ·  ${meta.date}`, pad, 106);

  // provenance, printed at full size — not a footnote
  g.fillStyle = '#232322';
  g.fillRect(pad, H - 96, 372, 44);
  g.fillStyle = '#FCFCFA';
  g.font = '400 21px Bungee, Impact, sans-serif';
  g.fillText('BORN-DIGITAL FORM', pad + 16, H - 64);
  g.fillStyle = '#5C5C58';
  g.font = '500 18px "Space Grotesk", sans-serif';
  g.fillText('made in MEIKKU — Shape Together. No real-world source; not a verified twin.',
    pad + 396, H - 64);

  // the high-five mark signs the corner (min width honoured, clear space kept)
  if (LOGO.complete && LOGO.naturalWidth) {
    const lw = 120, lh = lw * (LOGO.naturalHeight / LOGO.naturalWidth);
    g.drawImage(LOGO, W - lw - 46, H - lh - 54, lw, lh);
  }

  g.strokeStyle = '#232322'; g.lineWidth = 6;
  g.strokeRect(3, 3, W - 6, H - 6);
  return c;
}

export async function exportPng(glCanvas, meta) {
  // Canvas text does not trigger font downloads. Without this, the first card
  // a visitor ever exports silently renders its title in Impact.
  try {
    await Promise.all([
      document.fonts.load('600 46px Bungee'),
      document.fonts.load('700 20px "Space Grotesk"'),
    ]);
  } catch { /* fall back to system faces rather than fail the export */ }
  const card = makeCard(glCanvas, meta);
  return new Promise(resolve => {
    card.toBlob(b => { download(b, `${slug(meta.name)}_${stamp()}.png`); resolve(true); }, 'image/png');
  });
}

export function thumbnail(glCanvas, w = 320) {
  const h = Math.round(w * 0.75);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = '#FCFCFA'; g.fillRect(0, 0, w, h);
  const sc = Math.min(w / glCanvas.width, h / glCanvas.height);
  const dw = glCanvas.width * sc, dh = glCanvas.height * sc;
  g.drawImage(glCanvas, (w - dw) / 2, (h - dh) / 2, dw, dh);
  return c.toDataURL('image/jpeg', 0.72);
}

// ---- surface extraction (marching tetrahedra) -------------------------
// Six tetrahedra per cell. Fewer special cases than marching cubes and no
// ambiguous configurations, which matters more here than triangle count.

const CORNERS = [
  [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
  [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1],
];
const TETS = [
  [0, 5, 1, 6], [0, 1, 2, 6], [0, 2, 3, 6],
  [0, 3, 7, 6], [0, 7, 4, 6], [0, 4, 5, 6],
];
const TET_EDGES = [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]];

export function extractSurface(field, stride = 1) {
  const pos = [], nrm = [];
  const d = field.data;
  const at = (i, j, k) => d[i + N * (j + N * k)];
  const cv = new Float32Array(8), cp = [];
  for (let i = 0; i < 8; i++) cp.push([0, 0, 0]);

  for (let k = 0; k + stride < N; k += stride) {
    for (let j = 0; j + stride < N; j += stride) {
      for (let i = 0; i + stride < N; i += stride) {
        let neg = 0;
        for (let c = 0; c < 8; c++) {
          const ci = i + CORNERS[c][0] * stride;
          const cj = j + CORNERS[c][1] * stride;
          const ck = k + CORNERS[c][2] * stride;
          const v = at(ci, cj, ck);
          cv[c] = v;
          cp[c][0] = gridToWorld(ci); cp[c][1] = gridToWorld(cj); cp[c][2] = gridToWorld(ck);
          if (v < 0) neg++;
        }
        if (neg === 0 || neg === 8) continue;

        for (const tet of TETS) {
          const pts = [];
          for (const [ea, eb] of TET_EDGES) {
            const a = tet[ea], b = tet[eb];
            const va = cv[a], vb = cv[b];
            if ((va < 0) === (vb < 0)) continue;
            const t = va / (va - vb);
            pts.push([
              cp[a][0] + (cp[b][0] - cp[a][0]) * t,
              cp[a][1] + (cp[b][1] - cp[a][1]) * t,
              cp[a][2] + (cp[b][2] - cp[a][2]) * t,
            ]);
          }
          if (pts.length === 3) emit(field, pos, nrm, pts[0], pts[1], pts[2]);
          else if (pts.length === 4) {
            const q = orderQuad(pts);
            emit(field, pos, nrm, q[0], q[1], q[2]);
            emit(field, pos, nrm, q[0], q[2], q[3]);
          }
        }
      }
    }
  }
  return { positions: new Float32Array(pos), normals: new Float32Array(nrm) };
}

function orderQuad(p) {
  const c = [0, 0, 0];
  for (const q of p) { c[0] += q[0] / 4; c[1] += q[1] / 4; c[2] += q[2] / 4; }
  const n = cross(sub(p[1], p[0]), sub(p[2], p[0]));
  const u = normalize(sub(p[0], c));
  const v = cross(n, u);
  return p.slice().sort((a, b) => {
    const aa = Math.atan2(dot(sub(a, c), v), dot(sub(a, c), u));
    const bb = Math.atan2(dot(sub(b, c), v), dot(sub(b, c), u));
    return aa - bb;
  });
}

function emit(field, pos, nrm, a, b, c) {
  // outward normal comes from the field, then the winding is made to match
  const na = field.normal(a[0], a[1], a[2]);
  const nb = field.normal(b[0], b[1], b[2]);
  const nc = field.normal(c[0], c[1], c[2]);
  const face = cross(sub(b, a), sub(c, a));
  const avg = [na[0] + nb[0] + nc[0], na[1] + nb[1] + nc[1], na[2] + nb[2] + nc[2]];
  if (dot(face, avg) < 0) { const t = b; b = c; c = t; }
  const nn = [field.normal(a[0], a[1], a[2]), field.normal(b[0], b[1], b[2]), field.normal(c[0], c[1], c[2])];
  pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  for (const n of nn) nrm.push(n[0], n[1], n[2]);
}

// ---- GLB --------------------------------------------------------------

export function exportGlb(field, meta) {
  let mesh = extractSurface(field, 1);
  if (mesh.positions.length / 3 > 300000) mesh = extractSurface(field, 2);
  const blob = buildGlb(mesh, meta);
  download(blob, `${slug(meta.name)}_${stamp()}.glb`);
  return mesh.positions.length / 9;
}

function buildGlb(mesh, meta) {
  const { positions, normals } = mesh;
  const count = positions.length / 3;
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < count; i++) {
    for (let a = 0; a < 3; a++) {
      const v = positions[i * 3 + a];
      if (v < min[a]) min[a] = v;
      if (v > max[a]) max[a] = v;
    }
  }
  const posBytes = positions.byteLength;
  const nrmBytes = normals.byteLength;
  const bin = new Uint8Array(align4(posBytes) + align4(nrmBytes));
  bin.set(new Uint8Array(positions.buffer, 0, posBytes), 0);
  bin.set(new Uint8Array(normals.buffer, 0, nrmBytes), align4(posBytes));

  const json = {
    asset: {
      version: '2.0',
      generator: 'MEIKKU — Shape Together (born-digital form)',
      copyright: `${meta.name} · ${meta.date} · BORN-DIGITAL FORM, no real-world source`,
    },
    scene: 0,
    scenes: [{ nodes: [0], name: meta.name }],
    nodes: [{ mesh: 0, name: meta.name }],
    meshes: [{
      name: meta.name,
      primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, mode: 4 }],
    }],
    accessors: [
      { bufferView: 0, componentType: 5126, count, type: 'VEC3', min, max },
      { bufferView: 1, componentType: 5126, count, type: 'VEC3' },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: posBytes, target: 34962 },
      { buffer: 0, byteOffset: align4(posBytes), byteLength: nrmBytes, target: 34962 },
    ],
    buffers: [{ byteLength: bin.byteLength }],
  };

  const jsonText = JSON.stringify(json);
  const jsonBytes = new TextEncoder().encode(jsonText);
  const jsonPad = align4(jsonBytes.length) - jsonBytes.length;
  const jsonChunk = new Uint8Array(jsonBytes.length + jsonPad);
  jsonChunk.set(jsonBytes);
  jsonChunk.fill(0x20, jsonBytes.length);

  const total = 12 + 8 + jsonChunk.length + 8 + bin.length;
  const out = new ArrayBuffer(total);
  const dv = new DataView(out);
  const u8 = new Uint8Array(out);
  dv.setUint32(0, 0x46546c67, true);        // glTF
  dv.setUint32(4, 2, true);
  dv.setUint32(8, total, true);
  dv.setUint32(12, jsonChunk.length, true);
  dv.setUint32(16, 0x4e4f534a, true);       // JSON
  u8.set(jsonChunk, 20);
  const binOff = 20 + jsonChunk.length;
  dv.setUint32(binOff, bin.length, true);
  dv.setUint32(binOff + 4, 0x004e4942, true); // BIN
  u8.set(bin, binOff + 8);
  return new Blob([out], { type: 'model/gltf-binary' });
}

// ---- op log -----------------------------------------------------------

export function exportLog(payload, meta) {
  const text = JSON.stringify(payload, null, 2);
  download(new Blob([text], { type: 'application/json' }), `${slug(meta.name)}_oplog_${stamp()}.json`);
}

function align4(n) { return Math.ceil(n / 4) * 4; }
function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function normalize(a) { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
function slug(s) { return (s || 'form').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''); }
function stamp() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}
