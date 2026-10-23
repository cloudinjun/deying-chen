// director.js — Meikku's decisions.
//
// GDD §10: the character never writes geometry directly. It produces a
// structured intent, and this director turns that intent into a small number
// of bounded, undoable brush ops inside the current mode. Every intent is
// logged, so anything Meikku says can be checked against what it actually did.
//
// This is the local director: no network, no model call. It is enough to make
// the relationship legible, which is what the demo has to prove first.

import { regionOf } from './field.js?v=23';
import { norm, traceField } from './camera.js?v=23';
import { line, LANG } from './lines.js?v=23';

const ATTRACT_AFTER = 20;   // seconds with no player at all before it works alone
const ATTRACT_EVERY = 3.5;  // seconds between its own moves while working alone

// 24 evenly spread directions — the set of places Meikku can consider
const DIRS = (() => {
  const out = [];
  const n = 24, ga = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const th = ga * i;
    out.push([Math.cos(th) * r, y * 0.85, Math.sin(th) * r]);
  }
  return out;
})();

export class Director {
  constructor(api) {
    this.api = api;
    this.state = 'ARRIVING';
    this.timer = 0;
    this.plan = null;
    this.intent = null;
    this.target = null;
    this.lastActAt = -99;
    this.lastSpokeAt = -99;
    this.echoPhase = 'mimic';       // ECHO alternates mimic / deviate
    this.undoStreak = 0;
    this.pendingReact = null;
    this.said = new Set();
    // material refusal + reply grammar state (thesis v13)
    this.contests = [];        // spots where her work was worked away
    this.ceded = [];           // ground she has given up: contested twice
    this.softenNext = false;   // after a contest, the next answer continues
    this.counterStreak = 0;    // a peer disagrees sometimes, not always
    this.strokeEcho = 0;
    this.lastAnswered = null;
    this.lastContestAt = -99;
    // the proposal (blueprint): her own project when nobody is working.
    // Help speeds her up; repeated working-against makes her put it down —
    // "Proposals, Not A Single Goal" is enforced HERE, not in a doc.
    this.hinderStreak = 0;
    this.lastHinderAt = -99;
    this.lastHinderSaidAt = -99;
    this.lastHelpSaidAt = -99;
    this.lastDoneSaidAt = -99;
    this.bpPauseUntil = -99;
    this.hasteUntil = -99;
    this.spinWaitUntil = -99;
    this.replanAt = null;
    this.forceRepairNext = false;
    this.autoplayRepair = false;
  }

  setState(s) {
    if (this.state === s) return;
    this.state = s;
    this.api.setState(s);
  }

  say(deck, vars, ms) {
    const l = line(deck, vars);
    if (!l) return null;
    this.api.say(l.text, l.face, ms);
    this.lastSpokeAt = this.api.now();
    return l;
  }

  // ---- the tick -------------------------------------------------------

  tick(dt, obs) {
    this.timer += dt;
    const now = obs.now;

    // 1. never work over the hand that is already working
    if (this.target && obs.playerBusy && obs.playerPoint) {
      const d = dist(this.target, obs.playerPoint);
      if (d < 0.42 && (this.state === 'PREPARING' || this.state === 'SCULPTING')) {
        this.abort('yield');
        return;
      }
    }

    // The still-face invariant (thesis v13): a present but unresponsive
    // Meikku is worse than no Meikku. Whatever state got wedged, a player
    // stroke may never grow old unanswered.
    if (obs.lastPlayerStroke && this.answeredStrokeAt !== obs.lastPlayerStrokeAt &&
        now - obs.lastPlayerStrokeAt > 8 && !obs.playerBusy &&
        (this.state === 'WATCHING' || this.state === 'CURIOUS' || this.state === 'UNSURE')) {
      this.answeredStrokeAt = obs.lastPlayerStrokeAt;
      this.decide(obs);
      return;
    }

    switch (this.state) {
      case 'ARRIVING':      return this.tickArriving(obs);
      case 'REMEMBERING':   return this.tickRemembering(obs);
      case 'WATCHING':
      case 'CURIOUS':       return this.tickIdleWatch(obs);
      case 'PREPARING':     return this.tickPreparing(obs);
      case 'SCULPTING':     return this.tickSculpting(dt, obs);
      case 'REACTING':      return this.tickReacting(obs);
      case 'YIELDING':      return this.tickYielding(obs);
      case 'UNSURE':        return this.tickUnsure(obs);
    }
  }

