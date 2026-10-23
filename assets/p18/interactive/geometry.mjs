// All dimensions are in millimetres. X = width, Y = depth, Z = height.
// Revision 2: each occupied cell is a complete movable module.
export const CASTER_HEIGHT = 146.267235552223;
export const TYPE_NAMES = ["Empty", "Cabinet", "Display", "Tall shelf"];

export const PRESETS = [
  { id: "A01", name: "Equal island", nx: 2, ny: 2, ratioX: 1, ratioY: 1, a: [.5, .5], b: [.67, .75], height: 2400, counter: 850, shelves: 2, rows: [[2, 1], [3, 3]] },
  { id: "A02", name: "Unequal L", nx: 2, ny: 2, ratioX: 2, ratioY: 3, a: [.33, .67], b: [.67, .75], height: 2600, counter: 915, shelves: 3, rows: [[2, 1], [0, 3]] },
  { id: "A03", name: "Wide + narrow", nx: 2, ny: 3, ratioX: 3, ratioY: 0, a: [.67, .3], b: [.8, .75], height: 2800, counter: 915, shelves: 3, rows: [[2, 1], [0, 0], [3, 3]] },
  { id: "A04", name: "Rear opening", nx: 3, ny: 2, ratioX: 0, ratioY: 2, a: [1 / 3, 1 / 3], b: [2 / 3, .75], height: 2600, counter: 900, shelves: 3, rows: [[2, 1, 2], [3, 0, 3]] },
  { id: "A05", name: "Two rows", nx: 3, ny: 3, ratioX: 0, ratioY: 0, a: [1 / 3, .3], b: [2 / 3, .75], height: 2800, counter: 915, shelves: 3, rows: [[2, 2, 1], [0, 0, 0], [3, 3, 3]] },
  { id: "A06", name: "Front opening", nx: 3, ny: 3, ratioX: 0, ratioY: 0, a: [1 / 3, .3], b: [2 / 3, .75], height: 2800, counter: 915, shelves: 3, rows: [[2, 1, 0], [3, 0, 0], [3, 3, 3]] },
  { id: "A07", name: "Offset rows", nx: 3, ny: 3, ratioX: 0, ratioY: 0, a: [.25, .3], b: [.6, .75], height: 2400, counter: 850, shelves: 2, rows: [[2, 2, 1], [0, 0, 0], [0, 3, 3]] },
  { id: "A08", name: "Wide centre U", nx: 3, ny: 3, ratioX: 0, ratioY: 0, a: [.25, .3], b: [.75, .75], height: 2800, counter: 1000, shelves: 4, rows: [[1, 2, 1], [0, 0, 3], [3, 3, 3]] },
];

export function presetState(id = "A05") {
  const preset = PRESETS.find(item => item.id === id) || PRESETS[4];
  const state = {
    width: 3048, depth: 1828.8, height: preset.height,
    counter: preset.counter, section: 40, shelfDepth: 300,
    nx: preset.nx, ny: preset.ny, ratioX: preset.ratioX, ratioY: preset.ratioY,
    a: [...preset.a], b: [...preset.b], cells: [],
  };
  for (let j = 0; j < 3; j++) {
    for (let i = 0; i < 3; i++) {
      const type = i < preset.nx && j < preset.ny ? preset.rows[j][i] : 0;
      state.cells.push({
        type, count: type === 3 ? preset.shelves : (type === 2 ? 1 : 0),
        first: type === 3 ? preset.counter + 250 : 350,
        last: type === 3 ? preset.height - 600 : 650,
      });
    }
  }
  return state;
}

// Scale each module's position around the footprint centre, leaving its size intact.
export function moduleOffset(state, model, cell, separation) {
  if (cell === null || separation === 1) return [0, 0, 0];
  const module = model.modules.find(item => item.id === cell);
  const [x0, y0, x1, y1] = module.bounds;
  const x = ((x0 + x1) / 2 - state.width / 2) * (separation - 1);
  const y = ((y0 + y1) / 2 - state.depth / 2) * (separation - 1);
  return [x, y, 0];
}

function axis(length, count, first, second, minimum, section, ratio) {
  if (count === 2 && ratio > 0) first = [0, .5, 1 / 3, 2 / 3][ratio];
  const half = section / 2;
  let a;
  let b;
  if (count === 2) {
    a = Math.max(minimum + half, Math.min(length - half - minimum, first * length));
    b = length - half;
  } else {
    a = Math.max(minimum + half, Math.min(length - half - 2 * minimum, Math.min(first, second) * length));
    b = Math.max(a + minimum, Math.min(length - half - minimum, Math.max(first, second) * length));
  }
  return [half, a, b, count === 2 ? length + minimum : length - half];
}

