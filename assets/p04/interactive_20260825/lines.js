// lines.js — what Meikku can say without a model round-trip.
//
// Follows robot/code/project/meikku_line_bank.json: third person, short,
// reaction before reason, no praise of the player, no teacher voice, and — the
// rule that matters most — every line must be true at the moment it appears.
// In this game Meikku really does move the form, so it may name what it did.
// It may never name something it did not do.
//
// {region} is the part of the form the line is about. {name} is a kept moment.

const DECKS = {
  arrive_first: [
    { zh: '有东西在这儿。Meikku 先看看。', en: 'Something is here. Meikku will look first.', face: 'curious' },
    { zh: '这块还没人碰过。', en: 'Nobody has touched this one yet.', face: 'curious' },
  ],
  arrive_return: [
    { zh: '还是上次那块。Meikku 记得。', en: 'Same lump as last time. Meikku remembers it.', face: 'thinking' },
    { zh: '它没变回去。挺好。', en: 'It did not go back to round. Good.', face: 'curious' },
  ],
  notice_first_touch: [
    { zh: '那边动了。Meikku 想试试这边。', en: 'That side moved. Meikku wants this side.', face: 'curious' },
    { zh: '你从{region}下手了。Meikku 换一边。', en: 'You went at the {region}. Meikku takes the other.', face: 'curious' },
  ],
  preparing: [
    { zh: 'Meikku 想动{region}一点点。', en: 'Meikku wants a small change at the {region}.', face: 'thinking' },
    { zh: '这里太整齐了。', en: 'This part is too even.', face: 'thinking' },
    { zh: '试一下，不行就撤。', en: 'Trying one. Undo it if it is wrong.', face: 'thinking' },
  ],
  echo_mimic: [
    { zh: '你压得很短。Meikku 也短一下。', en: 'Yours was short. Meikku goes short too.', face: 'watching' },
    { zh: '照你那一下的力气来。', en: 'Same weight as the one you just made.', face: 'watching' },
    { zh: '你走得宽，Meikku 跟着宽。', en: 'You went wide. Meikku follows wide.', face: 'watching' },
  ],
  echo_deviate: [
    { zh: '同一下，Meikku 换个方向。', en: 'Same stroke, other direction.', face: 'curious' },
    { zh: '一样的力气，深一点。', en: 'Same weight, but deeper.', face: 'curious' },
    { zh: 'Meikku 想让它别那么对称。', en: 'Meikku wants it less symmetrical.', face: 'curious' },
  ],
  yield: [
    { zh: '你先。Meikku 让开。', en: 'You first. Meikku moves off.', face: 'listening' },
    { zh: '手撞上了，Meikku 换个地方。', en: 'Hands crossed. Meikku takes another spot.', face: 'sorry' },
    { zh: '这块归你，Meikku 去{region}。', en: 'That part is yours. Meikku goes to the {region}.', face: 'listening' },
  ],
  undone_once: [
    { zh: '撤了。那下不对。', en: 'Undone. That one was wrong.', face: 'listening' },
    { zh: '好，那边不动。', en: 'Fine — hands off there.', face: 'listening' },
  ],
  undone_twice: [
    { zh: 'Meikku 理解错了哪里？', en: 'Where did Meikku read this wrong?', face: 'unsure' },
    { zh: '连着两次撤。Meikku 停一下。', en: 'Undone twice. Meikku will stop.', face: 'unsure' },
  ],
  // The reply grammar (thesis v13): an answer must be legible AS an answer.
  // Each deck names the verb the hands are about to perform — and only then,
  // so every line stays true at the moment it appears.
  reply_continue: [
    { zh: '顺着你这道，Meikku 接下去。', en: 'Meikku carries your line on.', face: 'watching' },
    { zh: '这道还没走完。Meikku 走后半段。', en: 'That line is not finished. Meikku takes the second half.', face: 'curious' },
    { zh: '接着走。', en: 'Carrying on.', face: 'watching' },
  ],
  reply_counter: [
    { zh: '换 Meikku——反着来一下。', en: 'Meikku answers — the opposite way.', face: 'curious' },
    { zh: '你往里，Meikku 往外。', en: 'You went in. Meikku goes out.', face: 'curious' },
    { zh: '旁边顶一下，看看哪边对。', en: 'One beside it. See which reads better.', face: 'thinking' },
  ],
  reply_repair: [
    { zh: '边上翻起来了，Meikku 抹一下。', en: 'The edge rolled up. Meikku smooths it.', face: 'thinking' },
    { zh: '这道的边太毛。Meikku 收一收。', en: 'That rim is ragged. Meikku tidies it.', face: 'thinking' },
  ],
  // material refusal: the player erased or reversed Meikku's fresh work with
  // their hands. First time she stops and asks; on the same spot again she
  // cedes the ground. Refusal must cost her something, or her yes is empty.
  contested_once: [
    { zh: '你把 Meikku 那下改掉了。哪里不对？', en: 'You worked Meikku’s one away. What was wrong with it?', face: 'unsure' },
    { zh: '那下不要了？Meikku 先停。', en: 'Not keeping that one? Meikku stops first.', face: 'unsure' },
  ],
  contested_yield: [
    { zh: '两次了。{region}归你，Meikku 不碰。', en: 'Twice now. The {region} is yours — Meikku keeps off.', face: 'listening' },
    { zh: '懂了，这块你有想法。Meikku 去别处。', en: 'Understood — you have a plan there. Meikku goes elsewhere.', face: 'listening' },
  ],
  // the proposal (blueprint). Factual, peer voice, true at the moment shown:
  // the sensor really did measure toward/away before any of these can fire.
  bp_working: [
    { zh: '蓝图上这块还没到位。', en: 'This part is not at the dashes yet.', face: 'thinking' },
    { zh: 'Meikku 顺着蓝图收一点。', en: 'Meikku brings it toward the dashes.', face: 'watching' },
    { zh: '虚线在那儿，泥还没跟上。', en: 'The dashes are there; the clay is not.', face: 'thinking' },
  ],
  bp_helped: [
    { zh: '这下和 Meikku 想的是同一个方向。', en: 'That went the same way Meikku is going.', face: 'curious' },
    { zh: '往蓝图近了一步。', en: 'One step closer to the dashes.', face: 'watching' },
  ],
  bp_hindered: [
    { zh: '你在把它往别处带。故意的？', en: 'You are taking it somewhere else. On purpose?', face: 'curious' },
    { zh: '这下离蓝图远了。Meikku 看见了。', en: 'That went away from the dashes. Meikku saw it.', face: 'unsure' },
  ],
  bp_rethink: [
    { zh: '三次都往别处。好——蓝图先放下，跟你的走。', en: 'Three times elsewhere. Fine — the blueprint waits; Meikku follows yours.', face: 'listening' },
    { zh: '你有别的想法。Meikku 先不管蓝图了。', en: 'You have another idea. Meikku sets the blueprint down.', face: 'listening' },
  ],
  bp_switch: [
    { zh: '换成{name}？行，Meikku 重新看。', en: 'The {name} now? Fine — Meikku looks again.', face: 'curious' },
    { zh: '好，那就往{name}做。', en: 'Right — toward the {name}, then.', face: 'watching' },
  ],
  bp_done: [
    { zh: '和虚线差不多贴上了。你看看？', en: 'It nearly sits on the dashes. Have a look?', face: 'pleased' },
    { zh: '蓝图这就算到了。接下来呢？', en: 'That is the blueprint reached. What next?', face: 'curious' },
  ],
  loop_open: [
    { zh: '蓝图到了。Meikku 先沿虚线走一小段。', en: 'The sketch is here. Meikku takes one short pass along the dashes.', face: 'thinking' },
    { zh: '先从这张草图开始。别急着定型。', en: 'Start with this sketch. No need to fix the ending yet.', face: 'curious' },
  ],
  loop_mischief: [
    { zh: '嗯？这道突然拐出去了。Meikku 看见了。', en: 'Hm? That line just veered away. Meikku saw it.', face: 'unsure' },
    { zh: '又来。边缘翘起来了。', en: 'Again. The edge has kicked up.', face: 'unsure' },
  ],
  loop_repair: [
    { zh: '小麻烦。Meikku 先把这道缝回去。', en: 'Small trouble. Meikku will stitch this line back in.', face: 'thinking' },
    { zh: 'Meikku 先扶住边缘……慢一点。', en: 'Meikku holds the edge first… slowly.', face: 'thinking' },
  ],
  loop_almost: [
    { zh: '差一点。可泥又给了个新方向。', en: 'Nearly. But the clay just offered another direction.', face: 'curious' },
    { zh: '快贴上了——等等，这个折角更有意思。', en: 'Almost on the line—wait, that fold is more interesting.', face: 'curious' },
  ],
  loop_again: [
    { zh: '不算完成。换{name}，Meikku 再走一圈。', en: 'Not finished. Toward the {name} now—Meikku takes another pass.', face: 'curious' },
    { zh: '{name}只是下一张草图。继续。', en: 'The {name} is only the next sketch. Keep going.', face: 'watching' },
  ],
  material_surprise: [
    { zh: '它自己往下塌了。', en: 'It is slumping on its own.', face: 'curious' },
    { zh: '等一下——{region}还在动。', en: 'Wait — the {region} is still moving.', face: 'curious' },
    { zh: '这块黏土有自己的意见。', en: 'This clay has its own opinion.', face: 'curious' },
  ],
  after_surprise: [
    { zh: '塌下来的那道，Meikku 想留着。', en: 'Meikku wants to keep that slump.', face: 'curious' },
    { zh: '那 Meikku 顺着塌的方向走。', en: 'Then Meikku follows where it fell.', face: 'thinking' },
  ],
  reacting_to_player: [
    { zh: '哦，你把它拉出去了。', en: 'Oh — you pulled it outward.', face: 'curious' },
    { zh: '这一下 Meikku 没想到。', en: 'Meikku did not expect that one.', face: 'curious' },
    { zh: '那 Meikku 改主意。', en: 'Then Meikku changes its mind.', face: 'thinking' },
  ],
  pointed: [
    { zh: '这里？Meikku 看看。', en: 'Here? Meikku is looking.', face: 'curious' },
    { zh: '好，Meikku 盯着{region}。', en: 'Right — Meikku is on the {region}.', face: 'watching' },
  ],
  remember: [
    { zh: '上次你在{region}留了一道。', en: 'Last time you left a mark at the {region}.', face: 'thinking' },
    { zh: '「{name}」就是从这儿开始的。', en: '“{name}” started right here.', face: 'thinking' },
    { zh: 'Meikku 想从上次那道接着走。', en: 'Meikku wants to carry on from that one.', face: 'curious' },
  ],
  // a corrected memory is recalled in the player's words, not the old version
  remember_corrected: [
    { zh: '你说过：{correction}', en: 'You said: {correction}', face: 'thinking' },
    { zh: 'Meikku 记的是你改过的那版。', en: 'Meikku kept your corrected version.', face: 'listening' },
  ],
  memory_corrected: [
    { zh: '改过来了。Meikku 记新的。', en: 'Changed. Meikku keeps the new one.', face: 'listening' },
    { zh: '原来是这样。记下了。', en: 'So that is what it was. Noted.', face: 'curious' },
  ],
  memory_forgotten: [
    { zh: '删了。Meikku 不再提它。', en: 'Dropped. Meikku will not bring it up.', face: 'listening' },
  ],
  unsure: [
    { zh: 'Meikku 看不清这块想怎样。', en: 'Meikku cannot tell what this part wants.', face: 'unsure' },
    { zh: '不确定。你先动？', en: 'Not sure. You go first?', face: 'unsure' },
  ],
  idle: [
    { zh: '换个角度，这道就不一样了。', en: 'From here that ridge reads differently.', face: 'curious' },
    { zh: 'Meikku 看得见起伏，看不见你想要什么。', en: 'Meikku sees the bumps, not what you want.', face: 'curious' },
    { zh: '这块比刚才安静了。', en: 'It is quieter than it was a minute ago.', face: 'idle' },
    { zh: 'Meikku 今天只有推和抹。', en: 'Push and smooth is all Meikku has today.', face: 'idle' },
  ],
  moment_kept: [
    { zh: '存下了。下次从这儿接着。', en: 'Kept. Next time starts from here.', face: 'pleased' },
    { zh: '「{name}」记住了。', en: '“{name}” — remembered.', face: 'pleased' },
  ],
  moment_skipped: [
    { zh: '不留也行。它还在形上。', en: 'Fine. It is still on the form.', face: 'idle' },
  ],
  unlock_smooth: [
    { zh: '刚才那道太尖了，抹一下试试。', en: 'That ridge is sharp. Try smoothing it.', face: 'curious' },
  ],
  unlock_point: [
    { zh: '你可以直接点一下，告诉 Meikku 看哪。', en: 'Tap a spot to tell Meikku where to look.', face: 'curious' },
  ],
};