  tickArriving(obs) {
    if (this.timer < 1.1) return;
    const ep = this.api.recallEpisode();
    if (ep) {
      this.say('arrive_return');
      this.setState('REMEMBERING');
      this.timer = 0;
      this.memoryEpisode = ep;
      return;
    }
    this.say('arrive_first');
    this.setState('WATCHING');
    this.timer = 0;
  }

  // opening a form that already has history: point at a real past mark first
  tickRemembering(obs) {
    if (this.timer < 2.0) return;
    const ep = this.memoryEpisode;
    if (ep && ep.point) {
      this.api.setAttention(ep.point, 0.3);
      this.api.lookAt(ep.point);
      if (ep.status === 'corrected' && ep.correction) {
        this.say('remember_corrected', { correction: ep.correction }, 5600);
      } else {
        this.say('remember', { region: ep.regionLabel || '', name: ep.name || '' }, 5200);
      }
      this.pendingMemoryId = ep.id;
    }
    this.setState('WATCHING');
    this.timer = 0;
  }

  tickIdleWatch(obs) {
    // the player is working. In TWO HANDS both sides may be on the form at
    // once, as long as Meikku is somewhere else; before that mode it watches.
    if (obs.playerBusy) {
      if (obs.mode === 'two_hands' && obs.now - this.lastActAt > 3.5) {
        this.decide(obs);
        return;
      }
      this.setState('WATCHING');
      if (obs.playerPoint) this.api.lookAt(obs.playerPoint);
      return;
    }

    // a switched proposal asks for a fresh look at the clay right away
    if (this.replanAt && obs.now > this.replanAt) {
      this.replanAt = null;
      this.decide(obs, true);
      return;
    }

    // They just finished a stroke — answer it ONCE. Without remembering which
    // stroke was answered, it re-answers the same one every cooldown forever,
    // never stops working, and never goes back to the table edge to rest.
    // While the player is visibly helping the proposal along, she keeps up.
    const cool = obs.now < this.hasteUntil ? 1.3 : 2.4;
    const since = obs.now - obs.lastPlayerStrokeAt;
    if (obs.lastPlayerStroke && since > 0.45 && obs.now - this.lastActAt > cool &&
        this.answeredStrokeAt !== obs.lastPlayerStrokeAt) {
      this.answeredStrokeAt = obs.lastPlayerStrokeAt;
      this.decide(obs);
      return;
    }

    // Nobody has touched it in a long time — a passer-by has to see two hands
    // moving before they will come over, so Meikku just keeps working.
    if (obs.now - obs.lastPlayerStrokeAt > ATTRACT_AFTER) {
      const every = obs.now < this.hasteUntil ? 2.0 : ATTRACT_EVERY;
      if (obs.now - this.lastActAt > every) this.decide(obs, true);
      return;
    }

    // the player is here but resting: Meikku starts something itself,
    // because a co-player does not wait to be asked
    if (obs.now - Math.max(this.lastActAt, obs.lastPlayerStrokeAt) > 9 &&
        obs.now - this.lastSpokeAt > 7) {
      if (Math.random() < 0.55) {
        this.decide(obs, true);
      } else {
        this.say('idle');
        this.setState('CURIOUS');
        this.timer = 0;
      }
    }
  }

  tickPreparing(obs) {
    if (this.timer < 0.85) return;
    if (obs.now < this.spinWaitUntil || obs.spinning) return;   // the wheel first
    if (!this.plan) { this.setState('WATCHING'); return; }
    this.setState('SCULPTING');
    this.timer = 0;
    this.stepTimer = 0;
  }

  tickSculpting(dt, obs) {
    if (!this.plan) { this.setState('REACTING'); this.timer = 0; return; }
    this.stepTimer += dt;
    if (this.stepTimer < this.plan.per) return;
    this.stepTimer = 0;
    const op = this.plan.ops[this.plan.i++];
    if (op) this.api.applyOp(op, this.intent);
    if (this.plan.i >= this.plan.ops.length) {
      this.plan = null;
      this.lastActAt = obs.now;
      this.setState('REACTING');
      this.timer = 0;
    }
  }

  tickReacting(obs) {
    if (this.timer < 0.7) return;
    if (this.pendingReact) {
      this.say(this.pendingReact.deck, this.pendingReact.vars, 4600);
      this.pendingReact = null;
    }
    this.setState('WATCHING');
    this.timer = 0;
    this.api.setAttention(null);
  }

