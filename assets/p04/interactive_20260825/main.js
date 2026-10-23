// main.js — MEIKKU, Shape Together.
//
// One persistent form, two participants who can both change it, and a memory
// of what happened between them. Everything else in here serves that.
//
// Scope of this build: GDD §18 P0 (form + press/pull + undo + a visible Meikku
// that really sculpts + operation log + local save + one closed shared moment),
// P1 (no-instructions opening, progressive unlocks, one material surprise,
// resume after reload) and the P2 relationship work (ECHO, simplified TWO
// HANDS, interrupt / yield / repair, one correctable memory).

import { ClayField, H, regionOf, N } from './field.js?v=23';
import { BLUEPRINTS, bpSDF } from './blueprints.js?v=23';
import { Renderer } from './renderer.js?v=23';
import { OrbitCamera, traceField, nearestSurface, norm } from './camera.js?v=23';
import { Character } from './character.js?v=23';
import { Director } from './director.js?v=23';
import { Memory } from './memory.js?v=23';
import { line, ui, LANG } from './lines.js?v=23';
import { saveState, loadState, clearState } from './store.js?v=23';
import { exportPng, exportGlb, exportLog, thumbnail } from './exporter.js?v=23';

const SAVE_KEY = 'current';
// Telemetry belongs in exports and the console, not on the wall. The fps line
// and the raw intent JSON read as a lab rig to a passer-by; ?debug=1 brings
// them back for development.
const PAGE_PARAMS = new URLSearchParams(location.search);
const DEBUG = PAGE_PARAMS.has('debug');
const BRAND_AUTOPLAY = PAGE_PARAMS.get('v') === 'brand';
const WORLD_EMBED = PAGE_PARAMS.get('embed') === 'world' && window.parent !== window;
const AUTO_LOOP_SECONDS = 32;
const AUTO_PHASES = [
  { id: 'idea', start: 0, progress: 0.36 },
  { id: 'making', start: 2.4, progress: 0.64 },
  { id: 'mischief', start: 9.5, progress: 0.78 },
  { id: 'repair', start: 12.4, progress: 0.91 },
  { id: 'almost', start: 21.0, progress: 0.97 },
  { id: 'reframe', start: 27.5, progress: 0.54 },
];
const PIGMENT = {
  player: [0.063, 0.322, 0.800],   // ultramarine
  meikku: [0.055, 0.478, 0.259],   // viridian
};
const MODES = {
  first_touch: { label: 'FIRST TOUCH' },
  echo:        { label: 'ECHO' },
  two_hands:   { label: 'TWO HANDS' },
};

const $ = id => document.getElementById(id);

