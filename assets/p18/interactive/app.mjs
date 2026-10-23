import * as THREE from "three";
import { OrbitControls } from "./vendor/OrbitControls.js";
import { generate, presetState, moduleOffset, PRESETS, TYPE_NAMES } from "./geometry.mjs";

const get = id => document.getElementById(id);
// The portfolio embeds this same page; keep its controls beside the model.
if (window.parent !== window) document.body.classList.add("embedded");
const requestedPreset = new URLSearchParams(location.search).get("preset");
let state = presetState(requestedPreset || "A05");
let selected = 0;
let model = generate(state);
let view = "iso";
let drag = null;
let separation = 1;
let renderer, scene, camera, orbit, parts, dimensions, casterGeometry;
const unitBox = new THREE.BoxGeometry(1, 1, 1);
const unitEdges = new THREE.EdgesGeometry(unitBox);
const materials = {};
const colors = {
  FRAME: "#343837", MOUNTS: "#858b8a", COUNTERS: "#b98b54",
  CABINETS: "#aa7e4e", SHELVES: "#c49b65", "BACK PANELS": "#ddd5bf", SIGNS: "#272d2c",
};
for (const category in colors)
  materials[category] = new THREE.MeshStandardMaterial({ color: colors[category], roughness: .82 });
const casterMaterial = new THREE.MeshStandardMaterial({ color: "#717a7c", metalness: .2, roughness: .65 });
const selectionMaterial = new THREE.LineBasicMaterial({ color: "#656d70", transparent: true, opacity: .5 });
const dimensionMaterial = new THREE.LineBasicMaterial({ color: "#6b7474", transparent: true, opacity: .65, depthTest: false });
const signTextures = new Map();

function textMaterial(text) {
  if (signTextures.has(text)) return signTextures.get(text);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(640, text.length * 160);
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#f7f6f2";
  ctx.font = "600 180px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, canvas.width / 2, 136, canvas.width - 40);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  material.userData.aspect = canvas.width / canvas.height;
  signTextures.set(text, material);
  return material;
}

function draw() {
  if (!renderer || !scene || !camera) return;
  // Keep dimension text readable while orbiting or zooming.
  const unitsPerPixel = (camera.top - camera.bottom) / camera.zoom / renderer.getSize(new THREE.Vector2()).y;
  for (const item of dimensions.children) {
    if (item.isSprite) item.scale.set(item.userData.width * unitsPerPixel, 24 * unitsPerPixel, 1);
  }
  renderer.render(scene, camera);
}