  tickYielding(obs) {
    if (this.timer < 1.0) return;
    this.setState('WATCHING');
    this.timer = 0;
  }

  tickUnsure(obs) {
    if (this.timer < 2.2) return;
    this.setState('WATCHING');
    this.timer = 0;
  }

  // ---- events from the game ------------------------------------------

  abort(reason) {
    this.plan = null;
    this.api.setAttention(null);
    if (reason === 'yield') {
      const r = this.target ? regionOf(...this.target) : null;
      this.say('yield', { region: r ? r.label : '' });
      this.setState('YIELDING');
      this.timer = 0;
    }
  }

  onPlayerUndoOfMeikku() {
    this.undoStreak++;
    this.plan = null;
    this.api.setAttention(null);
    if (this.undoStreak >= 2) {
      this.say('undone_twice', {}, 6000);
      this.setState('UNSURE');
      this.undoStreak = 0;
    } else {
      this.say('undone_once');
      this.setState('WATCHING');
    }
    this.timer = 0;
    this.lastActAt = this.api.now();
  }

  // The player erased or reversed her fresh work with their hands - material
  // refusal, the strongest sentence in the game. First time on a spot: stop,
  // look, ask what was wrong (GDD 4.2). Second time on the same spot: the
  // ground is theirs, and she stays off it. A partner who cannot be refused
  // cannot agree either; this handler is what makes her yes worth something.
  onMeikkuWorkContested(p) {
    const now = this.api.now();
    if (now - this.lastContestAt < 6) return false;   // one reaction per burst
    this.lastContestAt = now;
    this.plan = null;
    this.api.setAttention(p, 0.24);
    this.api.lookAt(p);
    const r = regionOf(...p);
    const near = this.contests.find(c => dist(c.p, p) < 0.5);
    if (near) {
      near.n++;
      this.ceded.push({ p: p.slice(), at: now });
      if (this.ceded.length > 6) this.ceded.shift();
      this.say('contested_yield', { region: r.label }, 5200);
      this.setState('YIELDING');
    } else {
      this.contests.push({ p: p.slice(), n: 1, at: now });
      if (this.contests.length > 10) this.contests.shift();
      this.softenNext = true;
      this.say('contested_once', { region: r.label }, 5200);
      this.setState('UNSURE');
    }
    this.timer = 0;
    return true;
  }

  // the player's stroke moved the clay TOWARD the dashes: same direction,
  // two hands. She keeps her pace up while that lasts.
  onProposalHelped(p) {
    const now = this.api.now();
    this.hinderStreak = Math.max(0, this.hinderStreak - 1);
    this.hasteUntil = now + 20;
    if (now - this.lastHelpSaidAt > 12) {
      this.lastHelpSaidAt = now;
      this.say('bp_helped');
    }
  }

  // the stroke moved the clay AWAY from the dashes. Once or twice she names
  // it and carries on; the third time she takes it as a real signal and puts
  // the proposal down — either participant can change the direction.
  onProposalHindered(p) {
    const now = this.api.now();
    if (now - this.lastHinderAt > 40) this.hinderStreak = 0;
    this.lastHinderAt = now;
    this.hinderStreak++;
    this.api.lookAt(p);
    if (this.hinderStreak >= 3) {
      this.hinderStreak = 0;
      this.bpPauseUntil = now + 45;
      this.say('bp_rethink', {}, 5600);
      this.setState('UNSURE');
      this.timer = 0;
    } else if (now - this.lastHinderSaidAt > 10) {
      this.lastHinderSaidAt = now;
      this.say('bp_hindered', {}, 5200);
    }
  }

  // the player switched the proposal: a redirection, and it gets an answer
  onProposalSwitched(bp) {
    this.plan = null;
    this.hinderStreak = 0;
    this.bpPauseUntil = -99;
    this.api.setAttention(null);
    this.api.lookAt([0, 0.1, 0]);
    this.say('bp_switch', { name: LANG === 'zh' ? bp.zh : bp.en }, 5200);
    this.setState('CURIOUS');
    this.timer = 0;
    this.replanAt = this.api.now() + 1.4;
  }

  onPlayerPointed(p) {
    const r = regionOf(...p);
    this.pointedAt = p;
    this.api.setAttention(p, 0.26);
    this.api.lookAt(p);
    this.say('pointed', { region: r.label });
    this.setState('CURIOUS');
    this.timer = 0;
  }