export function generate(state) {
  const { width, depth, height, counter, section, shelfDepth, nx, ny } = state;
  const base = CASTER_HEIGHT + 6;
  const xs = axis(width, nx, state.a[0], state.b[0], 450, section, state.ratioX);
  const ys = axis(depth, ny, state.a[1], state.b[1], 420, section, state.ratioY);
  const boxes = [];
  const casters = [];
  const modules = [];
  const signs = [];
  let shelfCount = 0;

  function occupied(i, j) {
    return i >= 0 && i < nx && j >= 0 && j < ny && state.cells[j * 3 + i].type > 0;
  }
  function box(category, x0, x1, y0, y1, z0, z1, cell = null) {
    boxes.push({ category, bounds: [x0, y0, z0, x1, y1, z1], cell });
  }

  // Each module has its own four posts, twelve rails and four caster mounts.
  // A 6 mm joint separates neighboring frames; rails stop at post faces.
  const railLevels = [[base, base + section], [counter - section, counter], [height - section, height]];
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const id = j * 3 + i;
      const cell = state.cells[id];
      const left = i === 0 ? 0 : xs[i] + 3;
      const right = i === nx - 1 ? width : xs[i + 1] - 3;
      const front = j === 0 ? 0 : ys[j] + 3;
      const rear = j === ny - 1 ? depth : ys[j + 1] - 3;
      const x0 = left + section + 3, x1 = right - section - 3;
      const y0 = front + section + 3, y1 = rear - section - 3;
      modules.push({ id, i, j, type: cell.type, bounds: [left, front, right, rear], levels: [] });
      if (!occupied(i, j)) continue;
      for (const px of [left, right - section]) {
        for (const py of [front, rear - section]) {
          box("FRAME", px, px + section, py, py + section, base, height, id);
          const cx = px === left ? left + 100 : right - 100;
          const cy = py === front ? front + 100 : rear - 100;
          casters.push({ cell: id, position: [cx, cy, 0] });
          box("MOUNTS", Math.min(px, cx - 45), Math.max(px + section, cx + 45),
            Math.min(py, cy - 40), Math.max(py + section, cy + 40), CASTER_HEIGHT, base, id);
        }
      }
      for (const [bottom, top] of railLevels) {
        for (const py of [front, rear - section])
          box("FRAME", left + section, right - section, py, py + section, bottom, top, id);
        for (const px of [left, right - section])
          box("FRAME", px, px + section, front + section, rear - section, bottom, top, id);
      }
      box("COUNTERS", x0, x1, y0, y1, counter - 25, counter, id);
      box("CABINETS", x0, x1, y0, y1, base + section, base + section + 18, id);
      const bottom = base + section + 18, top = counter - 28;
      box("CABINETS", x0, x0 + 18, y0, y1, bottom, top, id);
      box("CABINETS", x1 - 18, x1, y0, y1, bottom, top, id);
      if (cell.type !== 2)
        box("CABINETS", x0 + 18, x1 - 18, y0, y0 + 18, bottom, top, id);
      const middle = (x0 + x1) / 2;
      box("CABINETS", x0 + 18, middle - 1.5, y1 - 18, y1, bottom, top, id);
      box("CABINETS", middle + 1.5, x1 - 18, y1 - 18, y1, bottom, top, id);

      const low = cell.type === 3 ? counter + 100 : base + section + 60;
      const high = cell.type === 3 ? height - 400 : counter - 50;
      const span = 40 * Math.max(cell.count - 1, 0);
      const first = Math.max(low, Math.min(high - span, Math.min(cell.first, cell.last)));
      const last = Math.max(first + span, Math.min(high, Math.max(cell.first, cell.last)));
      if (cell.type >= 2) {
        for (let k = 0; k < cell.count; k++) {
          const level = cell.count < 2 ? first : first + (last - first) * k / (cell.count - 1);
          box("SHELVES", x0 + 18, x1 - 18, Math.max(y0 + 21, y1 - shelfDepth - 21), y1 - 21, level - 18, level, id);
          modules[modules.length - 1].levels.push(level);
          shelfCount++;
        }
      }
      if (cell.type === 3)
        box("BACK PANELS", x0, x1, y1 - 12, y1, counter + 3, last + 80, id);
      if (j === 0) {
        box("SIGNS", x0, x1, front + section + 3, front + section + 15, height - 330, height - section - 3, id);
        if (i < 2) signs.push({
          cell: id, text: i === 0 ? "INFORMATION" : "DESK",
          x: (left + right) / 2, y: front + section + 2, z: height - 185, width: x1 - x0 - 20,
        });
      }
    }
  }
  return { boxes, casters, modules, signs, xs, ys, shelfCount };
}
