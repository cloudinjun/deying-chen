// memory.js — the shared history.
//
// A memory here is not a chat summary. It is a closed loop of real beats:
// someone acted, the other side changed because of it, and the player chose
// what that was worth. GDD §4.1 calls that a mutual change; §11.2 fixes what a
// single episode has to contain. Nothing is stored that did not happen.

import { ui } from './lines.js?v=23';

let seq = 0;

export class Memory {
  constructor() {
    this.episodes = [];
    this.opLog = [];
    this.intents = [];
    this.beats = [];
    this.lastClosureAt = -99;
    this.recalled = new Set();
  }

  // ---- raw record -----------------------------------------------------

  logOp(op, actor, t) {
    this.opLog.push({
      n: seq++, actor, tool: op.tool, t: +t.toFixed(3),
      p: [+op.x.toFixed(4), +op.y.toFixed(4), +op.z.toFixed(4)],
      r: +op.radius.toFixed(3), s: +op.strength.toFixed(4),
    });
    if (this.opLog.length > 6000) this.opLog.splice(0, 1000);
  }

  logIntent(intent) {
    this.intents.push(intent);
    if (this.intents.length > 200) this.intents.shift();
  }

  // a beat is one legible unit of action, not one brush sample
  noteBeat(beat) {
    this.beats.push(beat);
    if (this.beats.length > 40) this.beats.shift();
  }

  // ---- mutual change --------------------------------------------------
  // player acts -> Meikku answers that change -> the result changes someone's
  // next move. Only then is there something worth keeping.

  findClosure(now) {
    if (now - this.lastClosureAt < 12) return null;
    const b = this.beats;
    for (let i = b.length - 1; i >= 2; i--) {
      const third = b[i];
      if (third.actor === 'meikku') continue;             // needs a change on the other side
      for (let j = i - 1; j >= 1; j--) {
        const second = b[j];
        if (second.actor !== 'meikku' || !second.answering) continue;
        // The third beat has to be an answer, not just the next thing that
        // happened. Beyond a few seconds the player is simply carrying on alone,
        // and counting that as a shared moment cheapens every real one.
        if (third.at - second.at > 6) break;
        for (let k = j - 1; k >= 0; k--) {
          const first = b[k];
          if (first.actor !== 'player') continue;
          if (second.at - first.at > 30) break;
          return { first, second, third, at: now };
        }
      }
    }
    return null;
  }

  draft(closure, formId) {
    const { first, second, third } = closure;
    const steps = [
      ui('moment_player', { tool: ui('tool_' + first.tool), region: first.regionLabel }),
      ui('moment_meikku', { region: second.regionLabel }),
      third.actor === 'material'
        ? ui('moment_material')
        : ui('moment_player', { tool: ui('tool_' + third.tool), region: third.regionLabel }),
      ui('moment_changed'),
    ];
    return {
      id: 'episode_' + String(this.episodes.length + 1).padStart(3, '0'),
      formId,
      ts: Date.now(),
      steps,
      beats: [first, second, third].map(b => ({
        actor: b.actor, tool: b.tool || null, region: b.regionId,
        regionLabel: b.regionLabel, at: +b.at.toFixed(2),
      })),
      point: second.point,
      regionId: second.regionId,
      regionLabel: second.regionLabel,
      intent: this.intents.length ? this.intents[this.intents.length - 1] : null,
      status: 'confirmed',
      name: '',
      correction: '',
      thumbBefore: null,
      thumbAfter: null,
    };
  }

  keep(draft, now) {
    this.episodes.push(draft);
    this.lastClosureAt = now;
    this.beats.length = 0;
    return draft;
  }

  skip(now) {
    this.lastClosureAt = now;
    this.beats.length = 0;
  }

  // ---- correction is part of the memory, not a delete ------------------

  correct(id, text) {
    const ep = this.episodes.find(e => e.id === id);
    if (!ep) return null;
    ep.status = 'corrected';
    ep.correction = text;
    ep.correctedAt = Date.now();
    return ep;
  }

  forget(id) {
    const ep = this.episodes.find(e => e.id === id);
    if (!ep) return null;
    ep.status = 'forgotten';
    ep.forgottenAt = Date.now();
    return ep;
  }

  // what Meikku may bring up: something real, not forgotten, not just used
  recall() {
    const usable = this.episodes.filter(e => e.status !== 'forgotten' && !this.recalled.has(e.id));
    if (!usable.length) return null;
    const ep = usable[usable.length - 1];
    this.recalled.add(ep.id);
    return ep;
  }

  serialize() {
    return {
      episodes: this.episodes,
      opLog: this.opLog.slice(-3000),
      intents: this.intents.slice(-60),
      // which episodes have already been brought up. Without this, a reload
      // makes Meikku recall the same moment forever — and at an exhibition it
      // greets a stranger with the previous visitor's memory.
      recalled: [...this.recalled],
    };
  }

  restore(data) {
    if (!data) return;
    this.episodes = data.episodes || [];
    this.opLog = data.opLog || [];
    this.intents = data.intents || [];
    this.recalled = new Set(data.recalled || []);
    seq = this.opLog.length ? this.opLog[this.opLog.length - 1].n + 1 : 0;
  }
}
