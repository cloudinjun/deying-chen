// character.js — Meikku's body on screen.
//
// THE ROBOT. The character gate (GDD §19.1) was closed by the user with a
// mock: a boxy robot with the same screen face as the exhibition chat UI —
// dark screen, two blue eyes, antenna — and two articulated arms with blue
// ball joints and claw grippers, working the clay from beside the table.
// One identity across chat and game: the face IS the chat face.
//
// The body is stationary (it has a place at the table; the wheel brings the
// work to it). All travel is done by the two arms: the WORK arm reaches the
// exact op point — or the wheel while the clay turns — and the SUPPORT arm
// holds the lump's flank while working: the embrace from the mock.

const RIG = `
<defs><clipPath id="mkWaistClip"><rect x="-140" y="-160" width="540" height="404"/></clipPath></defs>
<g id="mkRobo">
  <!-- both arms first: shoulders tuck behind the torso -->
  <path id="aLseg1" fill="#E2DFD6" stroke="#232322" stroke-width="3.4" stroke-linejoin="round"/>
  <path id="aLseg1sh" fill="#C4BFAF" opacity="0.9"/>
  <path id="aLseg1hi" fill="#FFFFFF" opacity="0.55"/>
  <path id="aLseg2" fill="#E2DFD6" stroke="#232322" stroke-width="3.4" stroke-linejoin="round"/>
  <path id="aLseg2sh" fill="#C4BFAF" opacity="0.9"/>
  <path id="aLseg2hi" fill="#FFFFFF" opacity="0.55"/>
  <g id="aLj1g">
    <circle r="14" fill="#2E68E8" stroke="#232322" stroke-width="3.4"/>
    <circle cx="-4.2" cy="-4.2" r="8.4" fill="#5B8BF0"/>
    <circle cx="-6.2" cy="-6.2" r="3.5" fill="#D9E6FF"/>
  </g>
  <g id="aLj2g">
    <circle r="12" fill="#2E68E8" stroke="#232322" stroke-width="3.4"/>
    <circle cx="-3.6" cy="-3.6" r="7.2" fill="#5B8BF0"/>
    <circle cx="-5.3" cy="-5.3" r="3" fill="#D9E6FF"/>
  </g>
  <g id="aLwrist">
    <circle r="10" fill="#2E68E8" stroke="#232322" stroke-width="3.4"/>
    <circle cx="-3" cy="-3" r="6" fill="#5B8BF0"/>
    <circle cx="-4.4" cy="-4.4" r="2.5" fill="#D9E6FF"/>
    <path d="M8.4 -7.6 Q23.4 -10.6 30.4 -2.6 L23.9 -0.2 Q18.4 -5.6 8.4 -3.2 Z" fill="#4A4A46"/>
    <path d="M8.4 10.4 Q23.4 13.4 30.4 5.4 L23.9 3 Q18.4 8.4 8.4 6 Z" fill="#4A4A46"/>
    <path d="M7 -9 Q22 -12 29 -4 L22.5 -1.6 Q17 -7 7 -4.6 Z" fill="#232322"/>
    <path d="M7 9 Q22 12 29 4 L22.5 1.6 Q17 7 7 4.6 Z" fill="#232322"/>
  </g>
  <path id="aRseg1" fill="#E2DFD6" stroke="#232322" stroke-width="3.4" stroke-linejoin="round"/>
  <path id="aRseg1sh" fill="#C4BFAF" opacity="0.9"/>
  <path id="aRseg1hi" fill="#FFFFFF" opacity="0.55"/>
  <path id="aRseg2" fill="#E2DFD6" stroke="#232322" stroke-width="3.4" stroke-linejoin="round"/>
  <path id="aRseg2sh" fill="#C4BFAF" opacity="0.9"/>
  <path id="aRseg2hi" fill="#FFFFFF" opacity="0.55"/>
  <g id="aRj1g">
    <circle r="14" fill="#2E68E8" stroke="#232322" stroke-width="3.4"/>
    <circle cx="-4.2" cy="-4.2" r="8.4" fill="#5B8BF0"/>
    <circle cx="-6.2" cy="-6.2" r="3.5" fill="#D9E6FF"/>
  </g>
  <g id="aRj2g">
    <circle r="12" fill="#2E68E8" stroke="#232322" stroke-width="3.4"/>
    <circle cx="-3.6" cy="-3.6" r="7.2" fill="#5B8BF0"/>
    <circle cx="-5.3" cy="-5.3" r="3" fill="#D9E6FF"/>
  </g>
  <g id="aRwrist">
    <circle r="10" fill="#2E68E8" stroke="#232322" stroke-width="3.4"/>
    <circle cx="-3" cy="-3" r="6" fill="#5B8BF0"/>
    <circle cx="-4.4" cy="-4.4" r="2.5" fill="#D9E6FF"/>
    <path d="M8.4 -7.6 Q23.4 -10.6 30.4 -2.6 L23.9 -0.2 Q18.4 -5.6 8.4 -3.2 Z" fill="#4A4A46"/>
    <path d="M8.4 10.4 Q23.4 13.4 30.4 5.4 L23.9 3 Q18.4 8.4 8.4 6 Z" fill="#4A4A46"/>
    <path d="M7 -9 Q22 -12 29 -4 L22.5 -1.6 Q17 -7 7 -4.6 Z" fill="#232322"/>
    <path d="M7 9 Q22 12 29 4 L22.5 1.6 Q17 7 7 4.6 Z" fill="#232322"/>
  </g>

  <g id="mkBody" clip-path="url(#mkWaistClip)">
    <!-- hips / pedestal -->
    <rect x="98" y="262" width="64" height="38" rx="10" fill="#F1E6D2" stroke="#232322" stroke-width="4"/>
    <!-- torso -->
    <rect x="88" y="150" width="84" height="118" rx="16" fill="#FBF3E6" stroke="#232322" stroke-width="4"/>
    <path d="M96 236 L164 236" stroke="#232322" stroke-width="2" opacity="0.35"/>
    <!-- neck -->
    <rect x="120" y="138" width="20" height="14" rx="4" fill="#F1E6D2" stroke="#232322" stroke-width="3.4"/>

    <g id="mkHead">
      <!-- antenna -->
      <path id="mkAntenna" d="M138 46 L156 14" stroke="#232322" stroke-width="4" stroke-linecap="round"/>
      <circle id="mkAntBall" cx="158" cy="11" r="7.5" fill="#2E68E8" stroke="#232322" stroke-width="3.4"/>
      <!-- head + screen: the chat face -->
      <rect x="72" y="44" width="116" height="70" rx="18" fill="#FBF3E6" stroke="#232322" stroke-width="4"/>
      <rect x="84" y="56" width="92" height="46" rx="11" fill="#17171A" stroke="#232322" stroke-width="3"/>
      <g id="mkEyes">
        <rect id="mkEyeL" x="103" y="70" width="15" height="17" rx="5" fill="#2E68E8"/>
        <rect id="mkEyeR" x="139" y="70" width="15" height="17" rx="5" fill="#2E68E8"/>
      </g>
    </g>
  </g>
</g>`;