// One starting lump per day. The seed is the date, so every visitor today
// begins from the same shape and the day becomes the version number.
function dailySeed() {
  const d = new Date();
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

class Game {
  constructor() {
    this.el = {
      stage: $('stage'), canvas: $('view'), boot: $('boot'), fps: $('fps'),
      formName: $('formName'),
      hint: $('hint'), tools: $('tools'), btnUndo: $('btnUndo'), btnMemory: $('btnMemory'),
      btnInspect: $('btnInspect'), inspect: $('inspect'), inspectClose: $('inspectClose'),
      passport: $('passport'), episodeList: $('episodeList'), intentLog: $('intentLog'),
      card: $('momentCard'), shotBefore: $('shotBefore'), shotAfter: $('shotAfter'),
      momentName: $('momentName'),
      momentKeep: $('momentKeep'), momentSkip: $('momentSkip'),
      expPng: $('expPng'), expGlb: $('expGlb'), expLog: $('expLog'),
      btnNewForm: $('btnNewForm'), btnLang: $('btnLang'),
      wallPins: $('wallPins'),
      autoplayHud: $('autoplayHud'), autoplayClaim: $('autoplayClaim'),
      blueprintNote: $('blueprintNote'), autoplayEyebrow: $('autoplayEyebrow'),
      autoplayBlueprint: $('autoplayBlueprint'), autoplayPhase: $('autoplayPhase'),
      autoplayProgress: $('autoplayProgress'), autoplayCaption: $('autoplayCaption'),
      demoHand: $('demoHand'), demoHandLabel: $('demoHandLabel'),
    };

    this.field = new ClayField();
    this.cam = new OrbitCamera();
    this.memory = new Memory();
    this.renderer = new Renderer(this.el.canvas);
    this.char = new Character($('meikku'), $('bubble'), $('bubbleText'));

    this.form = {
      id: 'form_' + Date.now().toString(36),
      name: 'Folded Corner 01',
      created: Date.now(),
      mode: 'first_touch',
      unlocks: { smooth: false, point: false, undo: false },
      tutorial: { touched: false, sawMeikkuAct: false, firstMoment: false, resumed: false },
      moments: 0,
    };

    // The turntable: the camera never moves, the CLAY turns — like a potter's
    // wheel. Both hands can turn it: the player by dragging the background,
    // Meikku through spinToward() before working a far side.
    this.spin = 0;
    this.spinTween = null;
    this.bp = 0;               // Meikku's current proposal (switchable any time)

    this.tool = 'pull';        // pull <-> press, one verb with two directions
    this.direction = 'pull';
    this.undoStack = [];
    this.marks = [];
    this.time = 0;
    this.pointer = { down: false, mode: null, x: 0, y: 0, lastX: 0, lastY: 0 };
    this.stroke = null;
    this.hover = null;
    this.pulse = null;
    this.attn = null;
    this.lastPlayerStroke = null;
    this.lastPlayerStrokeAt = -99;
    this.lastMaterialAt = -99;
    this.lastMeikkuPoint = null;
    this.meikkuRecent = [];
    this.pendingSave = null;
    this.strokeSeq = 0;
    this.cardOpen = false;
    this.touchedThisSession = false;
    this.booted = false;
    this.lastFrameThumb = null;
    this.lastThumbAt = -99;
    this.manualSteps = [];
    this.embedPaused = WORLD_EMBED;
    this.autoDemo = {
      active: BRAND_AUTOPLAY,
      started: false,
      startedAt: 0,
      cycle: -1,
      phase: '',
      stroke: null,
      baseField: null,
      lastIntent: null,
      progress: 0.36,
    };

    this.director = new Director({
      now: () => this.time,
      setState: s => this.char.setState(s),
      say: (t, f, ms) => this.char.say(t, f, ms),
      setAttention: (p, r) => { this.attn = p ? { p, r: r || 0.24 } : null; },
      // clay points live in field space; the character lives in the room
      lookAt: p => { this.char.gaze = this.f2w(p.slice ? p.slice() : p); },
      moveNear: (p, pp) => this.char.moveNear(this.f2w(p), pp ? this.f2w(pp) : pp),
      spinToward: p => this.spinToward(p),
      applyOp: (op, intent) => this.applyMeikkuOp(op, intent),
      logIntent: i => {
        if (this.autoDemo.active) this.autoDemo.lastIntent = i;
        else this.memory.logIntent(i);
        this.renderIntentLog();
      },
      recallEpisode: () => this.memory.recall(),
      memoryPoints: () => this.memory.episodes
        .filter(e => e.point)
        .slice(-8)
        .map(e => ({ point: e.point, status: e.status })),
    });
  }

  // ---- boot -----------------------------------------------------------

  async boot() {
    // Draw first, load second. The overlay used to be a pair of timers, so a
    // fast machine waited ~235ms for nothing and a slow one faded out over an
    // empty canvas. It now lifts on the first frame that actually rendered.
    this.field.reset(dailySeed());
    this.renderer.uploadAll(this.field);
    this.applyUnlocks();
    this.el.formName.textContent = this.form.name;
    document.querySelector('.card-head').textContent = ui('moment_title');
    this.bindInput();
    this.bindUi();
    if (!DEBUG) {
      this.el.fps.hidden = true;
      const logSection = this.el.intentLog.closest('section');
      if (logSection) logSection.hidden = true;
      // the "?" inspect button is a research surface, not a game control —
      // hidden unless ?debug=1. The memory button stays: memories must be
      // visible and correctable (P3); the drawer also still opens on "i".
      this.el.btnInspect.hidden = true;
    }
    requestAnimationFrame(t => this.loop(t));

    const saved = await loadState(SAVE_KEY);
    // Brand autoplay is a rehearsed tutorial surface: always begin from the
    // daily seed, while leaving the visitor's saved playable form untouched.
    if (!BRAND_AUTOPLAY && saved && saved.v === 1 && saved.field && saved.field.length === N * N * N) {
      this.restore(saved);
      this.renderer.uploadAll(this.field);
      this.applyUnlocks();
    }
    if (this.autoDemo.active) this.startAutoDemo();
  }

  // The kept moments hang on the wall like drawings in a workshop. A visitor
  // who has kept nothing sees the room as it is; each KEEP pins one more.
  renderWallPins() {
    const eps = this.memory.episodes.filter(e => e.status !== 'forgotten' && e.thumbAfter).slice(-3);
    const slots = [
      { right: '22px', top: '64px', rot: -3.2 },
      { right: '132px', top: '84px', rot: 2.4 },
      { right: '58px', top: '176px', rot: -1.6 },
    ];
    this.el.wallPins.innerHTML = '';
    eps.forEach((ep, i) => {
      const s = slots[i];
      const d = document.createElement('div');
      d.className = 'wallpin';
      d.style.right = s.right; d.style.top = s.top;
      d.style.transform = `rotate(${s.rot}deg)`;
      const img = document.createElement('img');
      img.src = ep.thumbAfter; img.alt = '';
      d.appendChild(img);
      const cap = document.createElement('div');
      cap.className = 'cap';
      cap.textContent = ep.name || new Date(ep.ts).toLocaleDateString();
      d.appendChild(cap);
      // the brand's KEPT rubber stamp, pressed onto every kept moment
      const stamp = document.createElement('img');
      stamp.className = 'kept-stamp';
      stamp.src = 'stamp-kept.svg'; stamp.alt = '';
      d.appendChild(stamp);
      this.el.wallPins.appendChild(d);
    });
  }

  firstFrameDone() {
    if (this.booted) return;
    this.booted = true;
    this.el.boot.classList.add('gone');
    setTimeout(() => { this.el.boot.hidden = true; }, 300);
  }

  restore(saved) {
    this.field.load(saved.field);
    // old saves may carry pre-guard floating debris — scrub it on the way in
    this.field.sanitize();
    this.field.sanitize();
    Object.assign(this.form, saved.form || {});
    this.form.tutorial.resumed = true;
    // `touched` is about the person in front of the screen, not about the file.
    // Restoring it is why the second visitor at an exhibition never saw the
    // pulse or the one-line invitation.
    this.touchedThisSession = false;
    if (saved.camera) {
      // fixed viewpoint now: only the zoom survives a reload
      this.cam.dist = saved.camera.dist; this.cam.update();
    }
    this.spin = saved.spin || 0;
    this.bp = saved.bp | 0;
    this.syncBpChips();
    this.memory.restore(saved.memory);
    this.marks = (saved.marks || []).slice(-16);
    this.renderWallPins();
  }

  // ---- brand autoplay ------------------------------------------------

  startAutoDemo() {
    if (!this.autoDemo.active || this.autoDemo.started) return;
    this.autoDemo.started = true;
    this.autoDemo.startedAt = this.time;
    this.autoDemo.baseField = this.field.data.slice();
    this.autoDemo.cycle = -1;
    this.autoDemo.phase = '';
    this.el.stage.classList.add('autoplay');
    this.el.autoplayHud.hidden = false;
    this.el.demoHand.hidden = true;
    this.el.autoplayClaim.textContent = ui('autoplay_claim');
    this.el.autoplayEyebrow.textContent = ui('autoplay_eyebrow');
    this.el.demoHandLabel.textContent = ui('autoplay_human');
    // The first look gets a beat of its own. After that, the local director
    // works the real SDF toward the visible proposal.
    this.director.bpPauseUntil = this.time + AUTO_PHASES[1].start;
  }

  stopAutoDemo() {
    if (!this.autoDemo.active) return;
    this.autoDemo.active = false;
    this.autoDemo.stroke = null;
    this.autoDemo.baseField = null;
    this.el.autoplayHud.hidden = true;
    this.el.demoHand.hidden = true;
    this.el.demoHand.classList.remove('tracing');
    this.el.stage.classList.remove('autoplay', 'loop-soft-reset');
    this.director.cancelAutoplay();
    // Once a real hand joins, the ordinary first-touch invitation can return.
    this.pulseNextAt = this.time + 1.5;
  }

  autoPhaseAt(localTime) {
    let phase = AUTO_PHASES[0];
    for (const candidate of AUTO_PHASES) {
      if (localTime < candidate.start) break;
      phase = candidate;
    }
    return phase;
  }

  updateAutoHud(phase) {
    const bp = BLUEPRINTS[this.bp];
    this.autoDemo.progress = phase.progress;
    this.el.autoplayHud.dataset.phase = phase.id;
    this.el.blueprintNote.dataset.bp = String(this.bp);
    this.el.autoplayBlueprint.textContent = ui('autoplay_blueprint', {
      name: LANG === 'zh' ? bp.zh : bp.en,
    });
    this.el.autoplayPhase.textContent = ui('autoplay_phase_' + phase.id);
    this.el.autoplayCaption.textContent = ui('autoplay_caption_' + phase.id);
    this.el.autoplayProgress.style.transform = `scaleX(${phase.progress})`;
  }

  enterAutoPhase(phase, obs) {
    if (phase.id === 'idea') {
      this.director.bpPauseUntil = this.time + AUTO_PHASES[1].start;
    } else if (phase.id === 'making') {
      this.director.bpPauseUntil = -99;
      if (this.autoDemo.cycle === 0) {
        const l = line('loop_open');
        if (l) this.char.say(l.text, l.face, 4300);
      }
    } else if (phase.id === 'mischief') {
      this.director.prepareAutoplayMischief();
      this.beginAutoStroke(obs);
    } else if (phase.id === 'repair') {
      this.el.demoHand.hidden = true;
      this.el.demoHand.classList.remove('tracing');
    } else if (phase.id === 'almost') {
      this.director.onAutoplayAlmost();
    } else if (phase.id === 'reframe') {
      this.bp = (this.bp + 1) % BLUEPRINTS.length;
      this.syncBpChips();
      this.director.onAutoplayLooped(BLUEPRINTS[this.bp]);
    }
  }

  beginAutoStroke(obs) {
    let target = this.director.blueprintTarget(obs);
    if (!target || target.done || !target.p) target = this.director.chooseTarget(obs);
    if (!target || !target.p) return;

    const n = target.n || this.field.normal(...target.p);
    const t1 = target.t1 || tangentOf(n);
    const tool = target.tool ? flip(target.tool) : 'pull';
    const points = [];
    for (let i = 0; i < 7; i++) {
      const drift = (i - 3) * 0.038;
      points.push([
        target.p[0] + t1[0] * drift,
        target.p[1] + t1[1] * drift,
        target.p[2] + t1[2] * drift,
      ]);
    }
    this.autoDemo.stroke = {
      points,
      i: 0,
      nextAt: this.time + 0.08,
      tool,
      radius: 0.205,
      strength: 0.018,
      target: target.p.slice(),
      start: points[0].slice(),
    };
    this.placeDemoHand(target.p);
    this.el.demoHand.hidden = false;
    this.el.demoHand.classList.remove('tracing');
    void this.el.demoHand.offsetWidth;
    this.el.demoHand.classList.add('tracing');
  }

  placeDemoHand(fieldPoint) {
    const view = { w: this.el.canvas.clientWidth, h: this.el.canvas.clientHeight };
    const p = this.cam.project(this.f2w(fieldPoint), view.w, view.h);
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
    this.el.demoHand.style.setProperty('--hand-x', `${p.x.toFixed(1)}px`);
    this.el.demoHand.style.setProperty('--hand-y', `${p.y.toFixed(1)}px`);
  }

  tickAutoStroke() {
    const s = this.autoDemo.stroke;
    if (!s || s.done) return;
    this.placeDemoHand(s.target);
    while (s.i < s.points.length && this.time >= s.nextAt) {
      const p = s.points[s.i++];
      const op = {
        tool: s.tool, x: p[0], y: p[1], z: p[2],
        radius: s.radius, strength: s.strength, actor: 'demo-human',
      };
      this.field.applyBrush(op);
      this.addMark(p, s.radius, 'player', 0.9);
      s.nextAt += 0.14;
    }
    if (s.i < s.points.length) return;

    s.done = true;
    const end = s.points[s.points.length - 1].slice();
    const dv = [end[0] - s.start[0], end[1] - s.start[1], end[2] - s.start[2]];
    const dlen = Math.hypot(...dv) || 1;
    const region = regionOf(...end);
    this.lastPlayerStroke = {
      tool: s.tool, center: end, radius: s.radius, strength: s.strength,
      moved: 1, region: region.id, start: s.start.slice(), end,
      len: dlen, dir: dv.map(v => v / dlen), demo: true,
    };
    this.lastPlayerStrokeAt = this.time;
    this.director.onAutoplayMischief(end);
  }

  tickAutoDemo(obs) {
    if (!this.autoDemo.active || !this.autoDemo.started) return;
    const elapsed = Math.max(0, this.time - this.autoDemo.startedAt);
    const cycle = Math.floor(elapsed / AUTO_LOOP_SECONDS);
    const localTime = elapsed - cycle * AUTO_LOOP_SECONDS;

    if (cycle !== this.autoDemo.cycle) {
      this.autoDemo.cycle = cycle;
      this.autoDemo.stroke = null;
      // The loop can run for an exhibition day without slowly destroying the
      // field. The soft paper blink hides a rare return to the opening state.
      if (cycle > 0 && cycle % 4 === 0 && this.autoDemo.baseField) {
        this.el.stage.classList.remove('loop-soft-reset');
        void this.el.stage.offsetWidth;
        this.el.stage.classList.add('loop-soft-reset');
        this.field.load(this.autoDemo.baseField);
        this.marks.length = 0;
        this.meikkuRecent.length = 0;
        setTimeout(() => this.el.stage.classList.remove('loop-soft-reset'), 520);
      }
    }

    const phase = this.autoPhaseAt(localTime);
    if (phase.id !== this.autoDemo.phase) {
      this.autoDemo.phase = phase.id;
      this.enterAutoPhase(phase, obs);
      this.updateAutoHud(phase);
    }
    this.tickAutoStroke();
  }

  // ---- input ----------------------------------------------------------

  bindInput() {
    const c = this.el.canvas;
    this.el.stage.addEventListener('pointerdown', () => this.stopAutoDemo(), { capture: true });
    c.addEventListener('pointerdown', e => this.onDown(e));
    window.addEventListener('pointermove', e => this.onMove(e));
    window.addEventListener('pointerup', e => this.onUp(e));
    window.addEventListener('pointercancel', e => this.onUp(e));
    c.addEventListener('contextmenu', e => e.preventDefault());
    c.addEventListener('wheel', e => {
      e.preventDefault();
      this.cam.zoom(e.deltaY > 0 ? 1.08 : 0.93);
    }, { passive: false });

    window.addEventListener('keydown', e => {
      if (e.target instanceof HTMLInputElement) return;
      this.stopAutoDemo();
      const k = e.key.toLowerCase();
      if (k === 'z' && (e.ctrlKey || e.metaKey || true)) { this.undo(); }
      else if (k === '1') this.selectTool('pull');
      else if (k === '2') this.selectTool('press');
      else if (k === '3' && this.form.unlocks.smooth) this.selectTool('smooth');
      else if (k === '4' && this.form.unlocks.point) this.selectTool('point');
      else if (k === 'i') this.toggleInspect();
      else if (k === 'f') this.toggleFullscreen();
      else if (k === 'escape') { this.el.inspect.hidden = true; }
    });

    window.addEventListener('beforeunload', () => this.save(true));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.save(true);
    });
  }

  toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else this.el.stage.requestFullscreen?.();
  }

  // world -> field space and back. MUST match toField() in the shader.
  w2f(p) {
    const c = Math.cos(this.spin), s = Math.sin(this.spin);
    return [c * p[0] - s * p[2], p[1], s * p[0] + c * p[2]];
  }
  f2w(p) {
    const c = Math.cos(this.spin), s = Math.sin(this.spin);
    return [c * p[0] + s * p[2], p[1], -s * p[0] + c * p[2]];
  }

  // turn the wheel so this field point comes round to face Meikku's seat.
  // World angle of a field point = its field angle + spin, so:
  spinToward(fp) {
    const seat = this.char.workSeat;
    const want = Math.atan2(seat[0], seat[2]);
    const have = Math.atan2(fp[0], fp[2]);
    this.spinTween = { target: want - have };
  }

  pick(e) {
    const r = this.el.canvas.getBoundingClientRect();
    const ray = this.cam.ray(e.clientX - r.left, e.clientY - r.top, r.width, r.height);
    return traceField(this.field, this.w2f(ray.o), this.w2f(ray.d));
  }

  // The finished vessels ARE the proposal menu. Clicking the pot, the vase or
  // the cup switches Meikku's blueprint to that shape — the menu sits on the
  // table, not in a bar. World-space ray: props do not ride the turntable.
  // Geometry mirrors propHit() in the shader; keep the two in sync.
  propPick(e) {
    const r = this.el.canvas.getBoundingClientRect();
    const { o, d } = this.cam.ray(e.clientX - r.left, e.clientY - r.top, r.width, r.height);
    const sph = (c, rad) => {
      const oc = [o[0] - c[0], o[1] - c[1], o[2] - c[2]];
      const b = oc[0] * d[0] + oc[1] * d[1] + oc[2] * d[2];
      const h = b * b - (oc[0] * oc[0] + oc[1] * oc[1] + oc[2] * oc[2]) + rad * rad;
      if (h < 0) return -1;
      const t = -b - Math.sqrt(h);
      return t > 0.001 ? t : -1;
    };
    let best = 1e9, id = 0;
    for (const [c, rad] of [
      [[-1.65, -0.365, 0.75], 0.210], [[-1.65, -0.130, 0.75], 0.125], [[-1.65, 0.010, 0.75], 0.070],
    ]) {
      const t = sph(c, rad);
      if (t > 0 && t < best) { best = t; id = 1; }        // vase -> 瓶
    }
    {
      const A0 = 0.3167, B0 = 0.28125, y0 = -0.575, y1 = -0.255, cx = 1.62, cz = 0.30;
      const ox = o[0] - cx, oz = o[2] - cz;
      const rr0 = A0 + B0 * o[1], rb = B0 * d[1];
      const A = d[0] * d[0] + d[2] * d[2] - rb * rb;
      if (Math.abs(A) > 1e-6) {
        const Bq = ox * d[0] + oz * d[2] - rb * rr0;
        const Cq = ox * ox + oz * oz - rr0 * rr0;
        const h = Bq * Bq - A * Cq;
        if (h > 0) {
          const rt = Math.sqrt(h);
          for (const tt of [(-Bq - rt) / A, (-Bq + rt) / A]) {
            const yy = o[1] + d[1] * tt;
            if (tt > 0.001 && tt < best && yy > y0 && yy < y1) { best = tt; id = 2; break; }
          }
        }
      }
      if (Math.abs(d[1]) > 1e-4) {
        const tt = (y1 - o[1]) / d[1];
        if (tt > 0.001 && tt < best) {
          const qx = o[0] + d[0] * tt - cx, qz = o[2] + d[2] * tt - cz;
          const r1 = A0 + B0 * y1;
          if (qx * qx + qz * qz < r1 * r1) { best = tt; id = 2; }   // pot -> 盆
        }
      }
    }
    {
      const t = sph([-1.05, -0.475, 1.38], 0.100);
      if (t > 0 && t < best) { best = t; id = 3; }        // cup -> 杯
    }
    return id;                                            // 0 = none
  }

  // Nearness is judged in SCREEN pixels, not world units: zoomed in, almost
  // every ray passes near the clay in world terms and orbit would vanish;
  // zoomed out, world thresholds are too generous. Pixels match the hand.
  pickNear(e, maxPx) {
    const r = this.el.canvas.getBoundingClientRect();
    const ray = this.cam.ray(e.clientX - r.left, e.clientY - r.top, r.width, r.height);
    const near = nearestSurface(this.field, this.w2f(ray.o), this.w2f(ray.d));
    if (!near) return null;
    const proj = this.cam.project(this.f2w(near.p), r.width, r.height);
    const px = Math.hypot(e.clientX - r.left - proj.x, e.clientY - r.top - proj.y);
    return px <= maxPx ? near : null;
  }

  onDown(e) {
    if (this.cardOpen) return;
    if (this.pointer.down && this.pointer.id !== e.pointerId) return;   // one hand at a time
    // keep the stroke even if the cursor leaves the canvas mid-drag
    try { this.el.canvas.setPointerCapture?.(e.pointerId); } catch { /* synthetic or stale pointer */ }
    this.pointer.down = true;
    this.pointer.id = e.pointerId;
    this.pointer.x = this.pointer.lastX = e.clientX;
    this.pointer.y = this.pointer.lastY = e.clientY;

    // Right-drag (or middle, or alt) orbits from anywhere — the standard
    // 3D habit. A plain drag is judged by PROXIMITY, not by a pixel-exact
    // hit: human strokes begin just off the silhouette and sweep across.
    const orbitButton = e.button === 1 || e.button === 2 || e.altKey;

    if (!orbitButton) {
      const propId = this.propPick(e);
      if (propId > 0) {
        this.setBlueprint(propId === 2 ? 0 : propId === 1 ? 1 : 2);
        this.pointer.mode = null;
        return;
      }
    }

    const hit = orbitButton ? null : this.pick(e);

    if (this.tool === 'point') {
      if (hit) { this.director.onPlayerPointed(hit.p); this.selectTool('pull'); }
      else { this.pointer.mode = 'orbit'; this.el.stage.classList.add('grabbing'); }
      return;
    }

    let target = hit;
    if (!target && !orbitButton) {
      const near = this.pickNear(e, 90);
      if (near) target = { p: near.p };
    }

    if (target && !orbitButton) {
      this.pointer.mode = 'sculpt';
      const base = this.tool === 'smooth' ? 'smooth' : this.tool;
      this.direction = e.shiftKey ? flip(base) : base;
      this.el.stage.classList.add('pressing');
      this.beginStroke(target, e);
    } else {
      this.pointer.mode = 'orbit';
      this.el.stage.classList.add('grabbing');
    }
  }

  onMove(e) {
    if (this.pointer.down && this.pointer.id !== e.pointerId) return;
    if (!this.pointer.down) {
      if (!this.cardOpen) {
        const hit = this.pick(e);
        this.hover = hit ? { p: hit.p, r: this.brushRadius(), at: this.time } : null;
        // the vessels are buttons now, and buttons look pressable
        this.el.canvas.style.cursor = (!hit && this.propPick(e) > 0) ? 'pointer' : '';
      }
      return;
    }
    const dx = e.clientX - this.pointer.lastX;
    const dy = e.clientY - this.pointer.lastY;
    this.pointer.lastX = e.clientX; this.pointer.lastY = e.clientY;

    if (this.pointer.mode === 'orbit') {
      // fixed camera: dragging the background turns the CLAY, like a wheel
      this.spin += dx * 0.0075;
      this.spinTween = null;               // the hand overrules the tween
    } else if (this.pointer.mode === 'sculpt') {
      // sliding off the silhouette does not break the stroke: the smear
      // follows the nearest surface point until the hand is truly far away
      let hit = this.pick(e);
      if (!hit) {
        const near = this.pickNear(e, 140);
        if (near) hit = { p: near.p };
      }
      if (hit) { this.hover = { p: hit.p, r: this.brushRadius(), at: this.time }; this.continueStroke(hit); }
    }
  }

  onUp(e) {
    if (!this.pointer.down) return;
    if (this.pointer.id !== undefined && e.pointerId !== undefined &&
        this.pointer.id !== e.pointerId) return;
    this.pointer.down = false;
    this.el.stage.classList.remove('grabbing');
    this.el.stage.classList.remove('pressing');
    if (this.pointer.mode === 'sculpt') this.endStroke();
    this.pointer.mode = null;
  }

  // ---- the player's hand ----------------------------------------------

  brushRadius() { return this.tool === 'smooth' ? 0.24 : 0.215; }

  // 'pull'/'press' both live in this.tool now; flip() still serves shift-drag

  beginStroke(hit) {
    this.strokeSeq++;
    this.stroke = {
      id: 'stroke_' + this.strokeSeq,
      tool: this.direction,
      records: [],
      center: hit.p.slice(),
      samples: 0,
      moved: 0,
      lastAt: -1,
      lastP: null,
      thumb: this.lastFrameThumb,
      startedAt: this.time,
      p0: hit.p.slice(),          // where the surface was when the hand landed
    };
    this.applyPlayerSample(hit.p);
  }

  continueStroke(hit) {
    if (!this.stroke) return;
    const p = hit.p;
    if (this.stroke.lastP) {
      const d = Math.hypot(p[0] - this.stroke.lastP[0], p[1] - this.stroke.lastP[1], p[2] - this.stroke.lastP[2]);
      if (d < 0.035 && this.time - this.stroke.lastAt < 0.09) return;
    }
    this.applyPlayerSample(p);
  }

  applyPlayerSample(p) {
    const s = this.stroke;
    const op = {
      tool: s.tool === 'smooth' ? 'smooth' : s.tool,
      x: p[0], y: p[1], z: p[2],
      radius: this.brushRadius(),
      strength: s.tool === 'smooth' ? 0.024 : 0.019,
      actor: 'player',
    };
    const rec = this.field.applyBrush(op);
    if (!rec) return;
    s.records.push(rec);
    s.moved += rec.moved;
    s.samples++;
    s.lastAt = this.time;
    s.lastP = p.slice();
    s.center = p.slice();
    this.memory.logOp(op, 'player', this.time);
    this.addMark(p, op.radius, 'player');

    // Material refusal (thesis v13): erasing or reversing Meikku's fresh work
    // is the player saying "that's wrong" with their hands. She must notice —
    // recognition from something that cannot be refused is void.
    if (!s.contested) {
      const OPP = { press: 'pull', pull: 'press', smooth: null };
      for (let i = this.meikkuRecent.length - 1; i >= 0; i--) {
        const m = this.meikkuRecent[i];
        if (this.time - m.at > 22) break;               // list is time-ordered
        const d = Math.hypot(p[0] - m.p[0], p[1] - m.p[1], p[2] - m.p[2]);
        if (d > (op.radius + m.r) * 0.55) continue;
        const reverses = op.tool === 'smooth' || op.tool === OPP[m.tool];
        if (!reverses) continue;
        s.contested = true;
        if (this.director.onMeikkuWorkContested(m.p)) {
          // her stop-and-ask IS an answer — the disagreement joins the
          // shared history the same way agreement does
          const r = regionOf(...m.p);
          this.memory.noteBeat({
            actor: 'meikku', tool: null, at: this.time,
            point: m.p.slice(), regionId: r.id, regionLabel: r.label,
            answering: true,
          });
        }
        break;
      }
    }

    if (!this.touchedThisSession) {
      this.touchedThisSession = true;
      this.form.tutorial.touched = true;
      this.pulse = null;
      this.hideHint();
      this.form.unlocks.undo = true;
      this.applyUnlocks();
    }
  }

  endStroke() {
    const s = this.stroke;
    this.stroke = null;
    if (!s || !s.records.length) return;

    this.undoStack.push({ actor: 'player', strokeId: s.id, records: s.records });
    if (this.undoStack.length > 120) this.undoStack.shift();

    const region = regionOf(...s.center);
    // the stroke's own direction — the reply grammar answers the GESTURE,
    // not just the place, so a continued line can actually continue
    const dv = [s.center[0] - s.p0[0], s.center[1] - s.p0[1], s.center[2] - s.p0[2]];
    const dlen = Math.hypot(dv[0], dv[1], dv[2]);
    this.lastPlayerStroke = {
      tool: s.tool, center: s.center, radius: this.brushRadius(),
      strength: 0.017, moved: s.moved, region: region.id,
      start: s.p0.slice(), end: s.center.slice(), len: dlen,
      dir: dlen > 0.05 ? [dv[0] / dlen, dv[1] / dlen, dv[2] / dlen] : null,
    };
    this.lastPlayerStrokeAt = this.time;

    this.memory.noteBeat({
      actor: 'player', tool: s.tool, at: this.time,
      point: s.center.slice(), regionId: region.id, regionLabel: region.label,
      thumb: s.thumb,
    });

    // The proposal sensor: the player's VERB against what the blueprint asks
    // for at the touched spot. Field differencing cannot work here — the
    // volume-conserving brush pairs every dent with a rim and sums to nearly
    // zero — but the verb is unambiguous: where the dashes say "too much"
    // (e > 0), pressing is help and pulling is mischief; where they say
    // "missing" (e < 0), the reverse. Smooth stays neutral.
    if (s.tool !== 'smooth' && s.moved > 40) {
      const e = bpSDF(this.bp, s.p0[0], s.p0[1], s.p0[2]);
      if (Math.abs(e) > 0.06) {
        const toward = (e > 0 && s.tool === 'press') || (e < 0 && s.tool === 'pull');
        if (toward) this.director.onProposalHelped(s.center);
        else this.director.onProposalHindered(s.center);
      }
    }

    // How far did the surface actually travel where the hand landed? Working
    // hard in one place loads the clay; sweeping lightly across it does not.
    const disp = Math.abs(this.field.sample(s.p0[0], s.p0[1], s.p0[2]));
    if (disp > 0.09 && s.tool !== 'smooth' && this.time - this.lastMaterialAt > 20) {
      this.lastMaterialAt = this.time;
      this.field.load_region(s.p0[0], s.p0[1], s.p0[2], this.brushRadius(),
        Math.min(1, 0.3 + disp / 0.14));
    }

    this.checkUnlocks();
    this.queueSave();
  }

  // A mark answers one question: whose hand was JUST here. It is loud while
  // fresh and then it leaves entirely - the changed shape is the permanent
  // record, the colour is only the recency. Colour that never faded is what
  // made the clay look randomly stained.
  addMark(p, r, actor, w = 0.85) {
    const tint = PIGMENT[actor];
    const near = this.marks.find(m =>
      m.actor === actor && Math.hypot(m.p[0] - p[0], m.p[1] - p[1], m.p[2] - p[2]) < r * 0.5);
    if (near) { near.p = p.slice(); near.weight = Math.min(0.92, Math.max(near.weight, w)); return; }
    this.marks.push({ p: p.slice(), r: r * 1.05, color: tint, weight: w, actor, at: this.time });
    if (this.marks.length > 16) this.marks.shift();
  }

  undo() {
    const group = this.undoStack.pop();
    if (!group) return;
    for (let i = group.records.length - 1; i >= 0; i--) this.field.undo(group.records[i]);
    if (group.actor === 'meikku') this.director.onPlayerUndoOfMeikku();
    const mi = this.marks.findIndex(m => m.actor === group.actor);
    if (mi >= 0) this.marks.splice(mi, 1);
    this.queueSave();
  }

  // ---- Meikku's hand --------------------------------------------------

  applyMeikkuOp(op, intent) {
    const rec = this.field.applyBrush(op);
    if (!rec) return;
    this.meikkuRecent.push({ p: [op.x, op.y, op.z], r: op.radius, tool: op.tool, at: this.time });
    if (this.meikkuRecent.length > 24) this.meikkuRecent.shift();
    const autoplay = this.autoDemo.active;
    if (!autoplay && (!this.meikkuGroup || this.meikkuGroup.intent !== intent)) {
      this.meikkuGroup = { actor: 'meikku', strokeId: 'meikku_' + this.time.toFixed(2), records: [], intent };
      this.undoStack.push(this.meikkuGroup);
      const region = regionOf(op.x, op.y, op.z);
      this.memory.noteBeat({
        actor: 'meikku', tool: op.tool, at: this.time,
        point: [op.x, op.y, op.z], regionId: region.id, regionLabel: region.label,
        answering: this.time - this.lastPlayerStrokeAt < 30 || intent.selfStarted !== true,
        intentId: intent.attentionRegion,
      });
      if (!this.form.tutorial.sawMeikkuAct) {
        this.form.tutorial.sawMeikkuAct = true;
        this.queueSave();
      }
    }
    if (!autoplay) {
      this.meikkuGroup.records.push(rec);
      this.memory.logOp(op, 'meikku', this.time);
    }
    // unattended work stains half as loudly, so an idle hour does not paint
    // the whole lump green
    this.addMark([op.x, op.y, op.z], op.radius, 'meikku', intent && intent.selfStarted ? 0.45 : 0.85);
    this.lastMeikkuPoint = [op.x, op.y, op.z];
    this.director.undoStreak = 0;
    if (!autoplay) this.queueSave();
  }

  // ---- modes, unlocks, tutorial ---------------------------------------

  applyUnlocks() {
    const u = this.form.unlocks;
    for (const btn of this.el.tools.querySelectorAll('.tool')) {
      const t = btn.dataset.tool;
      if (t === 'smooth' && u.smooth) btn.hidden = false;
      if (t === 'point' && u.point) btn.hidden = false;
      btn.setAttribute('aria-pressed', String(btn.dataset.tool === this.tool));
    }
    this.el.btnUndo.hidden = !u.undo;
    this.el.btnMemory.hidden = this.memory.episodes.length === 0;
  }

  checkUnlocks() {
    const u = this.form.unlocks;
    const playerStrokes = this.undoStack.filter(g => g.actor === 'player').length;
    if (!u.smooth && this.form.tutorial.sawMeikkuAct && playerStrokes >= 2) {
      u.smooth = true;
      this.reveal('smooth');
      const l = line('unlock_smooth');
      if (l) this.char.say(l.text, l.face, 5000);
    }
    if (!u.point && u.smooth && playerStrokes >= 4) {
      u.point = true;
      this.reveal('point');
      const l = line('unlock_point');
      if (l) this.char.say(l.text, l.face, 5000);
    }
  }

  reveal(tool) {
    const btn = this.el.tools.querySelector(`[data-tool="${tool}"]`);
    if (!btn) return;
    btn.hidden = false;
    btn.classList.add('justunlocked');
    setTimeout(() => btn.classList.remove('justunlocked'), 500);
  }

  selectTool(t) {
    this.tool = t;
    this.direction = t === 'smooth' || t === 'point' ? t : t;   // pull/press map 1:1
    for (const btn of this.el.tools.querySelectorAll('.tool')) {
      btn.setAttribute('aria-pressed', String(btn.dataset.tool === t));
    }
  }

  // The mode advances silently. It is recognised by what Meikku starts doing,
  // not by a chip changing its word.
  advanceMode() {
    const order = ['first_touch', 'echo', 'two_hands'];
    const i = order.indexOf(this.form.mode);
    if (i < 0 || i === order.length - 1) return;
    this.form.mode = order[i + 1];
  }

  showHint(text, ms = 4000) {
    this.el.hint.textContent = text;
    this.el.hint.hidden = false;
    clearTimeout(this._hintT);
    this._hintT = setTimeout(() => this.hideHint(), ms);
  }

  hideHint() { this.el.hint.hidden = true; }

  // ---- shared moments -------------------------------------------------

  checkMoment() {
    if (this.cardOpen || this.stroke) return;
    const closure = this.memory.findClosure(this.time);
    if (!closure) return;
    const draft = this.memory.draft(closure, this.form.id);
    draft.thumbBefore = closure.first.thumb || thumbnail(this.el.canvas);
    draft.thumbAfter = thumbnail(this.el.canvas);
    this.openMomentCard(draft);
  }

  // The card shows, it does not narrate: before, after, a name if you want
  // one. The play-by-play still lives in the episode data for the exports.
  openMomentCard(draft) {
    this.cardOpen = true;
    this.draft = draft;
    this.el.shotBefore.src = draft.thumbBefore || '';
    this.el.shotAfter.src = draft.thumbAfter || '';
    this.el.momentName.value = '';
    this.el.card.hidden = false;
  }

  closeMomentCard(kept) {
    this.el.card.hidden = true;
    this.cardOpen = false;
    if (kept && this.draft) {
      this.draft.name = this.el.momentName.value.trim();
      this.memory.keep(this.draft, this.time);
      this.form.moments++;
      const l = line('moment_kept', { name: this.draft.name || '' });
      if (l) this.char.say(l.text, l.face, 4600);
      if (!this.form.tutorial.firstMoment) this.form.tutorial.firstMoment = true;
      this.renderEpisodes();
      this.renderWallPins();
    } else {
      this.memory.skip(this.time);
      const l = line('moment_skipped');
      if (l) this.char.say(l.text, l.face, 3400);
    }
    // A closed mutual change is what advances the mode. Whether the player
    // wanted to keep the card is a separate question.
    this.advanceMode();
    this.draft = null;
    this.el.btnMemory.hidden = this.memory.episodes.length === 0;
    this.queueSave();
  }

  setBlueprint(id) {
    if (id === this.bp) return;
    this.bp = id;
    this.syncBpChips();
    this.director.onProposalSwitched(BLUEPRINTS[id]);
    this.queueSave();
  }

  syncBpChips() {
    for (const btn of document.querySelectorAll('#bpBar .bp'))
      btn.classList.toggle('on', +btn.dataset.bp === this.bp);
  }

  // ---- ui -------------------------------------------------------------

  bindUi() {
    for (const btn of this.el.tools.querySelectorAll('.tool')) {
      btn.addEventListener('click', () => this.selectTool(btn.dataset.tool));
    }

    // Meikku's proposal, switchable at any time — and she reacts to the switch
    for (const btn of document.querySelectorAll('#bpBar .bp')) {
      btn.addEventListener('click', () => this.setBlueprint(+btn.dataset.bp));
    }
    this.syncBpChips();
    this.el.btnUndo.addEventListener('click', () => this.undo());
    this.el.btnInspect.addEventListener('click', () => this.toggleInspect());
    this.el.btnMemory.addEventListener('click', () => this.toggleInspect(true));
    this.el.inspectClose.addEventListener('click', () => { this.el.inspect.hidden = true; });
    this.el.momentKeep.addEventListener('click', () => this.closeMomentCard(true));
    this.el.momentSkip.addEventListener('click', () => this.closeMomentCard(false));
    this.el.momentName.addEventListener('keydown', e => {
      if (e.key === 'Enter') this.closeMomentCard(true);
    });

    this.el.expPng.addEventListener('click', () => {
      this.drawNow();
      exportPng(this.el.canvas, this.meta());
    });
    this.el.expGlb.addEventListener('click', () => {
      const tris = exportGlb(this.field, this.meta());
      this.showHint(`GLB · ${tris.toLocaleString()} triangles`, 3200);
    });
    this.el.expLog.addEventListener('click', () => exportLog({
      form: this.meta(),
      provenance: {
        class: 'BORN-DIGITAL FORM',
        note: 'Generated inside the game. No scan, no real-world source, not a verified twin.',
      },
      ...this.memory.serialize(),
    }, this.meta()));

    this.el.btnNewForm.addEventListener('click', async () => {
      if (!confirm(LANG === 'zh'
        ? '新建一块干净的形体？当前这块和它的记忆会被替换。'
        : 'Start a clean form? The current one and its memory are replaced.')) return;
      // stop the unload handler from writing the discarded form straight back
      this.discarding = true;
      await clearState(SAVE_KEY);
      location.reload();
    });

    this.el.btnLang.addEventListener('click', () => {
      localStorage.setItem('meikku_lang', LANG === 'zh' ? 'en' : 'zh');
      this.save(true);
      location.reload();
    });

  }

  toggleInspect(force) {
    const show = force === true ? true : this.el.inspect.hidden;
    this.el.inspect.hidden = !show;
    if (show) { this.renderPassport(); this.renderEpisodes(); this.renderIntentLog(); }
  }

  // one render, right now, so a capture in this same task sees real pixels
  // the blueprint's centre in gl-oriented CSS pixels: dash phase runs round it
  bpCenterPx(view) {
    const p = this.cam.project([0, -0.05, 0], view.w, view.h);
    return [p.x, view.h - p.y];
  }

  drawNow() {
    const view = { w: this.el.canvas.clientWidth, h: this.el.canvas.clientHeight };
    // First frame after navigation can arrive before layout: clientWidth is 0,
    // aspect becomes 0, the projection matrix goes Inf, and every smoothed
    // screen position downstream inherits NaN permanently. Skip the frame.
    if (view.w < 2 || view.h < 2) { requestAnimationFrame(t => this.loop(t)); return; }
    this.cam.aspect = view.w / Math.max(1, view.h);
    this.cam.update();
    this.renderer.uploadDirty(this.field);
    this.renderer.draw(this.cam, {
      spin: this.spin,
      bp: this.bp,
      bpC: this.bpCenterPx(view),
      cursor: [0, 0, 0, -1],
      cursorTint: PIGMENT.player,
      attn: [0, 0, 0, -1],
      pulse: [0, 0, 0, -1],
      pulseAge: 0,
    }, this.marks, H, this.time);
  }

  meta() {
    return {
      name: this.form.name,
      mode: MODES[this.form.mode].label,
      ops: this.memory.opLog.length,
      moments: this.memory.episodes.length,
      date: new Date().toISOString().slice(0, 10),
      formId: this.form.id,
      origin: 'BORN-DIGITAL FORM',
    };
  }

  renderPassport() {
    const eps = this.memory.episodes;
    const rows = [
      ['NAME', this.form.name],
      ['TYPE', 'BORN-DIGITAL FORM'],
      ['ORIGIN', `${MODES[this.form.mode].label} / ${new Date(this.form.created).toISOString().slice(0, 10)}`],
      ['OPERATIONS', String(this.memory.opLog.length)],
      ['EPISODES', `${eps.length} shared moments`],
      ['MEMORY', `${eps.filter(e => e.status === 'confirmed').length} confirmed / ` +
                 `${eps.filter(e => e.status === 'corrected').length} corrected / ` +
                 `${eps.filter(e => e.status === 'forgotten').length} forgotten`],
      ['DIRECTOR', LANG === 'zh' ? '本地，无联网' : 'local, offline'],
      ['CHARACTER', LANG === 'zh' ? '临时 rig，视觉未定稿' : 'placeholder rig, not final'],
    ];
    this.el.passport.innerHTML = rows.map(([k, v]) =>
      `<div><dt>${k}</dt><dd>${escapeHtml(v)}</dd></div>`).join('');
  }

  renderEpisodes() {
    const list = this.el.episodeList;
    const eps = this.memory.episodes;
    if (!eps.length) {
      list.innerHTML = `<img class="empty-art" alt=""
          src="empty-memory.svg" />
        <p class="empty">${LANG === 'zh' ? '还什么都没有。' : 'Nothing yet.'}</p>`;
      return;
    }
    list.innerHTML = '';
    for (const ep of eps.slice().reverse()) {
      const div = document.createElement('div');
      div.className = 'ep' + (ep.status === 'corrected' ? ' corrected' : ep.status === 'forgotten' ? ' forgotten' : '');
      const title = ep.name || (LANG === 'zh' ? '未命名的一下' : 'unnamed moment');
      div.innerHTML =
        `<div class="ep-title">${escapeHtml(title)}</div>` +
        `<div class="ep-meta">${ep.id} · ${ep.regionLabel || ep.regionId} · ` +
        `${new Date(ep.ts).toLocaleString()} · ${ui('ep_' + ep.status)}</div>` +
        `<div>${ep.steps.map(escapeHtml).join(' → ')}</div>` +
        (ep.correction ? `<div class="ep-correction">${escapeHtml(ep.correction)}</div>` : '');

      const acts = document.createElement('div');
      acts.className = 'ep-acts';
      if (ep.status !== 'forgotten') {
        const bc = document.createElement('button');
        bc.textContent = LANG === 'zh' ? '修正' : 'CORRECT';
        bc.onclick = () => this.startCorrection(ep, div);
        const bf = document.createElement('button');
        bf.textContent = LANG === 'zh' ? '删除' : 'FORGET';
        bf.onclick = () => {
          this.memory.forget(ep.id);
          this.director.onMemoryForgotten();
          this.renderEpisodes(); this.queueSave();
        };
        acts.append(bc, bf);
      }
      const bg = document.createElement('button');
      bg.textContent = LANG === 'zh' ? '看这里' : 'SHOW ME';
      bg.onclick = () => {
        if (ep.point) { this.cam.nudgeToward(ep.point, 0.9); this.attn = { p: ep.point, r: 0.28 }; }
      };
      acts.append(bg);
      div.appendChild(acts);
      list.appendChild(div);
    }
  }

  startCorrection(ep, div) {
    const wrap = document.createElement('div');
    const inp = document.createElement('input');
    inp.className = 'namefield';
    inp.placeholder = ui('correct_prompt');
    inp.value = ep.correction || '';
    const ok = document.createElement('button');
    ok.textContent = 'OK';
    ok.style.marginTop = '6px';
    ok.className = '';
    ok.onclick = () => {
      const text = inp.value.trim();
      if (text) {
        this.memory.correct(ep.id, text);
        this.director.onMemoryCorrected();
        this.queueSave();
      }
      this.renderEpisodes();
    };
    wrap.append(inp, ok);
    div.appendChild(wrap);
    inp.focus();
  }

  renderIntentLog() {
    const items = this.memory.intents.slice(-6).reverse();
    this.el.intentLog.textContent = items.length
      ? items.map(i => JSON.stringify({
          attentionRegion: i.attentionRegion, intent: i.intent, tool: i.tool,
          strength: i.strength, delivery: i.delivery,
          memoryEpisodeId: i.memoryEpisodeId, spokenLine: i.spokenLine,
        }, null, 1)).join('\n\n')
      : (LANG === 'zh' ? '还没有意图。' : 'no intents yet.');
  }

  // ---- persistence ----------------------------------------------------

  queueSave() {
    clearTimeout(this.pendingSave);
    this.pendingSave = setTimeout(() => this.save(), 1400);
  }

  save(sync = false) {
    clearTimeout(this.pendingSave);
    if (this.discarding) return;
    const payload = {
      v: 1,
      form: this.form,
      field: this.field.snapshot(),
      camera: { yaw: this.cam.yaw, pitch: this.cam.pitch, dist: this.cam.dist },
      spin: this.spin,
      bp: this.bp,
      memory: this.memory.serialize(),
      marks: this.marks.map(m => ({ p: m.p, r: m.r, color: m.color, weight: m.weight, actor: m.actor })),
      savedAt: Date.now(),
    };
    saveState(SAVE_KEY, payload);
  }

  observation() {
    return {
      now: this.time,
      field: this.field,
      mode: this.form.mode,
      playerBusy: !!this.stroke,
      playerPoint: this.hover ? this.hover.p : null,
      lastPlayerStroke: this.lastPlayerStroke,
      lastPlayerStrokeAt: this.lastPlayerStrokeAt,
      lastMeikkuPoint: this.lastMeikkuPoint,
      camEye: this.w2f(this.cam.eye),
      firstAnswer: !this.form.tutorial.sawMeikkuAct && !this.autoDemo.active,
      memoryPoints: this.memory.episodes.filter(e => e.point).slice(-8)
        .map(e => ({ point: e.point, status: e.status })),
      homeSide: this.w2f(this.char.workSeat),
      blueprint: { id: this.bp, sdf: (x, y, z) => bpSDF(this.bp, x, y, z) },
      spinning: !!this.spinTween,
    };
  }

  advanceTime(ms) {
    const seconds = Math.max(0, Number(ms) || 0) / 1000;
    if (seconds === 0) return Promise.resolve();
    return new Promise(resolve => this.manualSteps.push({ remaining: seconds, resolve }));
  }

  renderGameToText() {
    const bp = BLUEPRINTS[this.bp];
    return JSON.stringify({
      coordinateSystem: 'field origin is clay centre; +x right, +y up, +z toward the near table edge',
      mode: this.form.mode,
      provenance: 'BORN-DIGITAL FORM',
      autoplay: {
        active: this.autoDemo.active,
        embeddedPaused: this.embedPaused,
        loop: 'infinite',
        phase: this.autoDemo.phase || null,
        blueprint: LANG === 'zh' ? bp.zh : bp.en,
        progress: Number(this.autoDemo.progress.toFixed(2)),
        simulatedHumanDetour: !!this.autoDemo.stroke && !this.autoDemo.stroke.done,
      },
      meikku: {
        state: this.director.state,
        speaking: this.char.bubble.hidden ? null : this.char.bubbleText.textContent,
        lastPoint: this.lastMeikkuPoint,
      },
      visible: {
        hint: this.el.hint.hidden ? null : this.el.hint.textContent,
        inspectOpen: !this.el.inspect.hidden,
        controls: [...this.el.tools.querySelectorAll('.tool:not([hidden])')].map(b => b.dataset.tool),
      },
    });
  }

  // ---- frame ----------------------------------------------------------

  loop(tms) {
    const now = tms / 1000;
    if (this.embedPaused) {
      this.lastT = now;
      requestAnimationFrame(t => this.loop(t));
      return;
    }
    // Clamped on BOTH sides. A backwards timestamp (tab resume, clock skew)
    // makes the exponential smoothing coefficients blow up past 1 and the
    // character's screen position diverges to ±1e38 within a few frames.
    const manual = this.manualSteps[0];
    const wallDt = Math.min(0.05, Math.max(0.001, this.lastT ? now - this.lastT : 0.016));
    const dt = manual ? Math.min(0.05, Math.max(0.001, manual.remaining)) : wallDt;
    if (manual) manual.remaining -= dt;
    this.lastT = now;
    this.time += dt;

    // What the clay does on its own is an operation like any other. Logging it
    // is what makes a replay a replay rather than a screen recording, and what
    // lets undo put back a slump.
    const steps = this.field.settle(dt);
    for (const st of steps) {
      const reg = st.reg;
      if (st.rec) {
        if (!reg.group) {
          reg.group = { actor: 'material', strokeId: 'settle_' + this.time.toFixed(2), records: [] };
          this.undoStack.push(reg.group);
        }
        reg.group.records.push(st.rec);
        this.memory.logOp({
          tool: 'settle', x: reg.x, y: reg.y, z: reg.z, radius: reg.r, strength: st.k,
        }, 'material', this.time);
      }
      if (!reg.reported && reg.age > 0.28) {
        reg.reported = true;
        const r = regionOf(reg.x, reg.y, reg.z);
        this.memory.noteBeat({
          actor: 'material', tool: null, at: this.time,
          point: [reg.x, reg.y, reg.z], regionId: r.id, regionLabel: r.label,
        });
        this.director.onMaterialMoved(reg);
        this.queueSave();
      }
    }

    // the pulse may not squat on the clay forever: it asks, waits, lets go
    if (this.pulse && this.time - this.pulse.at > 12) {
      this.pulse = null;
      this.pulseNextAt = this.time + 9;
    }

    // the opening: the form asks first, in the material, not in a panel
    if (!this.touchedThisSession && !this.autoDemo.active) {
      if (this.time > (this.pulseNextAt || 3) && !this.pulse) {
        const hit = traceField(this.field, this.w2f(this.cam.eye),
          this.w2f(norm([-this.cam.eye[0] + 0.12, -this.cam.eye[1] + 0.18, -this.cam.eye[2]])));
        if (hit) {
          this.pulse = { p: hit.p, r: 0.34, at: this.time };
          this.showHint(ui('hint_drag'), 6000);
        }
      }

    }

    // Meikku turning the wheel: a smooth, interruptible approach
    if (this.spinTween) {
      let dsp = this.spinTween.target - this.spin;
      while (dsp > Math.PI) dsp -= Math.PI * 2;
      while (dsp < -Math.PI) dsp += Math.PI * 2;
      this.spin += dsp * (1 - Math.pow(0.02, dt));
      if (Math.abs(dsp) < 0.02) this.spinTween = null;
    }
    // while the wheel turns for her, her hand rests on the lump's near side
    if (this.spinTween) {
      const seat = this.char.workSeat;
      const n0 = Math.hypot(seat[0], seat[2]) || 1;
      this.char.wheelHand = [seat[0] / n0 * 0.82, -0.30, seat[2] / n0 * 0.82];
    } else {
      this.char.wheelHand = null;
    }

    this.tickAutoDemo(this.observation());
    this.director.tick(dt, this.observation());


    // A glance at the hand when it moves, then back to the clay. A creature
    // that silently TRACKS your cursor is being watched, not being with.
    if (this.attn) this.char.gaze = this.f2w(this.attn.p);
    else if (this.hover && this.time - this.hover.at < 0.8) this.char.gaze = this.f2w(this.hover.p);
    else this.char.gaze = this.lastMeikkuPoint ? this.f2w(this.lastMeikkuPoint) : [0, 0.05, 0.35];

    const view = { w: this.el.canvas.clientWidth, h: this.el.canvas.clientHeight };
    this.cam.aspect = view.w / Math.max(1, view.h);
    this.cam.update();
    this.char.update(dt, this.cam, view);

    this.renderer.uploadDirty(this.field);
    this.renderer.draw(this.cam, {
      cursor: this.hover && !this.cardOpen
        ? [this.hover.p[0], this.hover.p[1], this.hover.p[2], this.hover.r] : [0, 0, 0, -1],
      cursorTint: this.direction === 'press' ? [0.831, 0.153, 0.094] : PIGMENT.player,
      attn: this.attn ? [this.attn.p[0], this.attn.p[1], this.attn.p[2], this.attn.r] : [0, 0, 0, -1],
      pulse: this.pulse ? [this.pulse.p[0], this.pulse.p[1], this.pulse.p[2], this.pulse.r] : [0, 0, 0, -1],
      pulseAge: this.pulse ? this.time - this.pulse.at : 0,
      spin: this.spin,
      bp: this.bp,
      bpC: this.bpCenterPx(view),
    }, this.marks, H, this.time);

    this.firstFrameDone();

    // The canvas may only be read in the same task as the draw that filled it,
    // so every capture happens here: a rolling "before" frame, and the shared
    // moment check that needs an "after".
    if (!this.stroke && !this.cardOpen && this.time - this.lastThumbAt > 1.2) {
      this.lastFrameThumb = thumbnail(this.el.canvas);
      this.lastThumbAt = this.time;
    }
    if (!this.cardOpen && !this.autoDemo.active) this.checkMoment();

    // marks fade all the way out - the colour is recency, not ownership
    for (const m of this.marks) m.weight -= dt * 0.014;
    this.marks = this.marks.filter(m => m.weight > 0.04);

    this.renderer.adapt(dt * 1000);
    this.frames = (this.frames || 0) + 1;
    if (DEBUG && (!this._fpsT || now - this._fpsT > 0.5)) {
      const fps = Math.round(this.frames / (now - (this._fpsT || now - 0.5)));
      this.el.fps.textContent = `${fps} fps · ${this.memory.opLog.length} ops · ${this.director.state}`;
      this.frames = 0; this._fpsT = now;
    }

    if (manual && manual.remaining <= 0.00001) {
      this.manualSteps.shift();
      manual.resolve();
    }
    requestAnimationFrame(t => this.loop(t));
  }
}