function rebuildDimensions() {
  for (const child of [...dimensions.children]) {
    dimensions.remove(child);
    if (child.isSprite) {
      child.material.map.dispose();
      child.material.dispose();
    } else child.geometry.dispose();
  }
  const active = model.modules.filter(item => item.type > 0);
  if (!active.length) return;
  let left = Infinity, right = -Infinity, front = Infinity, rear = -Infinity;
  for (const module of active) {
    const [dx, dy] = moduleOffset(state, model, module.id, separation);
    left = Math.min(left, module.bounds[0] + dx);
    right = Math.max(right, module.bounds[2] + dx);
    front = Math.min(front, module.bounds[1] + dy);
    rear = Math.max(rear, module.bounds[3] + dy);
  }
  const point = p => new THREE.Vector3(p[0], p[2], -p[1]);
  function dimension(axis, a, b, originA, originB, label, labelPosition, tick) {
    const points = [a, b, originA, a, originB, b];
    for (const end of [a, b]) {
      points.push([end[0] - tick[0], end[1] - tick[1], end[2] - tick[2]]);
      points.push([end[0] + tick[0], end[1] + tick[1], end[2] + tick[2]]);
    }
    const geometry = new THREE.BufferGeometry().setFromPoints(points.map(point));
    const line = new THREE.LineSegments(geometry, dimensionMaterial);
    line.userData.axis = axis;
    line.renderOrder = 10;
    dimensions.add(line);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    ctx.font = "500 26px Arial";
    canvas.width = Math.ceil(ctx.measureText(label).width) + 24;
    canvas.height = 48;
    ctx.fillStyle = "#f7f6f2";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = "500 26px Arial";
    ctx.fillStyle = "#4c5656";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, canvas.width / 2, 25);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.SpriteMaterial({ map: texture, depthTest: false, depthWrite: false });
    const sprite = new THREE.Sprite(material);
    sprite.position.copy(point(labelPosition));
    sprite.userData = { axis, width: canvas.width / 2 };
    sprite.renderOrder = 11;
    dimensions.add(sprite);
  }
  const prefix = separation > 1.001 ? "Spread " : "";
  dimension("width", [left, front - 240, 0], [right, front - 240, 0],
    [left, front, 0], [right, front, 0], `${prefix}W ${Math.round(right - left)} mm`,
    [(left + right) / 2, front - 350, 0], [25, 25, 0]);
  dimension("depth", [right + 240, front, 0], [right + 240, rear, 0],
    [right, front, 0], [right, rear, 0], `${prefix}D ${Math.round(rear - front)} mm`,
    [right + 380, (front + rear) / 2, 0], [25, 25, 0]);
  dimension("height", [left - 240, front, 0], [left - 240, front, state.height],
    [left, front, 0], [left, front, state.height], `H ${state.height} mm`,
    [left - 340, front, state.height / 2], [25, 0, 25]);
  dimension("counter", [right + 240, front, 0], [right + 240, front, state.counter],
    [right, front, 0], [right, front, state.counter], `Counter ${state.counter} mm`,
    [right + 380, front, state.counter + 160], [25, 0, 25]);
  updateDimensionVisibility();
}

function updateDimensionVisibility() {
  if (!dimensions) return;
  dimensions.visible = get("show-dimensions").checked;
  for (const item of dimensions.children) {
    const axis = item.userData.axis;
    item.visible = !((view === "front" && axis === "depth") || (view === "side" && axis === "width")
      || (view === "plan" && (axis === "height" || axis === "counter")));
  }
}

function rebuildModel() {
  if (!parts) return;
  for (const child of [...parts.children]) {
    parts.remove(child);
    if (child.userData.disposeGeometry) child.geometry.dispose();
  }
  const frameOnly = get("frame-only").checked;
  for (const item of model.boxes) {
    if (frameOnly && item.category !== "FRAME" && item.category !== "MOUNTS") continue;
    const [x0, y0, z0, x1, y1, z1] = item.bounds;
    const mesh = new THREE.Mesh(unitBox, materials[item.category]);
    mesh.position.set((x0 + x1) / 2, (z0 + z1) / 2, -(y0 + y1) / 2);
    const [dx, dy, dz] = moduleOffset(state, model, item.cell, separation);
    mesh.position.add(new THREE.Vector3(dx, dz, -dy));
    mesh.scale.set(x1 - x0, z1 - z0, y1 - y0);
    parts.add(mesh);
    if (item.category === "COUNTERS" && item.cell === selected) {
      const outline = new THREE.LineSegments(unitEdges, selectionMaterial);
      outline.position.copy(mesh.position);
      outline.scale.copy(mesh.scale).addScalar(2);
      outline.userData.selection = true;
      parts.add(outline);
    }
  }
  for (const caster of model.casters) {
    const [x, y, z] = caster.position;
    const [dx, dy, dz] = moduleOffset(state, model, caster.cell, separation);
    const mesh = new THREE.Mesh(casterGeometry, casterMaterial);
    mesh.position.set(x + dx, z + dz, -y - dy);
    parts.add(mesh);
  }
  if (!frameOnly) {
    for (const sign of model.signs) {
      const width = Math.min(sign.width, sign.text.length * 62);
      const material = textMaterial(sign.text);
      const plane = new THREE.PlaneGeometry(width, width / material.userData.aspect);
      const mesh = new THREE.Mesh(plane, material);
      const [dx, dy, dz] = moduleOffset(state, model, sign.cell, separation);
      mesh.position.set(sign.x + dx, sign.z + dz, -sign.y - dy);
      mesh.userData.disposeGeometry = true;
      parts.add(mesh);
    }
  }
  rebuildDimensions();
  draw();
}