  onMaterialMoved(reg) {
    if (this.state === 'SCULPTING') this.plan = null;
    const r = regionOf(reg.x, reg.y, reg.z);
    this.api.setAttention([reg.x, reg.y, reg.z], reg.r);
    this.api.lookAt([reg.x, reg.y, reg.z]);
    this.say('material_surprise', { region: r.label }, 5000);
    this.setState('REACTING');
    this.timer = -0.6;
    this.pendingReact = { deck: 'after_surprise', vars: {} };
    // the surprise changes Meikku's plan too: next move follows the slump
    this.followSlump = { p: [reg.x, reg.y - 0.12, reg.z], at: this.api.now() };
  }

  onMemoryCorrected() { this.say('memory_corrected'); }
  onMemoryForgotten() { this.say('memory_forgotten'); }

  // ---- scripted-live tutorial events --------------------------------

  prepareAutoplayMischief() {
    this.plan = null;
    this.api.setAttention(null);
    this.setState('WATCHING');
    this.timer = 0;
  }

  onAutoplayMischief(p) {
    this.plan = null;
    this.forceRepairNext = true;
    this.autoplayRepair = true;
    this.api.setAttention(p, 0.25);
    this.api.lookAt(p);
    this.say('loop_mischief', {}, 4300);
    this.setState('UNSURE');
    this.timer = 0;
    this.lastActAt = this.api.now() - 3;
  }

  onAutoplayAlmost() {
    this.bpPauseUntil = this.api.now() + 6.4;
    this.say('loop_almost', {}, 5000);
    this.setState('CURIOUS');
    this.timer = 0;
  }

  onAutoplayLooped(bp) {
    this.plan = null;
    this.forceRepairNext = false;
    this.autoplayRepair = false;
    this.api.setAttention(null);
    this.api.lookAt([0, 0.1, 0]);
    this.say('loop_again', { name: LANG === 'zh' ? bp.zh : bp.en }, 5200);
    this.setState('CURIOUS');
    this.timer = 0;
    this.lastActAt = this.api.now();
  }

  cancelAutoplay() {
    this.plan = null;
    this.forceRepairNext = false;
    this.autoplayRepair = false;
    this.bpPauseUntil = -99;
    this.replanAt = null;
    this.api.setAttention(null);
    this.setState('WATCHING');
    this.timer = 0;
  }

  // ---- deciding -------------------------------------------------------