// face -> how the two screen eyes carry the feeling. One pipeline, same
// vocabulary the line decks use. hL/hR: eye heights (asymmetry = curiosity),
// dy: vertical shift, rot: counter-tilt, tilt: whole-head lean.
const FACES = {
  idle:      { hL: 16, hR: 16, dy: 0,  rot: 0, tilt: 0 },
  listening: { hL: 17, hR: 17, dy: 0,  rot: 0, tilt: -2 },
  thinking:  { hL: 12, hR: 12, dy: -4, rot: 0, tilt: -4 },
  speaking:  { hL: 18, hR: 18, dy: 0,  rot: 0, tilt: 0 },
  watching:  { hL: 16, hR: 16, dy: 0,  rot: 0, tilt: 0 },
  pleased:   { hL: 8,  hR: 8,  dy: 2,  rot: 0, tilt: 2 },
  sorry:     { hL: 9,  hR: 9,  dy: 4,  rot: 0, tilt: 4 },
  unsure:    { hL: 11, hR: 11, dy: 1,  rot: 9, tilt: 5 },
  curious:   { hL: 20, hR: 13, dy: -1, rot: 0, tilt: -5 },
};

// state -> posture: how far the WORK arm commits, whether the SUPPORT arm
// holds the lump (the embrace)
const POSE = {
  ARRIVING:    { face: 'curious',   arm: 0.0,  hold: false },
  CURIOUS:     { face: 'curious',   arm: 0.0,  hold: false },
  WATCHING:    { face: 'watching',  arm: 0.0,  hold: false },
  PREPARING:   { face: 'thinking',  arm: 0.55, hold: true },
  SCULPTING:   { face: 'speaking',  arm: 1.0,  hold: true },
  YIELDING:    { face: 'sorry',     arm: 0.0,  hold: false },
  REACTING:    { face: 'curious',   arm: 0.0,  hold: false },
  REMEMBERING: { face: 'thinking',  arm: 0.35, hold: false },
  UNSURE:      { face: 'unsure',    arm: 0.0,  hold: false },
};