function fitView(name = view, aspect = get("viewport").clientWidth / get("viewport").clientHeight) {
  view = name;
  for (const button of document.querySelectorAll("[data-view]"))
    button.setAttribute("aria-pressed", String(button.dataset.view === view));
  if (!camera) return;
  updateDimensionVisibility();
  const bounds = new THREE.Box3().setFromObject(parts);
  if (bounds.isEmpty()) bounds.set(new THREE.Vector3(0, 0, -state.depth), new THREE.Vector3(state.width, state.height, 0));
  if (dimensions.visible) {
    // Reserve space around the actual assembly for extension lines and labels.
    bounds.min.x -= 650;
    bounds.max.x += 650;
    bounds.max.z += 480;
  }
  const target = bounds.getCenter(new THREE.Vector3());
  const directions = { iso: [5, 3.3, 7], front: [0, 0, 10], side: [10, 0, 0], plan: [0, 10, .001] };
  camera.up.set(0, 1, 0);
  if (view === "plan") camera.up.set(0, 0, -1);
  camera.position.copy(target).add(new THREE.Vector3(...directions[view]).multiplyScalar(1200));
  camera.lookAt(target);
  camera.updateMatrixWorld();
  let maxX = 0, maxY = 0;
  for (const x of [bounds.min.x, bounds.max.x]) {
    for (const y of [bounds.min.y, bounds.max.y]) {
      for (const z of [bounds.min.z, bounds.max.z]) {
        const p = new THREE.Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse);
        maxX = Math.max(maxX, Math.abs(p.x));
        maxY = Math.max(maxY, Math.abs(p.y));
      }
    }
  }
  const halfHeight = Math.max(maxY, maxX / aspect) * 1.14;
  camera.left = -halfHeight * aspect;
  camera.right = halfHeight * aspect;
  camera.top = halfHeight;
  camera.bottom = -halfHeight;
  camera.zoom = 1;
  camera.updateProjectionMatrix();
  orbit.target.copy(target);
  orbit.enableRotate = view === "iso";
  orbit.update();
  draw();
}

async function initViewer() {
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setClearColor("#f7f6f2", 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;
    const response = await fetch("./assets/caster.json");
    if (!response.ok) throw new Error("The caster asset could not be loaded.");
    const data = await response.json();
    const points = [];
    for (const [x, y, z] of data.vertices) points.push(x, z, -y);
    casterGeometry = new THREE.BufferGeometry();
    casterGeometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
    casterGeometry.setIndex(data.faces.flat());
    casterGeometry.computeVertexNormals();

    scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight("#ffffff", "#b2aa96", 2));
    const light = new THREE.DirectionalLight("#ffffff", 2.5);
    light.position.set(-3500, 6000, 5500);
    scene.add(light);
    camera = new THREE.OrthographicCamera(-2500, 2500, 2500, -2500, 1, 50000);
    parts = new THREE.Group();
    scene.add(parts);
    dimensions = new THREE.Group();
    scene.add(dimensions);
    get("viewport").appendChild(renderer.domElement);
    orbit = new OrbitControls(camera, renderer.domElement);
    orbit.enableDamping = false;
    orbit.minZoom = .4;
    orbit.maxZoom = 4;
    orbit.addEventListener("change", draw);
    const observer = new ResizeObserver(() => {
      renderer.setSize(get("viewport").clientWidth, get("viewport").clientHeight);
      fitView();
    });
    observer.observe(get("viewport"));
    get("viewer-message").hidden = true;
    get("export-image").disabled = false;
    rebuildModel();
    fitView();
    document.body.dataset.ready = "true";
  } catch (error) {
    get("viewer-message").textContent = "3D view unavailable. You can still configure the desk using the plan and save its settings.";
    get("feedback").textContent = error.message;
    document.body.dataset.ready = "fallback";
    renderer = null;
  }
}