  decide(obs, selfStarted = false) {
    const { field, mode } = obs;
    const ps = obs.lastPlayerStroke;

    // mode decides the relationship this turn is exploring
    let tool = 'pull', strengthName = 'small', deck = 'preparing';
    let target = null;

    // §10.2 order: what the material just did outranks what the mode prefers
    if (this.followSlump && obs.now - this.followSlump.at < 12) {
      tool = 'press';
      deck = 'after_surprise';
      this.followSlump = null;
    } else if (mode === 'echo' && ps) {
      if (this.echoPhase === 'mimic') {
        tool = ps.tool;
        deck = 'echo_mimic';
        this.echoPhase = 'deviate';
      } else {
        tool = ps.tool === 'press' ? 'pull' : 'press';   // one dimension changed, on purpose
        deck = 'echo_deviate';
        this.echoPhase = 'mimic';
      }
    } else if (ps && !selfStarted && !obs.firstAnswer) {
      // The reply grammar (thesis v13): an answer must be legible AS an
      // answer - continue their stroke, counter it, or repair its edge.
      // "Opposite tool, somewhere sensible" reads as coincidence, and
      // coincidence is noise, not another pair of hands.
      let verb = this.chooseReplyVerb(obs, ps);
      let rt = this.replyTarget(obs, ps, verb);
      // a stroke that runs off the edge cannot be continued — answer it
      // another way before giving up on answering at all
      if (!rt) {
        for (const alt of ['counter', 'repair', 'continue']) {
          if (alt === verb) continue;
          rt = this.replyTarget(obs, ps, alt);
          if (rt) { verb = alt; break; }
        }
      }
      if (rt) {
        target = rt;
        // her body is fixed at the table; a stroke on the far side of the
        // wheel comes TO her — she turns the clay so your line arrives in
        // front of her claws, then answers it. Pottery logic, and the most
        // legible "I am answering YOUR one" gesture the game has.
        const aT = Math.atan2(rt.p[0], rt.p[2]);
        const aH = Math.atan2(obs.homeSide[0], obs.homeSide[2]);
        let dT = aT - aH;
        while (dT > Math.PI) dT -= Math.PI * 2;
        while (dT < -Math.PI) dT += Math.PI * 2;
        if (Math.abs(dT) > 1.15) {
          this.api.spinToward(rt.p);
          this.spinWaitUntil = obs.now + 1.0;
        }
        if (verb === 'continue') {
          tool = ps.tool;
          deck = 'reply_continue';
        } else if (verb === 'repair') {
          tool = 'smooth';
          deck = this.autoplayRepair ? 'loop_repair' : 'reply_repair';
          this.autoplayRepair = false;
        } else {
          tool = ps.tool === 'press' ? 'pull' : ps.tool === 'pull' ? 'press' : 'pull';
          deck = 'reply_counter';
        }
        this.counterStreak = verb === 'counter' ? this.counterStreak + 1 : 0;
      } else {
        tool = ps.tool === 'press' ? 'pull' : 'press';
        deck = Math.random() < 0.45 ? 'reacting_to_player' : 'preparing';
      }
    } else if (ps) {
      tool = ps.tool === 'press' ? 'pull' : 'press';
      // the very first answer names what just happened, then claims a side
      deck = obs.firstAnswer ? 'notice_first_touch'
        : selfStarted ? 'preparing'
        : (Math.random() < 0.45 ? 'reacting_to_player' : 'preparing');
    }

    // her own project: work the spot where the clay disagrees most with the
    // proposal. This is what she does when nobody is answering anybody.
    if (!target && selfStarted && obs.blueprint && obs.now > this.bpPauseUntil) {
      const bt = this.blueprintTarget(obs);
      if (bt && bt.done) {
        if (obs.now - this.lastDoneSaidAt > 30) {
          this.lastDoneSaidAt = obs.now;
          this.say('bp_done', {}, 5200);
          this.api.lookAt([0, 0.1, 0]);
        }
        this.lastActAt = obs.now;
        this.setState('WATCHING');
        this.timer = 0;
        return;
      }
      if (bt) {
        target = bt;
        tool = bt.tool;
        deck = 'bp_working';
        if (bt.needSpin) {                       // a potter turns the wheel first
          this.api.spinToward(bt.p);
          this.spinWaitUntil = obs.now + 1.0;
        }
      }
    }

    if (!target) target = this.chooseTarget(obs);
    if (!target) {
      this.say('unsure');
      this.setState('UNSURE');
      this.timer = 0;
      return;
    }
    this.target = target.p;
    const region = regionOf(...target.p);

    const radius = target.radius || (ps ? clamp(ps.radius * (0.85 + Math.random() * 0.3), 0.16, 0.3) : 0.21);
    const strength = target.strength || (ps ? clamp(ps.strength * 0.85, 0.010, 0.026) : 0.016);
    strengthName = strength > 0.019 ? 'medium' : 'small';

    const spoken = this.say(deck, { region: region.label });

    // the structured intent, exactly the shape the GDD specifies
    this.intent = {
      attentionRegion: region.id,
      intent: this.intentVerb(tool, mode, deck),
      tool,
      strength: strengthName,
      delivery: spoken ? spoken.face : 'thinking',
      memoryEpisodeId: this.pendingMemoryId || null,
      spokenLine: spoken ? spoken.text : null,
      mode,
      selfStarted,
      at: obs.now,
    };
    this.pendingMemoryId = null;
    this.api.logIntent(this.intent);

    // one readable change, cut into small steps so a hand can interrupt it
    const steps = 6;
    const ops = [];
    const n = target.n;
    const dstep = target.driftStep || 0.022;
    for (let i = 0; i < steps; i++) {
      const drift = (i - steps / 2) * dstep;
      ops.push({
        tool,
        x: target.p[0] + n[0] * 0.02 + drift * target.t1[0],
        y: target.p[1] + n[1] * 0.02 + drift * target.t1[1],
        z: target.p[2] + n[2] * 0.02 + drift * target.t1[2],
        radius,
        strength,
        actor: 'meikku',
      });
    }
    this.plan = { ops, i: 0, per: 0.085 };

    this.api.setAttention(target.p, radius);
    this.api.lookAt(target.p);
    this.api.moveNear(target.p, obs.playerPoint);
    this.setState('PREPARING');
    this.timer = 0;
  }