const H_LOCAL = 310;
// the waist line in rig units: the clip cut that the table rim hides below
const WAIST = 244;

export class Character {
  constructor(root, bubbleEl, bubbleTextEl) {
    this.root = root;
    this.svg = root.querySelector('svg');
    this.svg.innerHTML = RIG;
    this.svg.style.overflow = 'visible';
    this.bubble = bubbleEl;
    this.bubbleText = bubbleTextEl;

    this.el = {};
    for (const id of ['mkBody', 'mkHead', 'mkEyes', 'mkEyeL', 'mkEyeR',
      'mkAntenna', 'mkAntBall',
      'aLseg1', 'aLseg1sh', 'aLseg1hi', 'aLseg2', 'aLseg2sh', 'aLseg2hi',
      'aLj1g', 'aLj2g', 'aLwrist',
      'aRseg1', 'aRseg1sh', 'aRseg1hi', 'aRseg2', 'aRseg2sh', 'aRseg2hi',
      'aRj1g', 'aRj2g', 'aRwrist']) {
      this.el[id] = this.svg.querySelector('#' + id);
    }

    this.state = 'ARRIVING';
    this.face = 'curious';
    // BEHIND the table: it stands on the floor at the back-right rim, torso
    // rising over the edge, lower body hidden by the table. The body never
    // walks and never drifts — the wheel brings the far side round to it.
    // Reference composition: Meikku reads as the second large participant,
    // fully visible behind the right side of the table instead of cropped by
    // the viewport. Depth stays on the rear rim; x only moves the seat inward.
    this.workSeat = [0.82, -0.575, -1.62];
    this.edgeRest = this.workSeat.slice();
    this.anchor = this.workSeat.slice();
    this.clipH = WAIST;                 // kept for compatibility (harness)
    this.gaze = [0, 0, 0];              // world point it is looking at
    this.screen = { x: -400, y: 0, s: 1 };
    this.arm = 0;
    this.t = 0;
    this.bubbleUntil = 0;
    this.wheelHand = null;              // world point while turning the wheel
    this.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  setState(s) {
    if (!POSE[s]) return;
    this.state = s;
    this.face = POSE[s].face;
  }

  setFace(f) { if (FACES[f]) this.face = f; }

  // the body is stationary now; the arms do all the travelling
  moveNear() {}

  say(text, face, ms = 4200) {
    if (!text) return;
    this.bubbleText.textContent = text;
    this.bubble.hidden = false;
    if (face) this.setFace(face);
    this.bubbleUntil = this.t + ms / 1000;
  }

  hush() { this.bubble.hidden = true; this.bubbleUntil = 0; }

  // two-link IK for one arm. sign picks which way the elbow flares; the
  // links may stretch a whisper (≤1.18) so the claw really arrives.
  drawArm(side, S, T, sign) {
    const L1 = 150, L2 = 150, TOOL = 22;
    let dx = T[0] - S[0], dy = T[1] - S[1];
    let d = Math.hypot(dx, dy);
    if (!Number.isFinite(d) || d < 1) { dx = sign * 26; dy = 30; d = Math.hypot(dx, dy); }
    const maxR = (L1 + L2) * 1.18 + TOOL;
    if (d > maxR) { dx *= maxR / d; dy *= maxR / d; d = maxR; T = [S[0] + dx, S[1] + dy]; }
    const ux = dx / d, uy = dy / d;
    let dw = Math.max(26, d - TOOL);
    const f = Math.min(1.18, Math.max(1, dw / (L1 + L2 - 2)));
    const L1s = L1 * f, L2s = L2 * f;
    dw = Math.min(dw, L1s + L2s - 0.5);
    const a1 = Math.atan2(uy, ux);
    const off = Math.acos(Math.min(1, Math.max(-1,
      (L1s * L1s + dw * dw - L2s * L2s) / (2 * L1s * dw))));
    const ea = a1 + sign * off;
    const E = [S[0] + Math.cos(ea) * L1s, S[1] + Math.sin(ea) * L1s];
    const Wt = [S[0] + ux * dw, S[1] + uy * dw];
    const wa2 = Math.atan2(Wt[1] - E[1], Wt[0] - E[0]);
    const Wp = [E[0] + Math.cos(wa2) * L2s, E[1] + Math.sin(wa2) * L2s];

    // pseudo-3D: each link is shaded as a tube — a highlight stripe hugs the
    // lit edge, a core shadow hugs the dark edge, both re-derived from the
    // link's live orientation so the volume follows the pose. The light sits
    // up-left, same as the scene's key light.
    this.el[side + 'seg1'].setAttribute('d', linkPath(S, E, 13, 10.5));
    this.el[side + 'seg2'].setAttribute('d', linkPath(E, Wp, 11, 8.5));
    const l1 = litSide(S, E), l2 = litSide(E, Wp);
    this.el[side + 'seg1hi'].setAttribute('d', stripePath(S, E, 13, 10.5, l1, 0.30, 0.68));
    this.el[side + 'seg1sh'].setAttribute('d', stripePath(S, E, 13, 10.5, -l1, 0.42, 0.86));
    this.el[side + 'seg2hi'].setAttribute('d', stripePath(E, Wp, 11, 8.5, l2, 0.30, 0.68));
    this.el[side + 'seg2sh'].setAttribute('d', stripePath(E, Wp, 11, 8.5, -l2, 0.42, 0.86));
    this.el[side + 'j1g'].setAttribute('transform', `translate(${S[0]},${S[1]})`);
    this.el[side + 'j2g'].setAttribute('transform', `translate(${E[0].toFixed(1)},${E[1].toFixed(1)})`);
    const ta = Math.atan2(T[1] - Wp[1], T[0] - Wp[0]) * 57.29578;
    this.el[side + 'wrist'].setAttribute('transform',
      `translate(${Wp[0].toFixed(1)},${Wp[1].toFixed(1)}) rotate(${ta.toFixed(1)})`);
  }

  update(dt, cam, view) {
    this.t += dt;
    const pose = POSE[this.state] || POSE.WATCHING;

    // PINNED. Fixed camera, fixed seat: the projection is assigned directly
    // every frame — no smoothing, no clamping, nothing to drift. The rig is
    // hung so its waist (the clip line) sits exactly on the table rim.
    const p = cam.project(this.anchor, view.w, view.h);
    if (Number.isFinite(p.x) && Number.isFinite(p.y) && !p.behind) {
      this.screen.x = p.x;
      this.screen.y = p.y;
      this.screen.s = clamp(4.95 / Math.max(0.4, p.depth), 0.76, 1.42);
    }
    this.root.style.transform =
      `translate(${(this.screen.x - 130 * this.screen.s).toFixed(1)}px,` +
      `${(this.screen.y - WAIST * this.screen.s).toFixed(1)}px) scale(${this.screen.s.toFixed(3)})`;

    // ---- the face: eyes on the screen, one emotion pipeline --------------
    const g = cam.project(this.gaze, view.w, view.h);
    const dx = clamp((g.x - this.screen.x) / 260, -1, 1);
    const dy = clamp((g.y - (this.screen.y - (WAIST - 85) * this.screen.s)) / 240, -1, 1);
    const f = FACES[this.face] || FACES.idle;

    // Blinking is the aliveness signal. Eyes that never close are the single
    // strongest uncanny cue a face can give — screens included.
    if (this.nextBlink === undefined) this.nextBlink = this.t + 2 + Math.random() * 3;
    if (this.t >= this.nextBlink) {
      this.blinkLeft = 0.13;
      this.nextBlink = this.t + 2.4 + Math.random() * 3.6;
    }
    let blink = 1;
    if (this.blinkLeft > 0) { this.blinkLeft -= dt; blink = 0.1; }

    const ey = 70 + f.dy + dy * 3;
    const exL = 103 + dx * 4, exR = 139 + dx * 4;
    this.el.mkEyeL.setAttribute('x', exL.toFixed(1));
    this.el.mkEyeR.setAttribute('x', exR.toFixed(1));
    this.el.mkEyeL.setAttribute('y', (ey + (17 - f.hL * blink) / 2).toFixed(1));
    this.el.mkEyeR.setAttribute('y', (ey + (17 - f.hR * blink) / 2).toFixed(1));
    this.el.mkEyeL.setAttribute('height', Math.max(2, f.hL * blink).toFixed(1));
    this.el.mkEyeR.setAttribute('height', Math.max(2, f.hR * blink).toFixed(1));
    this.el.mkEyeL.setAttribute('transform', f.rot ? `rotate(${-f.rot} ${(exL + 7.5).toFixed(1)} ${(ey + 8).toFixed(1)})` : '');
    this.el.mkEyeR.setAttribute('transform', f.rot ? `rotate(${f.rot} ${(exR + 7.5).toFixed(1)} ${(ey + 8).toFixed(1)})` : '');

    const sway = this.reduced ? 0 : Math.sin(this.t * 1.7) * 2.2;
    this.el.mkHead.setAttribute('transform', `rotate(${(f.tilt + sway * 0.3).toFixed(2)} 130 110)`);
    this.el.mkAntenna.setAttribute('d', `M138 46 L${(156 + sway).toFixed(1)} 14`);
    this.el.mkAntBall.setAttribute('cx', (158 + sway).toFixed(1));

    // ---- the arms --------------------------------------------------------
    this.arm += ((pose.arm || 0) - this.arm) * (1 - Math.pow(0.002, dt));
    const toLocal = (sp) => [
      (sp.x - this.screen.x) / this.screen.s + 130,
      (sp.y - this.screen.y) / this.screen.s + WAIST,
    ];

    // WORK arm (left side, toward the clay): the wheel first, then the op
    let workT = null;
    if (this.wheelHand) {
      const wp = cam.project(this.wheelHand, view.w, view.h);
      if (!wp.behind) workT = toLocal(wp);
    } else if (this.arm > 0.12) {
      workT = toLocal(g);
      if (this.state === 'SCULPTING' && !this.reduced) {
        workT[1] += Math.sin(this.t * 11) * 2.4;      // the little working pushes
      }
    }
    if (!workT) workT = [2, 240];                     // claw resting on the rim
    this.drawArm('aL', [90, 172], workT, -1);         // elbow up

    // SUPPORT arm: holds the lump's flank while working — the embrace
    let supT = null;
    if (pose.hold) {
      const holdW = [this.anchor[0] * 0.42, -0.38, this.anchor[2] * 0.42];
      const hp = cam.project(holdW, view.w, view.h);
      if (!hp.behind) supT = toLocal(hp);
    }
    if (!supT) supT = [258, 240];
    this.drawArm('aR', [170, 172], supT, 1);          // elbow flares the other way

    // bubble sits above the head, clamped into view
    if (this.bubbleUntil && this.t > this.bubbleUntil) this.hush();
    if (!this.bubble.hidden) {
      const half = Math.max(130, (this.bubble.offsetWidth || 320) / 2 + 16);
      const bx = clamp(this.screen.x, half, view.w - half);
      const by = Math.max(70, this.screen.y - (WAIST - 30) * this.screen.s);
      this.bubble.style.transform = `translate(${bx.toFixed(0)}px, ${by.toFixed(0)}px) translate(-50%, -100%)`;
    }
  }
}

function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

// which side of a link faces the (up-left) light
function litSide(A, B) {
  const dx = B[0] - A[0], dy = B[1] - A[1];
  const l = Math.hypot(dx, dy) || 1;
  // perpendicular (-dy, dx) dotted with the light direction (-0.55, -0.84)
  return ((-dy / l) * -0.55 + (dx / l) * -0.84) > 0 ? 1 : -1;
}

// a lengthwise stripe inset from one edge of a link — the tube shading
function stripePath(A, B, w0, w1, side, f0, f1) {
  const dx = B[0] - A[0], dy = B[1] - A[1];
  const l = Math.hypot(dx, dy) || 1;
  const px = (-dy / l) * side, py = (dx / l) * side;
  return `M${(A[0] + px * w0 * f0).toFixed(1)} ${(A[1] + py * w0 * f0).toFixed(1)}` +
         ` L${(B[0] + px * w1 * f0).toFixed(1)} ${(B[1] + py * w1 * f0).toFixed(1)}` +
         ` L${(B[0] + px * w1 * f1).toFixed(1)} ${(B[1] + py * w1 * f1).toFixed(1)}` +
         ` L${(A[0] + px * w0 * f1).toFixed(1)} ${(A[1] + py * w0 * f1).toFixed(1)} Z`;
}

// a tapered closed quad for one arm link — chunky, filled, outlined
function linkPath(A, B, w0, w1) {
  const dx = B[0] - A[0], dy = B[1] - A[1];
  const l = Math.hypot(dx, dy) || 1;
  const px = -dy / l, py = dx / l;
  return `M${(A[0] + px * w0).toFixed(1)} ${(A[1] + py * w0).toFixed(1)}` +
         ` L${(B[0] + px * w1).toFixed(1)} ${(B[1] + py * w1).toFixed(1)}` +
         ` L${(B[0] - px * w1).toFixed(1)} ${(B[1] - py * w1).toFixed(1)}` +
         ` L${(A[0] - px * w0).toFixed(1)} ${(A[1] - py * w0).toFixed(1)} Z`;
}