// UI copy. Structural labels stay English in Bungee per the design DNA; spoken
// and instructional text follows the visitor's language.
// One hint exists in the whole game: the very first touch. Everything else is
// taught by the situation — the unlock pop, Meikku's own line, the button
// simply appearing. No game narrates itself; neither does this one.
const UI = {
  hint_drag:        { zh: '拖一下这里', en: 'drag here' },
  moment_title:     { zh: '留下这一下？', en: 'Keep this?' },
  moment_player:    { zh: '你{tool}了{region}', en: 'you {tool} the {region}' },
  moment_meikku:    { zh: 'Meikku 在{region}回了一下', en: 'Meikku answered at the {region}' },
  moment_material:  { zh: '黏土自己塌了一点', en: 'the clay slumped on its own' },
  moment_changed:   { zh: '你们都改了下一步', en: 'both of you changed the next move' },
  tool_pull:        { zh: '拉', en: 'pulled' },
  tool_press:       { zh: '压', en: 'pressed' },
  tool_smooth:      { zh: '抹', en: 'smoothed' },
  ep_kept:          { zh: '已确认', en: 'confirmed' },
  ep_corrected:     { zh: '已修正', en: 'corrected' },
  ep_forgotten:     { zh: '已删除', en: 'forgotten' },
  correct_prompt:   { zh: '这一下其实是怎么回事？', en: 'What actually happened here?' },
  offline_note:     { zh: 'Meikku 现在跑在本地行为导演上，没有联网。', en: 'Meikku is running on the local director. No network.' },
  autoplay_claim:   { zh: 'SCRIPTED-LIVE 教程', en: 'SCRIPTED-LIVE TUTORIAL' },
  autoplay_eyebrow: { zh: '人类留下的草图', en: 'A ROUGH IDEA FROM THE HUMAN' },
  autoplay_human:   { zh: '人类的小改动', en: 'HUMAN DETOUR' },
  autoplay_blueprint: { zh: '{name} · 未完成蓝图', en: '{name} · UNFINISHED BLUEPRINT' },
  autoplay_phase_idea:     { zh: 'Meikku 正在读虚线。', en: 'Meikku is reading the dashes.' },
  autoplay_phase_making:   { zh: '机械臂正在把想法接到黏土上。', en: 'The arms are carrying the idea into the clay.' },
  autoplay_phase_mischief: { zh: '人类刚把一处带偏了。', en: 'The human just pulled one part off course.' },
  autoplay_phase_repair:   { zh: 'Meikku 看见了，正在修补。', en: 'Meikku noticed and is repairing it.' },
  autoplay_phase_almost:   { zh: '差一点抵达——但不是终点。', en: 'Nearly there—but not at an ending.' },
  autoplay_phase_reframe:  { zh: '材料改变了下一张草图。', en: 'The material changed the next sketch.' },
  autoplay_caption_idea:     { zh: '它已经开始了。正好从这里看。', en: 'It already started. You arrived mid-thought.' },
  autoplay_caption_making:   { zh: '做一点，不把结局锁死。', en: 'Make one move without fixing the ending.' },
  autoplay_caption_mischief: { zh: '偏差会被看见，也会得到回答。', en: 'A detour is noticed and answered.' },
  autoplay_caption_repair:   { zh: '碎碎念和机械臂在做同一件事。', en: 'The muttering and the hands tell the same truth.' },
  autoplay_caption_almost:   { zh: '进度接近终点，却从不归零。', en: 'Progress nears the edge, but never returns to zero.' },
  autoplay_caption_reframe:  { zh: '草图换了，痕迹留下，循环继续。', en: 'The sketch changes. The traces stay. The loop continues.' },
};