function svgElement(name, attributes) {
  const element = document.createElementNS("http://www.w3.org/2000/svg", name);
  for (const key in attributes) element.setAttribute(key, attributes[key]);
  return element;
}

function updatePlan() {
  const svg = get("plan");
  svg.replaceChildren();
  for (const module of model.modules) {
    const [x0, y0, x1, y1] = module.bounds;
    const x = 22 + x0 / state.width * 276;
    const y = 16 + (1 - y1 / state.depth) * 166;
    const width = (x1 - x0) / state.width * 276;
    const height = (y1 - y0) / state.depth * 166;
    const label = `M${module.i + 1}${module.j + 1}`;
    const group = svgElement("g", {
      class: "cell", "data-cell": module.id, "data-selected": module.id === selected,
      tabindex: 0, role: "button", "aria-label": `${label}, ${TYPE_NAMES[module.type]}`,
      "aria-pressed": module.id === selected,
    });
    group.appendChild(svgElement("rect", {
      x, y, width, height, fill: ["#fff", "#d6c9b6", "#dfbd8a", "#b3936b"][module.type],
    }));
    const text = svgElement("text", { x: x + width / 2, y: y + height / 2 + 4, "text-anchor": "middle" });
    text.textContent = label;
    group.appendChild(text);
    svg.appendChild(group);
  }
  for (const which of ["a", "b"]) {
    if (which === "b" && state.nx === 2 && state.ny === 2) continue;
    const ix = which === "b" && state.nx === 3 ? 2 : 1;
    const iy = which === "b" && state.ny === 3 ? 2 : 1;
    const x = 22 + model.xs[ix] / state.width * 276;
    const y = 16 + (1 - model.ys[iy] / state.depth) * 166;
    const handle = svgElement("g", {
      class: "handle", "data-handle": which, "data-dragging": drag?.which === which,
      transform: `translate(${x} ${y})`, tabindex: 0, role: "button",
      "aria-label": `Division ${which.toUpperCase()}. Drag or use arrow keys.`,
    });
    handle.appendChild(svgElement("circle", { class: "hit", r: 22 }));
    handle.appendChild(svgElement("circle", { class: "halo", r: 17 }));
    handle.appendChild(svgElement("circle", { class: "dot", r: 12 }));
    const text = svgElement("text", { x: 0, y: 4, "text-anchor": "middle" });
    text.textContent = which.toUpperCase();
    handle.appendChild(text);
    svg.appendChild(handle);
  }
}

function updateControls() {
  for (const key of ["nx", "ny", "width", "depth", "height", "counter", "section", "shelfDepth", "ratioX", "ratioY"])
    get(key).value = state[key];
  get("ratioX").disabled = state.nx === 3;
  get("ratioY").disabled = state.ny === 3;
  for (const [id, point, axis] of [["ax", "a", 0], ["ay", "a", 1], ["bx", "b", 0], ["by", "b", 1]]) {
    get(id).value = Math.round(state[point][axis] * 1000) / 10;
    const count = axis === 0 ? state.nx : state.ny;
    const ratio = axis === 0 ? state.ratioX : state.ratioY;
    get(id).disabled = point === "b" ? count === 2 : count === 2 && ratio !== 0;
  }
  const cell = state.cells[selected];
  const module = model.modules.find(item => item.id === selected);
  const [x0, y0, x1, y1] = module.bounds;
  get("module-title").textContent = `Module M${module.i + 1}${module.j + 1}`;
  get("module-size").textContent = `${Math.round(x1 - x0)} × ${Math.round(y1 - y0)} mm`;
  get("module-type").value = cell.type;
  get("shelf-count").value = cell.count;
  get("shelf-count-value").value = cell.count;
  get("first-shelf").value = cell.first;
  get("last-shelf").value = cell.last;
  get("shelf-settings").hidden = cell.type < 2;
  get("first-shelf").disabled = cell.count === 0;
  get("last-shelf").disabled = cell.count < 2;
  get("shelf-levels").textContent = module.levels.length
    ? `Actual shelf tops: ${module.levels.map(Math.round).join(", ")} mm above floor.`
    : "No shelf boards.";
  get("counter-value").value = `${state.counter} mm`;
  get("dimensions").textContent = `${state.width} W × ${Math.round(state.depth)} D × ${state.height} H mm`;
  const active = model.modules.filter(item => item.type > 0).length;
  get("model-summary").textContent = `${state.nx} × ${state.ny} · ${active} modules · ${model.shelfCount} shelves`;
}