  intentVerb(tool, mode, deck) {
    if (deck === 'bp_working') return 'work_toward_the_proposal';
    if (deck === 'reply_continue') return 'continue_their_stroke';
    if (deck === 'reply_counter') return 'answer_their_stroke_with_the_opposite';
    if (deck === 'reply_repair') return 'smooth_the_edge_of_their_stroke';
    if (deck === 'echo_mimic') return 'repeat_the_quality_of_their_last_stroke';
    if (deck === 'echo_deviate') return 'change_one_dimension_of_their_stroke';
    if (deck === 'after_surprise') return 'follow_where_the_material_fell';
    if (tool === 'press') return 'make_this_edge_less_even';
    return 'pull_a_little_out_of_this_face';
  }

  // ---- the reply grammar --------------------------------------------
  // Three ways to answer a stroke so the answer is readable without text.
  // Too random falls out of the band into noise; too compliant collapses
  // into a mirror. The band between is where another mind appears.

  chooseReplyVerb(obs, ps) {
    if (this.forceRepairNext) {
      this.forceRepairNext = false;
      return 'repair';
    }
    // after a contest she listens first: the next answer goes WITH them
    if (this.softenNext) { this.softenNext = false; return 'continue'; }
    // ragged edges near their stroke ask for care
    if (this.roughnessNear(obs.field, ps) > 0.14 && Math.random() < 0.6) return 'repair';
    // the same tool hammering the same region: offer the other reading -
    // but a peer disagrees sometimes, not every time
    const echo = this.lastAnswered &&
      ps.tool === this.lastAnswered.tool && ps.region === this.lastAnswered.region;
    this.strokeEcho = echo ? this.strokeEcho + 1 : 0;
    this.lastAnswered = { tool: ps.tool, region: ps.region };
    let pCounter = 0.28 + Math.min(0.3, this.strokeEcho * 0.15);
    if (this.counterStreak >= 2) pCounter = 0;         // never a contrarian
    return Math.random() < pCounter ? 'counter' : 'continue';
  }

  // project a point onto the clay surface; null if there is none nearby.
  // Fresh brushwork compresses the SDF gradient (the displaced-rim brush is
  // not distance-preserving), so a Newton step undershoots — take many small
  // steps and accept half-a-brush precision, or every reply right after a
  // stroke fails and she falls back to vague activity.
  toSurface(field, c) {
    let p = c.slice();
    for (let i = 0; i < 10; i++) {
      const d = field.sample(p[0], p[1], p[2]);
      if (!isFinite(d)) return null;
      if (Math.abs(d) < 0.01) break;
      const nn = field.normal(p[0], p[1], p[2]);
      p = [p[0] - nn[0] * d, p[1] - nn[1] * d, p[2] - nn[2] * d];
    }
    if (Math.abs(field.sample(p[0], p[1], p[2])) > 0.15) return null;
    return { p, n: field.normal(p[0], p[1], p[2]) };
  }