// Visitor's choice first, then the browser. Both languages are authored, not
// machine-translated, so a Chinese and an English visitor get the same game.
export const LANG = (() => {
  const q = new URLSearchParams(location.search).get('lang');
  const stored = (() => { try { return localStorage.getItem('meikku_lang'); } catch { return null; } })();
  const pick = q || stored || navigator.language || 'zh';
  return pick.toLowerCase().startsWith('zh') ? 'zh' : 'en';
})();

const lastPick = new Map();

export function line(deck, vars = {}) {
  const all = DECKS[deck];
  if (!all || !all.length) return null;

  // Never speak a line whose blanks cannot be filled. Without this, an unnamed
  // moment produces 「「」记住了。」 — a line that is false the moment it appears,
  // which is the one rule meikku_line_bank.json does not bend on.
  const pool = all.filter(item => speakable(item[LANG] || item.zh, vars));
  if (!pool.length) return null;

  let i = Math.floor(Math.random() * pool.length);
  if (pool.length > 1 && lastPick.get(deck) === i) i = (i + 1) % pool.length;
  lastPick.set(deck, i);
  const item = pool[i];
  return { text: fill(item[LANG] || item.zh, vars), face: item.face };
}

function speakable(s, vars) {
  const blanks = s.match(/\{(\w+)\}/g);
  if (!blanks) return true;
  return blanks.every(b => {
    const k = b.slice(1, -1);
    return vars[k] !== undefined && String(vars[k]).trim() !== '';
  });
}

export function ui(key, vars = {}) {
  const item = UI[key];
  if (!item) return key;
  return fill(item[LANG] || item.zh, vars);
}

function fill(s, vars) {
  return s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? vars[k] : ''));
}