function update(custom = true, refit = false) {
  if (selected % 3 >= state.nx || Math.floor(selected / 3) >= state.ny) selected = 0;
  model = generate(state);
  if (custom) get("preset").value = "custom";
  updatePlan();
  updateControls();
  rebuildModel();
  if (refit || separation > 1) fitView();
}

function numericInput(id, apply, refit = false) {
  get(id).addEventListener("input", () => {
    const input = get(id);
    const number = input.valueAsNumber;
    // Allow unfinished numbers while typing; update the model once the value is valid.
    if (!Number.isFinite(number) || number < Number(input.min) || number > Number(input.max)) return;
    apply(number);
    update(true, refit);
  });
  get(id).addEventListener("change", () => {
    const input = get(id);
    if (input.value === "" || !Number.isFinite(input.valueAsNumber)) { updateControls(); return; }
    const number = Math.max(Number(input.min), Math.min(Number(input.max), input.valueAsNumber));
    apply(number);
    update(true, refit);
  });
}
for (const id of ["width", "depth", "height", "section", "shelfDepth"])
  numericInput(id, value => { state[id] = value; }, ["width", "depth", "height"].includes(id));
for (const id of ["nx", "ny", "ratioX", "ratioY"])
  get(id).addEventListener("change", () => { state[id] = Number(get(id).value); update(); });
for (const [id, point, axis] of [["ax", "a", 0], ["ay", "a", 1], ["bx", "b", 0], ["by", "b", 1]])
  numericInput(id, value => { state[point][axis] = value / 100; });
get("counter").addEventListener("input", () => { state.counter = Number(get("counter").value); update(); });
get("shelf-count").addEventListener("input", () => { state.cells[selected].count = Number(get("shelf-count").value); update(); });
numericInput("first-shelf", value => { state.cells[selected].first = value; });
numericInput("last-shelf", value => { state.cells[selected].last = value; });
get("module-type").addEventListener("change", () => {
  const cell = state.cells[selected];
  cell.type = Number(get("module-type").value);
  if (cell.type === 3) {
    cell.count = 3;
    cell.first = state.counter + 250;
    cell.last = state.height - 600;
  } else if (cell.type === 2) {
    cell.count = 1;
    cell.first = 350;
    cell.last = 650;
  }
  update();
});
get("preset").addEventListener("change", () => {
  state = presetState(get("preset").value);
  selected = 0;
  update(false, true);
});
get("reset").addEventListener("click", () => {
  state = presetState();
  selected = 0;
  get("preset").value = "A05";
  get("frame-only").checked = false;
  get("show-dimensions").checked = true;
  separation = 1;
  updateSeparationLabel();
  update(false);
  fitView("iso");
  get("feedback").textContent = "Reset to A05 · Two rows.";
});
for (const button of document.querySelectorAll("[data-view]"))
  button.addEventListener("click", () => fitView(button.dataset.view));
get("frame-only").addEventListener("change", () => {
  rebuildModel();
  fitView();
});
get("show-dimensions").addEventListener("change", () => fitView());

function updateSeparationLabel() {
  get("separation").value = separation;
  get("separation-value").value = separation === 1 ? "Assembled" : `${separation.toFixed(2)}× position`;
  get("separation-help").textContent = separation === 1
    ? "Slide to separate module positions. Part sizes stay the same."
    : "Each module moves with its own frame, shelves and four casters.";
}
get("separation").addEventListener("input", () => {
  separation = Number(get("separation").value);
  updateSeparationLabel();
  rebuildModel();
  fitView();
});