  roughnessNear(field, ps) {
    const sp = this.toSurface(field, ps.end || ps.center);
    if (!sp) return 0;
    const p = sp.p, nrm = sp.n;
    const t1 = norm(cross(nrm, Math.abs(nrm[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0]));
    const t2 = cross(nrm, t1);
    const off = ps.radius * 0.8;
    return Math.abs(field.sample(p[0] + t1[0] * off, p[1] + t1[1] * off, p[2] + t1[2] * off))
         + Math.abs(field.sample(p[0] - t1[0] * off, p[1] - t1[1] * off, p[2] - t1[2] * off))
         + Math.abs(field.sample(p[0] + t2[0] * off, p[1] + t2[1] * off, p[2] + t2[2] * off))
         + Math.abs(field.sample(p[0] - t2[0] * off, p[1] - t2[1] * off, p[2] - t2[2] * off));
  }

  replyTarget(obs, ps, verb) {
    const field = obs.field;
    const end = ps.end || ps.center;
    const sp0 = this.toSurface(field, end);
    if (!sp0) return null;
    const n0 = sp0.n;

    // the stroke's direction, laid onto the surface; a directionless poke
    // gets a tangent leaning toward her seat so the answer stays reachable
    let dir = ps.dir ? ps.dir.slice() : null;
    if (dir) {
      const dn = dot(dir, n0);
      dir = [dir[0] - n0[0] * dn, dir[1] - n0[1] * dn, dir[2] - n0[2] * dn];
      if (Math.hypot(dir[0], dir[1], dir[2]) < 0.3) dir = null;
      else dir = norm(dir);
    }
    if (!dir) {
      const home = obs.homeSide || [1, 0, 1];
      const toHome = [home[0] - sp0.p[0], 0, home[2] - sp0.p[2]];
      const dn = dot(toHome, n0);
      dir = norm([toHome[0] - n0[0] * dn, toHome[1] - n0[1] * dn, toHome[2] - n0[2] * dn]);
    }

    let cand = null, drift = dir;
    if (verb === 'continue') {
      // pick up where their gesture stopped and take it further
      const step = ps.radius * 1.35;
      cand = [end[0] + dir[0] * step, end[1] + dir[1] * step, end[2] + dir[2] * step];
    } else if (verb === 'counter') {
      // a parallel line right beside theirs, in the opposite voice -
      // on the side the camera can see, or the reply is invisible
      let perp = norm(cross(n0, dir));
      const toCam = norm([obs.camEye[0] - sp0.p[0], obs.camEye[1] - sp0.p[1], obs.camEye[2] - sp0.p[2]]);
      if (dot(perp, toCam) < 0) perp = [-perp[0], -perp[1], -perp[2]];
      const step = ps.radius * 1.7;
      cand = [end[0] + perp[0] * step, end[1] + perp[1] * step, end[2] + perp[2] * step];
    } else {
      // repair: the roughest spot on a ring round their stroke
      const t1 = norm(cross(n0, Math.abs(n0[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0]));
      const t2 = cross(n0, t1);
      let best = null;
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        const rr = ps.radius * 1.15;
        const c = [
          sp0.p[0] + (Math.cos(a) * t1[0] + Math.sin(a) * t2[0]) * rr,
          sp0.p[1] + (Math.cos(a) * t1[1] + Math.sin(a) * t2[1]) * rr,
          sp0.p[2] + (Math.cos(a) * t1[2] + Math.sin(a) * t2[2]) * rr,
        ];
        const spc = this.toSurface(field, c);
        if (!spc) continue;
        const rough = this.roughnessNear(field, { end: spc.p, radius: ps.radius * 0.7 });
        if (!best || rough > best.rough) best = { p: spc.p, rough };
      }
      if (!best) return null;
      cand = best.p;
      drift = null;                       // tangent chosen after projection
    }

    const sp = this.toSurface(field, cand);
    if (!sp) return null;
    // never under a hand that is actively working. The resting hand hovers
    // right where it just drew — a reply must be allowed to land there, or
    // nearly every reply is vetoed and she falls back to vague activity.
    if (obs.playerBusy && obs.playerPoint && dist(sp.p, obs.playerPoint) < 0.42) return null;
    for (const c of this.ceded) if (dist(sp.p, c.p) < 0.5) return null;

    if (!drift) {
      drift = norm(cross(sp.n, Math.abs(sp.n[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0]));
    } else {
      const dn = dot(drift, sp.n);
      drift = norm([drift[0] - sp.n[0] * dn, drift[1] - sp.n[1] * dn, drift[2] - sp.n[2] * dn]);
    }
    const t2v = cross(sp.n, drift);
    // a reply is a LINE, not a dab - longer drift than her idle nudges
    return { p: sp.p, n: sp.n, t1: drift, t2: t2v, driftStep: 0.045 };
  }

  // the spot where the clay disagrees most with the proposal.
  // err > 0: the clay sticks out past the blueprint -> press it in.
  // err < 0: the blueprint wants material the clay lacks -> pull it out.
  blueprintTarget(obs) {
    const { field, blueprint } = obs;
    let best = null;
    for (const d of DIRS) {
      const dir = norm(d);
      const o = [dir[0] * 2.6, dir[1] * 2.6, dir[2] * 2.6];
      const hit = traceField(field, o, [-dir[0], -dir[1], -dir[2]]);
      if (!hit) continue;
      const p = hit.p;
      const err = blueprint.sdf(p[0], p[1], p[2]);
      let score = Math.abs(err) * 3.0;
      if (obs.playerBusy && obs.playerPoint && dist(p, obs.playerPoint) < 0.45) score -= 2.5;
      for (const c of this.ceded) if (dist(p, c.p) < 0.5) score -= 2.5;
      // spread the work: hammering one spot is what tore the field up
      if (obs.lastMeikkuPoint && dist(p, obs.lastMeikkuPoint) < 0.35) score -= 0.9;
      if (!best || score > best.score) best = { p, n: hit.n, err, score };
    }
    if (!best) return null;
    if (Math.abs(best.err) < 0.045) return { done: true };
    const t1 = norm(cross(best.n, Math.abs(best.n[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0]));
    const t2 = cross(best.n, t1);
    // is the spot on her side of the wheel? homeSide arrives in field space,
    // so the angular gap is read directly — beyond ~72 degrees she turns it.
    const a1 = Math.atan2(best.p[0], best.p[2]);
    const a2 = Math.atan2(obs.homeSide[0], obs.homeSide[2]);
    let da = a1 - a2;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    return {
      p: best.p, n: best.n, t1, t2,
      tool: best.err > 0 ? 'press' : 'pull',
      needSpin: Math.abs(da) > 1.25,
      driftStep: 0.03,
      radius: 0.20, strength: 0.013,     // patient work, not gouging
    };
  }

  // where to act: even, unworked, away from the player's hand
  chooseTarget(obs) {
    const { field } = obs;
    let best = null;
    for (const d of DIRS) {
      const dir = norm(d);
      const o = [dir[0] * 2.6, dir[1] * 2.6, dir[2] * 2.6];
      const hit = traceField(field, o, [-dir[0], -dir[1], -dir[2]]);
      if (!hit) continue;

      const p = hit.p, n = hit.n;
      const t1 = norm(cross(n, Math.abs(n[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0]));
      const t2 = cross(n, t1);
      const off = 0.15;
      const bump =
        Math.abs(field.sample(p[0] + t1[0] * off, p[1] + t1[1] * off, p[2] + t1[2] * off)) +
        Math.abs(field.sample(p[0] - t1[0] * off, p[1] - t1[1] * off, p[2] - t1[2] * off)) +
        Math.abs(field.sample(p[0] + t2[0] * off, p[1] + t2[1] * off, p[2] + t2[2] * off)) +
        Math.abs(field.sample(p[0] - t2[0] * off, p[1] - t2[1] * off, p[2] - t2[2] * off));

      let score = 1 - Math.min(1, bump * 5);        // prefers the parts that are too even

      if (obs.playerPoint) {
        const dp = dist(p, obs.playerPoint);
        if (dp < 0.45) score -= 1.4;                 // never over their hand
        else score += Math.min(0.35, dp * 0.12);
      }
      if (obs.lastMeikkuPoint) {
        const dm = dist(p, obs.lastMeikkuPoint);
        if (dm < 0.35) score -= 0.7;                 // spread out over the form
      }
      if (this.pointedAt && dist(p, this.pointedAt) < 0.4) score += 0.9;
      // ground she gave up after being refused twice stays given up
      for (const c of this.ceded) if (dist(p, c.p) < 0.5) score -= 1.5;

      // M11 — memory enters as a place, not as a line. "It carries on from
      // where the last hand stopped" has to be delivered by this scoring;
      // said in a speech bubble it is a claim, said here it is behaviour.
      for (const m of obs.memoryPoints || []) {
        const dm = dist(p, m.point);
        if (dm > 0.42) continue;
        if (m.status === 'forgotten') score -= 0.9;      // you deleted it: stay away
        else score += m.status === 'corrected' ? 0.65 : 0.5;
      }
      if (obs.mode === 'echo' && obs.lastPlayerStroke) {
        // answer near — but not on top of — the stroke it is echoing
        const dp = dist(p, obs.lastPlayerStroke.center);
        score += dp > 0.4 && dp < 1.0 ? 0.6 : -0.2;
      }
      // facing the camera at least a little, or the player cannot see it happen
      const toCam = norm([obs.camEye[0] - p[0], obs.camEye[1] - p[1], obs.camEye[2] - p[2]]);
      score += dot(n, toCam) * 0.5;

      // and reachable from its seat: it has a place at the table, so it works
      // the side of the clay nearest that place instead of orbiting the form
      if (obs.homeSide) {
        const hl = Math.hypot(p[0] - obs.homeSide[0], p[2] - obs.homeSide[2]);
        score += (1.0 - Math.min(1.5, hl)) * 0.9;
      }

      if (!best || score > best.score) best = { p, n, t1, t2, score };
    }
    return best && best.score > -0.6 ? best : null;
  }
}

function dist(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); }
function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