function flip(t) { return t === 'press' ? 'pull' : 'press'; }
function tangentOf(n) {
  const axis = Math.abs(n[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  return norm([
    n[1] * axis[2] - n[2] * axis[1],
    n[2] * axis[0] - n[0] * axis[2],
    n[0] * axis[1] - n[1] * axis[0],
  ]);
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// ---- start ------------------------------------------------------------

try {
  const game = new Game();
  window.__meikku = game;
  window.render_game_to_text = () => game.renderGameToText();
  window.advanceTime = ms => game.advanceTime(ms);
  if (WORLD_EMBED) {
    window.addEventListener('message', event => {
      if (event.source !== window.parent || event.origin !== window.location.origin) return;
      if (event.data?.type !== 'meikku:visibility') return;
      game.embedPaused = !Boolean(event.data.active);
      document.documentElement.dataset.embedState = game.embedPaused ? 'paused' : 'playing';
      game.lastT = 0;
    });
  }
  game.boot();
} catch (err) {
  console.error(err);
  const box = document.createElement('div');
  box.className = 'errbox';
  box.innerHTML = `<h2>THIS BROWSER CANNOT RUN IT</h2>
    <p>需要支持 WebGL2 的桌面浏览器（Chrome / Edge）。<br>Requires a desktop browser with WebGL2.</p>
    <p style="color:#5C5C58;font-size:12px">${escapeHtml(err.message || String(err))}</p>`;
  document.getElementById('stage').appendChild(box);
  document.getElementById('boot').hidden = true;
}