function selectModule(id) {
  selected = Number(id);
  update(false);
}
get("plan").addEventListener("click", event => {
  const cell = event.target.closest("[data-cell]");
  if (cell) selectModule(cell.dataset.cell);
});
get("plan").addEventListener("keydown", event => {
  const cell = event.target.closest("[data-cell]");
  const handle = event.target.closest("[data-handle]");
  if (cell && ["Enter", " "].includes(event.key)) {
    event.preventDefault();
    selectModule(cell.dataset.cell);
    get("plan").querySelector(`[data-cell="${selected}"]`).focus();
  }
  if (handle && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
    event.preventDefault();
    const which = handle.dataset.handle;
    let [x, y] = state[which];
    if (event.key === "ArrowLeft") x -= .01;
    if (event.key === "ArrowRight") x += .01;
    if (event.key === "ArrowUp") y += .01;
    if (event.key === "ArrowDown") y -= .01;
    moveHandle(which, x, y);
    get("plan").querySelector(`[data-handle="${which}"]`).focus();
  }
});

function moveHandle(which, x, y) {
  if (which === "a" || state.nx === 3) {
    state[which][0] = Math.max(0, Math.min(1, x));
    if (state.nx === 2) state.ratioX = 0;
  }
  if (which === "a" || state.ny === 3) {
    state[which][1] = Math.max(0, Math.min(1, y));
    if (state.ny === 2) state.ratioY = 0;
  }
  update();
}
get("plan").addEventListener("pointerdown", event => {
  const handle = event.target.closest("[data-handle]");
  if (!handle || drag) return;
  event.preventDefault();
  drag = { which: handle.dataset.handle, pointer: event.pointerId };
  handle.dataset.dragging = "true";
  get("plan").setPointerCapture(event.pointerId);
});
get("plan").addEventListener("pointermove", event => {
  if (!drag || drag.pointer !== event.pointerId) return;
  const rect = get("plan").getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width * 320 - 22) / 276;
  const y = 1 - ((event.clientY - rect.top) / rect.height * 210 - 16) / 166;
  moveHandle(drag.which, x, y);
});
for (const name of ["pointerup", "pointercancel"])
  get("plan").addEventListener(name, event => {
    if (!drag || drag.pointer !== event.pointerId) return;
    drag = null;
    if (get("plan").hasPointerCapture(event.pointerId)) get("plan").releasePointerCapture(event.pointerId);
    updatePlan();
  });

function download(blob, name) {
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
get("save-settings").addEventListener("click", () => {
  const data = { schema: "information-desk.v2", units: "mm", state, view: { separation, camera: view, dimensions: get("show-dimensions").checked } };
  download(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }), "information-desk.json");
  get("feedback").textContent = "Configuration saved as JSON.";
});
get("export-image").addEventListener("click", () => {
  const savedCamera = camera.clone();
  const savedTarget = orbit.target.clone();
  const savedSize = renderer.getSize(new THREE.Vector2());
  const savedPixelRatio = renderer.getPixelRatio();
  renderer.setPixelRatio(1);
  renderer.setSize(1600, 1100, false);
  fitView(view, 1600 / 1100);
  for (const child of parts.children) if (child.userData.selection) child.visible = false;
  draw();
  renderer.domElement.toBlob(blob => {
    download(blob, "information-desk.png");
    get("feedback").textContent = "Model view saved as PNG.";
    for (const child of parts.children) if (child.userData.selection) child.visible = true;
    renderer.setPixelRatio(savedPixelRatio);
    renderer.setSize(savedSize.x, savedSize.y, false);
    camera.copy(savedCamera);
    orbit.target.copy(savedTarget);
    orbit.update();
    draw();
  }, "image/png");
});
get("preset").value = PRESETS.some(item => item.id === requestedPreset) ? requestedPreset : "A05";
update(false);
initViewer();
