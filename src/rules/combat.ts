// 전투 규칙. UI를 모르는 순수 로직. 결과는 ctx.emit 이벤트로 알린다.
import type { CombatState, Enemy, HandDie, HandResult, Intent, IntentSpec, RunState } from '../core/state';
import { BALANCE } from '../data/balance';
import { ENEMY_BY_ID, JESTER_POOL } from '../data/enemies';
import { FACE_BY_ID } from '../data/faces';
import { HAND_BY_ID } from '../data/hands';
import { MATERIAL_BY_ID } from '../data/materials';
import { checkCond, condCount, SKILL_BY_ID, type SkillUse } from '../data/skills';
import { fire, getMods, rng, sources, toast, type Ctx } from './ctx';
import { ddaEnemyHpMult } from './dda';
import { effValue, faceOf, forcePip, refreshDerived, rollFaceIdx, rollHandDie, setFace } from './dice';
import { evaluateHand } from './hands';
import {
  addHeat, addJackpot, alive, cbOf, damageEnemy, damagePlayer, gainBlock, gainGold, healPlayer, randomEnemy, resetHeat,
} from './ops';

// ───────────── 시작 ─────────────
export function makeEnemy(ctx: Ctx, id: string, hpMult: number, patternOffset = 0): Enemy {
  const def = ENEMY_BY_ID[id];
  const hp = Math.max(1, Math.round(def.hp * hpMult));
  const e: Enemy = {
    uid: ctx.run.nextUid++, id, name: def.name, emoji: def.emoji, hp, maxHp: hp, block: 0,
    patternIdx: patternOffset % def.pattern.length, intent: { k: 'attack', label: '', icon: '' },
    poison: 0, weak: 0, nextMult: 1, stacks: 0, charge: 0, phase: 1, splitDone: false, enraged: false,
  };
  return e;
}

export function startCombat(ctx: Ctx, kind: CombatState['kind'], enemyIds: string[], rewardMult = 1) {
  const run = ctx.run;
  const m = getMods(run);
  const hpMult = BALANCE.enemyHpMult * (1 + m.enemyHpPct) * ddaEnemyHpMult(run);
  const enemies: Enemy[] = [];
  const seen: Record<string, number> = {};
  for (const id of enemyIds) {
    seen[id] = (seen[id] ?? 0);
    enemies.push(makeEnemy(ctx, id, hpMult, seen[id]));
    seen[id]++;
    run.flags['seen_enemy_' + id] = 1;
  }
  const cb: CombatState = {
    kind, enemies, hand: [], phase: 'roll', turn: 0, rerollsLeft: 0, block: 0, keepBlock: 0, thorns: 0,
    piggy: 0, piggyMult: 1, handResult: null, usedSlots: [], target: enemies[0].uid, diceUsedThisTurn: 0,
    lastSkill: null, doubledown: 0, counters: {}, turnCounters: {},
    next: { six: 0, one: 0, rerollPenalty: 0, flip: false, stealDie: false, preview: [] },
    jackpotTurn: false, houseRule: null, queenParity: null, lastSkillDamage: 0, dmgTaken: 0, result: null,
    nextKey: 1, rewardMult, brokenDice: [], log: [],
  };
  run.combat = cb;
  run.screen = 'combat';
  for (const e of enemies) e.intent = makeIntent(ctx, e);
  fire(ctx, 'onCombatStart');
  startTurn(ctx);
}

// ───────────── 인텐트 ─────────────
function attackValue(ctx: Ctx, e: Enemy, base: number): number {
  const m = getMods(ctx.run);
  let v = (base + e.stacks) * e.nextMult;
  if (e.enraged) v *= 1.5;
  if (e.phase >= 2 && m.bossPhase2 > 0 && ENEMY_BY_ID[e.id].tier === 'boss') v *= 1.25;
  v -= e.weak;
  return Math.max(0, Math.round(v));
}

export function makeIntent(ctx: Ctx, e: Enemy): Intent {
  const def = ENEMY_BY_ID[e.id];
  let spec: IntentSpec = def.pattern[e.patternIdx % def.pattern.length];
  if (spec.k === 'random') spec = rng(ctx, 'combat').pick(JESTER_POOL);
  return describeIntent(ctx, e, spec);
}

export function describeIntent(ctx: Ctx, e: Enemy, spec: IntentSpec): Intent {
  const cb = ctx.run.combat;
  const n = spec.n ?? 0;
  switch (spec.k) {
    case 'attack': return { ...spec, icon: '⚔️', label: `${attackValue(ctx, e, n)}` };
    case 'attackRange': return { ...spec, icon: '⚔️', label: `${attackValue(ctx, e, n)}~${attackValue(ctx, e, spec.n2 ?? n)}` };
    case 'multi': return { ...spec, icon: '⚔️', label: `${attackValue(ctx, e, n)}×${spec.hits}` };
    case 'block': return { ...spec, icon: '🛡️', label: `${n}` };
    case 'buff': return { ...spec, icon: '💪', label: '다음 공격 ×2' };
    case 'debuff': return { ...spec, icon: '🌀', label: '리롤 -1' };
    case 'steal': return { ...spec, icon: '🫳', label: `저금통 -${n}` };
    case 'stealDie': return { ...spec, icon: '🫳', label: '주사위 강탈' };
    case 'tax': return { ...spec, icon: '🧾', label: '골드 10%' };
    case 'flip': return { ...spec, icon: '🔃', label: '판 뒤집기' };
    case 'interest': return { ...spec, icon: '📈', label: `공격 +${n}` };
    case 'copy': return { ...spec, icon: '🪞', label: `${Math.round((cb?.lastSkillDamage ?? 0) * 0.5)}` };
    case 'charge': return { ...spec, icon: '⏳', label: '충전 중' };
    case 'rig': return { ...spec, icon: '🎯', label: '주사위 1 강제' };
    case 'seize': return { ...spec, icon: '📜', label: '소모품 압류' };
    case 'bet': return { ...spec, icon: '🎲', label: `${attackValue(ctx, e, n)}~${attackValue(ctx, e, n * 6)}` };
    case 'houseCopy': {
      const mult = cb?.handResult?.mult ?? 1;
      return { ...spec, icon: '🏛️', label: `${n}×족보(${attackValue(ctx, e, Math.round(n * mult))})` };
    }
    default: return { ...spec, icon: '❔', label: '?' };
  }
}

export function refreshIntents(ctx: Ctx) {
  const cb = ctx.run.combat;
  if (!cb) return;
  for (const e of alive(cb)) e.intent = describeIntent(ctx, e, e.intent);
}

// ───────────── 턴 ─────────────
export function baseRerolls(ctx: Ctx): number {
  return Math.max(0, BALANCE.baseRerolls + getMods(ctx.run).rerolls);
}

export function startTurn(ctx: Ctx) {
  const run = ctx.run;
  const cb = cbOf(ctx);
  const m = getMods(run);
  cb.turn++;
  cb.phase = 'roll';
  // 요새: 직전 턴에 쌓은 유지 방어는 이번 턴까지만 남는다
  cb.block = cb.keepBlock;
  cb.keepBlock = 0;
  cb.thorns = 0;
  cb.handResult = null;
  cb.usedSlots = run.skills.map(() => false);
  cb.diceUsedThisTurn = 0;
  cb.lastSkill = null;
  cb.doubledown = 0;
  cb.houseRule = null;
  cb.queenParity = null;
  cb.turnCounters = {};
  cb.rerollsLeft = Math.max(0, baseRerolls(ctx) - cb.next.rerollPenalty);
  cb.next.rerollPenalty = 0;
  cb.turnCounters.nudge = m.turnNudge;
  cb.turnCounters.setValue = m.turnGodhand + (cb.turn === 1 ? m.stackdeck : 0) + (cb.counters.marked ? 1 : 0);

  // 잭팟 턴
  cb.jackpotTurn = run.jackpot >= BALANCE.jackpotMax;
  if (cb.jackpotTurn) {
    run.jackpot = 0;
    run.stats.jackpotTurns++;
    toast(ctx, '💰 잭팟 턴! 모든 주사위 눈 ×2', 'gold');
  }

  // 손 구성
  const hand: HandDie[] = [];
  run.dice.forEach((d, i) => {
    if (cb.brokenDice.includes(i)) return;
    hand.push({
      key: cb.nextKey++, dieIdx: i, temp: false, face: 0, pip: 1, material: d.material, locked: false, used: false,
      rolledFx: false, golden: cb.jackpotTurn, gone: false,
    });
  });
  cb.hand = hand;

  // 자해(저주받은 재질)
  for (const hd of hand) {
    const self = MATERIAL_BY_ID[hd.material].turnSelfDmg;
    if (self) damagePlayer(ctx, self, '저주받은 주사위', { ignoreBlock: true });
  }
  if (cb.turn === 1 && m.firstTurnBlock) gainBlock(ctx, m.firstTurnBlock);
  fire(ctx, 'onTurnStart');
  for (const e of alive(cb)) ENEMY_BY_ID[e.id].onTurnStart?.(ctx, e);
  if (cb.houseRule === 'oneReroll') cb.rerollsLeft = Math.min(cb.rerollsLeft, 1);
  if (cb.result) return;

  // 첫 굴림
  const preview = cb.next.preview;
  hand.forEach((hd, i) => {
    if (i === 0 && preview.length) setFace(ctx, hd, preview[0]);
    else rollHandDie(ctx, hd);
  });
  cb.next.preview = [];
  applyForced(ctx, hand);
  if (cb.turn === 1 && m.weighted) {
    const one = hand.find((h) => h.pip === 1);
    if (one) {
      rollHandDie(ctx, one);
      toast(ctx, '⚖️ 무게추: 1 재굴림', 'info');
    }
  }
  if (cb.next.flip) {
    cb.next.flip = false;
    for (const hd of hand) if (hd.pip >= 1 && hd.pip <= 6) hd.pip = 7 - hd.pip;
    toast(ctx, '🔃 판 뒤집기! 모든 주사위가 7-눈', 'bad');
  }
  if (cb.next.stealDie) {
    cb.next.stealDie = false;
    const hi = [...hand].sort((a, b) => b.pip - a.pip)[0];
    if (hi) {
      hi.used = true;
      hi.gone = true;
      toast(ctx, `🦝 주사위 도둑이 ${hi.pip}을 빼앗았다`, 'bad');
    }
  }
  // 리롤 불가 재질은 자동 잠금
  for (const hd of hand) if (MATERIAL_BY_ID[hd.material].noReroll) hd.locked = true;
  postRoll(ctx, hand);
  fire(ctx, 'onRoll');
  refreshDerived(cb);
  ctx.emit({ t: 'roll', keys: hand.map((h) => h.key) });
}

function applyForced(ctx: Ctx, rolled: HandDie[]) {
  const cb = cbOf(ctx);
  const run = ctx.run;
  const pickable = () => rolled.filter((h) => !h.used);
  // 온 파이어: 열기 10 → 주사위 1개 6
  if (run.heat >= BALANCE.heatMax && cb.turnCounters.onfire !== 1 && cb.phase === 'roll' && cb.rerollsLeft >= 0) {
    if (!cb.turnCounters.onfire) {
      const t = pickable().find((h) => h.pip !== 6);
      if (t) forcePip(ctx, t, 6);
      cb.turnCounters.onfire = 1;
    }
  }
  while (cb.next.six > 0) {
    const t = pickable().find((h) => h.pip !== 6);
    if (t) forcePip(ctx, t, 6);
    cb.next.six--;
  }
  while (cb.next.one > 0) {
    const t = [...pickable()].sort((a, b) => b.pip - a.pip)[0];
    if (t) forcePip(ctx, t, 1);
    cb.next.one--;
  }
}

/** 굴린 직후 처리: 유리 깨짐, "나오면 즉시" 면 효과 */
function postRoll(ctx: Ctx, rolled: HandDie[]) {
  const cb = cbOf(ctx);
  for (const hd of rolled) {
    const mat = MATERIAL_BY_ID[hd.material];
    if (mat.breakOn !== undefined && hd.pip === mat.breakOn && hd.dieIdx >= 0) {
      hd.used = true;
      hd.gone = true;
      cb.brokenDice.push(hd.dieIdx);
      toast(ctx, '💥 유리 주사위가 1이 나와 깨졌다 (이번 전투만)', 'bad');
      continue;
    }
    const f = faceOf(hd);
    if (f?.onRolled && !hd.rolledFx) {
      hd.rolledFx = true;
      f.onRolled(ctx, hd);
    }
  }
}

export function toggleLock(ctx: Ctx, key: number) {
  const cb = cbOf(ctx);
  const hd = cb.hand.find((h) => h.key === key);
  if (!hd || hd.used) return;
  if (cb.houseRule === 'noLock' && cb.phase === 'roll') return;
  if (MATERIAL_BY_ID[hd.material].noReroll) return;
  hd.locked = !hd.locked;
}

export function canReroll(ctx: Ctx): boolean {
  const cb = ctx.run.combat;
  return !!cb && cb.phase === 'roll' && cb.rerollsLeft > 0 && cb.hand.some((h) => !h.used && !h.locked);
}

export function reroll(ctx: Ctx) {
  const cb = cbOf(ctx);
  const m = getMods(ctx.run);
  if (!canReroll(ctx)) return;
  cb.rerollsLeft--;
  const targets = cb.hand.filter((h) => !h.used && !h.locked);
  const rolled: HandDie[] = [];
  for (const hd of targets) {
    const before = hd.pip;
    const beforeFace = hd.face;
    rollHandDie(ctx, hd);
    if (MATERIAL_BY_ID[hd.material].keepBest && hd.pip < before) {
      setFace(ctx, hd, beforeFace);
      hd.pip = before;
    }
    rolled.push(hd);
  }
  // 텀블러: 잠근 주사위 중 가장 낮은 1개도 굴림, 낮아지면 되돌림
  if (m.tumble) {
    const locked = cb.hand.filter((h) => !h.used && h.locked && !MATERIAL_BY_ID[h.material].noReroll).sort((a, b) => a.pip - b.pip)[0];
    if (locked) {
      const before = locked.pip;
      const bf = locked.face;
      const idx = rollFaceIdx(ctx, locked);
      setFace(ctx, locked, idx);
      if (locked.pip <= before) { setFace(ctx, locked, bf); locked.pip = before; } else rolled.push(locked);
    }
  }
  // 열쇠공: 잠근 주사위 +1
  if (m.locksmith) {
    for (const h of cb.hand) if (!h.used && h.locked && h.pip >= 1 && h.pip < 6 && !rolled.includes(h)) h.pip++;
  }
  applyForced(ctx, rolled);
  postRoll(ctx, rolled);
  fire(ctx, 'onReroll');
  refreshDerived(cb);
  ctx.emit({ t: 'roll', keys: rolled.map((h) => h.key) });
}

// ───────────── 족보 확정 ─────────────
export function handInputs(cb: CombatState) {
  return cb.hand.filter((h) => !h.gone).map((h) => {
    const f = faceOf(h);
    return { pip: h.pip, wild: !!(f?.wild || MATERIAL_BY_ID[h.material].wild), magnet: !!f?.magnet };
  });
}

export function previewHand(ctx: Ctx): HandResult {
  const cb = cbOf(ctx);
  return scoreHand(ctx, evaluateHand(handInputs(cb), { smallLadder: getMods(ctx.run).smallLadder > 0 }));
}

export function scoreHand(ctx: Ctx, id: HandResult['id']): HandResult {
  const cb = cbOf(ctx);
  const m = getMods(ctx.run);
  const def = HAND_BY_ID[id];
  let mult = def.mult + (m.handAdd[id] ?? 0) + (id !== 'none' ? m.handAll : 0);
  if (id !== 'none') {
    for (const h of cb.hand) {
      const f = faceOf(h);
      if (f?.handMultAdd && !h.gone) mult += f.handMultAdd;
    }
  }
  return { id, name: def.name, mult: Math.round(mult * 100) / 100, heat: def.heat, jackpot: def.jackpot };
}

export function confirmHand(ctx: Ctx) {
  const cb = cbOf(ctx);
  const run = ctx.run;
  if (cb.phase !== 'roll') return;
  cb.phase = 'place';
  for (const h of cb.hand) h.locked = false;
  const hand = previewHand(ctx);
  cb.handResult = hand;
  // 재장전으로 다시 확정하는 경우: 배율만 갱신
  if (cb.turnCounters.confirmed) {
    ctx.emit({ t: 'hand', hand });
    refreshIntents(ctx);
    return;
  }
  cb.turnCounters.confirmed = 1;
  if (hand.heat < 0) resetHeat(ctx);
  else addHeat(ctx, hand.heat);
  if (hand.jackpot) addJackpot(ctx, hand.jackpot);
  if (HAND_BY_ID[hand.id].celebrate) {
    run.stats.yahtzees++;
    cb.turnCounters.yahtzee = 1;
    run.flags.meta_yahtzee = (run.flags.meta_yahtzee ?? 0) + 1;
    ctx.emit({ t: 'yahtzee' });
  }
  run.flags['seen_hand_' + hand.id] = 1;
  ctx.emit({ t: 'hand', hand });
  // "나오면" 효과
  for (const h of cb.hand) {
    if (h.used) continue;
    const f = faceOf(h);
    f?.onFinal?.(ctx, h);
    if (cb.result) return;
  }
  fire(ctx, 'onHandScored', { hand });
  for (const e of alive(cb)) ENEMY_BY_ID[e.id].onHandScored?.(ctx, e, hand);
  refreshIntents(ctx);
}

// ───────────── 스킬 사용 ─────────────
export function freeDice(cb: CombatState): HandDie[] {
  return cb.hand.filter((h) => !h.used);
}

export function skillUsable(ctx: Ctx, slot: number): boolean {
  const cb = cbOf(ctx);
  const inst = ctx.run.skills[slot];
  if (!inst || cb.usedSlots[slot]) return false;
  const def = SKILL_BY_ID[inst.id];
  if (def.perTurn && (cb.turnCounters['sk_' + def.id] ?? 0) >= def.perTurn) return false;
  if (def.perCombat && (cb.counters['sk_' + def.id] ?? 0) >= def.perCombat) return false;
  return true;
}

export function canUse(ctx: Ctx, slot: number, keys: number[]): boolean {
  const cb = ctx.run.combat;
  if (!cb || cb.phase === 'over' || !skillUsable(ctx, slot)) return false;
  const def = SKILL_BY_ID[ctx.run.skills[slot].id];
  const dice = keys.map((k) => cb.hand.find((h) => h.key === k)).filter((h): h is HandDie => !!h && !h.used);
  if (dice.length !== keys.length) return false;
  if (cb.houseRule === 'noSix' && dice.some((d) => d.pip === 6)) return false;
  return checkCond(def.cond, dice.map((d) => d.pip), freeDice(cb).length);
}

/** 조건을 만족하는 주사위 조합을 자동으로 찾는다 (선택 보조/봇용) */
export function autoPick(ctx: Ctx, slot: number, prefer: number[] = []): number[] | null {
  const cb = cbOf(ctx);
  const def = SKILL_BY_ID[ctx.run.skills[slot]?.id];
  if (!def) return null;
  const free = freeDice(cb);
  const n = condCount(def.cond, free.length);
  if (n > free.length || n === 0) return null;
  const ordered = [...free].sort((a, b) => (prefer.includes(b.key) ? 1 : 0) - (prefer.includes(a.key) ? 1 : 0) || b.pip - a.pip);
  const res: number[] = [];
  let found: number[] | null = null;
  const rec = (start: number) => {
    if (found) return;
    if (res.length === n) {
      if (canUse(ctx, slot, res)) found = [...res];
      return;
    }
    for (let i = start; i < ordered.length; i++) {
      res.push(ordered[i].key);
      rec(i + 1);
      res.pop();
      if (found) return;
    }
  };
  rec(0);
  return found;
}

export function useSkill(ctx: Ctx, slot: number, keys: number[], choice?: { key: number; value: number }): boolean {
  const run = ctx.run;
  const cb = cbOf(ctx);
  if (!canUse(ctx, slot, keys)) return false;
  if (cb.phase === 'roll') confirmHand(ctx);
  if (cb.result) return true;
  const inst = run.skills[slot];
  const def = SKILL_BY_ID[inst.id];
  const dice = keys.map((k) => cb.hand.find((h) => h.key === k)!);
  for (const d of dice) d.used = true;
  cb.usedSlots[slot] = true;
  cb.diceUsedThisTurn += dice.length;
  if (def.perTurn) cb.turnCounters['sk_' + def.id] = (cb.turnCounters['sk_' + def.id] ?? 0) + 1;
  if (def.perCombat) cb.counters['sk_' + def.id] = (cb.counters['sk_' + def.id] ?? 0) + 1;

  // 메아리: 직전 스킬을 이 눈으로
  let runDef = def;
  let runUp = inst.up;
  if (def.echo) {
    const last = cb.lastSkill ? run.skills[cb.lastSkill.slot] : null;
    if (!last || SKILL_BY_ID[last.id].noEcho) {
      toast(ctx, '메아리: 따라할 스킬이 없다', 'bad');
      fire(ctx, 'onSkill');
      return true;
    }
    runDef = SKILL_BY_ID[last.id];
    runUp = last.up;
  }

  let power = 1 + runUp;
  const faceMult = { mult: 1 };
  for (const d of dice) {
    const f = faceOf(d);
    if (f?.powerMult) {
      power *= f.powerMult;
      if (f.jackpotOnUse) addJackpot(ctx, f.jackpotOnUse);
    }
  }
  const crit = dice.some((d) => faceOf(d)?.powerMult);
  if (cb.doubledown && !def.primesDouble) {
    power *= 2;
    cb.doubledown = 0;
  }

  const vals = dice.map((d) => effValue(ctx, d));
  const primaryPip = Math.max(...dice.map((d) => d.pip));
  let dealtTotal = 0;
  const handMult = cb.handResult?.mult ?? 1;
  const heatMult = 1 + run.heat * (BALANCE.heatDmgPerStep + getMods(run).heatDmgExtra);
  const extraMult = sources(run).reduce((acc, s) => acc * (s.dmgMult?.(ctx) ?? 1), 1);
  const steelBonus = dice.reduce((s, d) => s + (MATERIAL_BY_ID[d.material].blockBonus ?? 0), 0);

  const u: SkillUse = {
    ctx, slot, dice, vals, v: vals[0], sum: vals.reduce((a, b) => a + b, 0), power, ret: null, choice,
    dmg: (base, opts = {}) => {
      const amount = opts.flat ? base : base * handMult * heatMult * power * extraMult;
      const hits = opts.hits ?? 1;
      let total = 0;
      for (let i = 0; i < hits; i++) {
        const targets = opts.aoe ? alive(cb) : opts.random ? [randomEnemy(ctx)].filter((e): e is Enemy => !!e) : [cb.enemies.find((e) => e.uid === cb.target && e.hp > 0) ?? alive(cb)[0]].filter(Boolean) as Enemy[];
        for (const t of targets) total += damageEnemy(ctx, t, amount, { pip: primaryPip, crit, source: runDef.name });
      }
      dealtTotal += total;
      return total;
    },
    block: (base) => {
      let b = base * handMult * power + steelBonus;
      if (cb.houseRule === 'halfBlock') b /= 2;
      gainBlock(ctx, b);
    },
    gold: (base) => gainGold(ctx, base * handMult * power),
    heal: (base) => healPlayer(ctx, base * power),
    piggy: (base) => { cb.piggy += Math.round(base * handMult * power); },
  };

  // 운명 조작: 다른 주사위 눈 변경
  if (def.needsChoice && choice) {
    const t = cb.hand.find((h) => h.key === choice.key && !h.used);
    if (t) {
      forcePip(ctx, t, Math.max(1, Math.min(6, choice.value)));
      ctx.emit({ t: 'roll', keys: [t.key] });
    }
  }

  runDef.run(u);

  // 면 사용 효과
  for (const d of dice) faceOf(d)?.onUse?.({ ctx, hd: d, power: faceMult });

  // 주사위를 소모하지 않는 스킬 (운명 조작 등): 쓴 주사위를 그대로 돌려준다
  if (runDef.keepDie || def.keepDie) {
    for (const d of dice) d.used = false;
    cb.diceUsedThisTurn -= dice.length;
  }

  // 손으로 반환
  if (u.ret) {
    const src = dice[0];
    src.used = true;
    u.ret.forEach((pip, i) => {
      const nd: HandDie = i === 0
        ? { ...src, used: false, locked: false, pip, sticker: undefined, rolledFx: true }
        : { ...src, key: cb.nextKey++, dieIdx: -1, temp: true, used: false, locked: false, pip, sticker: undefined, rolledFx: true };
      if (i === 0) {
        const idx = cb.hand.indexOf(src);
        cb.hand[idx] = nd;
      } else cb.hand.push(nd);
    });
    cb.diceUsedThisTurn -= 1;
    refreshDerived(cb);
    ctx.emit({ t: 'roll', keys: cb.hand.filter((h) => !h.used).map((h) => h.key) });
  }

  cb.lastSkillDamage = dealtTotal || cb.lastSkillDamage;
  if (!def.echo) cb.lastSkill = { slot };
  fire(ctx, 'onSkill');
  fire(ctx, 'onPlace');
  refreshIntents(ctx);
  return true;
}

/** 손가락 튕기기 (±1) */
export function nudgeDie(ctx: Ctx, key: number, delta: 1 | -1): boolean {
  const cb = cbOf(ctx);
  const hd = cb.hand.find((h) => h.key === key);
  if (!hd || hd.used || (cb.turnCounters.nudge ?? 0) <= 0) return false;
  const v = hd.pip + delta;
  if (v < 1 || v > 6) return false;
  hd.pip = v;
  hd.sticker = undefined;
  cb.turnCounters.nudge--;
  refreshDerived(cb);
  ctx.emit({ t: 'roll', keys: [key] });
  return true;
}

/** 신의 손 / 밑장빼기 / 표시된 주사위: 원하는 눈으로 */
export function setDieValue(ctx: Ctx, key: number, value: number): boolean {
  const cb = cbOf(ctx);
  const hd = cb.hand.find((h) => h.key === key);
  if (!hd || hd.used || (cb.turnCounters.setValue ?? 0) <= 0) return false;
  forcePip(ctx, hd, Math.max(1, Math.min(6, value)));
  cb.turnCounters.setValue--;
  refreshDerived(cb);
  ctx.emit({ t: 'roll', keys: [key] });
  return true;
}

// ───────────── 턴 종료 ─────────────
export function endTurn(ctx: Ctx) {
  const run = ctx.run;
  const cb = cbOf(ctx);
  if (cb.phase === 'over') return;
  if (cb.phase === 'roll') confirmHand(ctx);
  if (cb.result) return;

  // 저금통
  const frozen = alive(cb).some((e) => ENEMY_BY_ID[e.id].frozePiggy && e.block > 0);
  if (frozen) toast(ctx, '🔐 금고지기: 저금통 동결', 'bad');
  else {
    let add = 0;
    let mult = 1;
    for (const h of cb.hand) {
      if (h.used) continue;
      const mat = MATERIAL_BY_ID[h.material];
      const f = faceOf(h);
      add += h.pip * (mat.piggyMult ?? 1) * (h.golden ? 2 : 1);
      if (f?.piggyMult) mult *= f.piggyMult;
    }
    cb.piggy = Math.round((cb.piggy + add) * mult);
  }
  if (cb.doubledown) {
    damagePlayer(ctx, cb.doubledown, '더블다운', { ignoreBlock: true });
    cb.doubledown = 0;
  }
  if (cb.jackpotTurn) {
    run.pendingFreeSpins++;
    toast(ctx, '🎰 잭팟 슬롯 무료 스핀 1회 적립 (보상 화면에서 사용)', 'gold');
  }
  fire(ctx, 'onTurnEnd');
  if (cb.result) return;

  // 미리보기 (다음 턴 첫 주사위)
  const m = getMods(run);
  if (m.preview > 0) {
    const first = run.dice.findIndex((_, i) => !cb.brokenDice.includes(i));
    if (first >= 0) {
      const tmp: HandDie = { key: -1, dieIdx: first, temp: false, face: 0, pip: 1, material: run.dice[first].material, locked: false, used: false, rolledFx: false, golden: false, gone: false };
      cb.next.preview = [rollFaceIdx(ctx, tmp)];
    }
  }

  enemyTurn(ctx);
  if (cb.result) return;
  startTurn(ctx);
}

export function previewPip(ctx: Ctx): number | null {
  const cb = ctx.run.combat;
  if (!cb || !cb.next.preview.length) return null;
  const first = ctx.run.dice.findIndex((_, i) => !cb.brokenDice.includes(i));
  const die = ctx.run.dice[first];
  const f = die.faces[cb.next.preview[0]];
  return f.sticker && FACE_BY_ID[f.sticker].pip !== undefined ? FACE_BY_ID[f.sticker].pip! : f.pip;
}

function enemyAttack(ctx: Ctx, e: Enemy, amount: number, hits = 1) {
  const cb = cbOf(ctx);
  const m = getMods(ctx.run);
  for (let i = 0; i < hits; i++) {
    if (cb.result) return;
    damagePlayer(ctx, amount, e.name);
    const reflect = cb.thorns + m.reflect;
    if (reflect > 0 && e.hp > 0) damageEnemy(ctx, e, reflect, { source: '반사' });
    fire(ctx, 'onPlayerHit', { enemy: e });
  }
  e.nextMult = 1;
  e.weak = 0;
}

export function enemyTurn(ctx: Ctx) {
  const run = ctx.run;
  const cb = cbOf(ctx);
  for (const e of [...alive(cb)]) {
    if (cb.result) return;
    // 독
    if (e.poison > 0) {
      damageEnemy(ctx, e, e.poison, { source: '독' });
      e.poison = Math.max(0, e.poison - 1);
      if (e.hp <= 0) continue;
    }
    e.block = 0;
    ctx.emit({ t: 'enemyAct', uid: e.uid });
    const it = e.intent;
    const n = it.n ?? 0;
    switch (it.k) {
      case 'attack': enemyAttack(ctx, e, attackValue(ctx, e, n)); break;
      case 'attackRange': enemyAttack(ctx, e, attackValue(ctx, e, rng(ctx, 'combat').int(n, it.n2 ?? n))); break;
      case 'multi': enemyAttack(ctx, e, attackValue(ctx, e, n), it.hits ?? 1); break;
      case 'block': e.block += n; break;
      case 'buff': e.nextMult = 2; break;
      case 'debuff': cb.next.rerollPenalty += 1; break;
      case 'steal': cb.piggy = Math.max(0, cb.piggy - n); toast(ctx, `🫳 저금통 -${n}`, 'bad'); break;
      case 'stealDie': cb.next.stealDie = true; break;
      case 'tax': { const t = Math.floor(run.gold * 0.1); if (t > 0) gainGold(ctx, -t); toast(ctx, `🧾 세금 ${t}G 징수`, 'bad'); break; }
      case 'flip': cb.next.flip = true; break;
      case 'interest': e.stacks += n; break;
      case 'copy': enemyAttack(ctx, e, Math.max(2, Math.round(cb.lastSkillDamage * 0.5))); break;
      case 'charge': e.charge = 1; break;
      case 'rig': cb.next.one += 1; break;
      case 'seize': {
        if (run.consumables.length) {
          const i = rng(ctx, 'combat').int(0, run.consumables.length - 1);
          run.consumables.splice(i, 1);
          toast(ctx, '📜 소모품 1개 압류당했다', 'bad');
        }
        break;
      }
      case 'bet': {
        const r = rng(ctx, 'combat').die();
        toast(ctx, `🎲 하이롤러의 베팅: ${r}`, 'info');
        enemyAttack(ctx, e, attackValue(ctx, e, r * n));
        break;
      }
      case 'houseCopy': enemyAttack(ctx, e, attackValue(ctx, e, Math.round(n * (cb.handResult?.mult ?? 1)))); break;
      default: break;
    }
    if (it.k !== 'charge') e.charge = 0;
    const def = ENEMY_BY_ID[e.id];
    e.patternIdx = (e.patternIdx + 1) % def.pattern.length;
    e.intent = makeIntent(ctx, e);
  }
}

export function setTarget(ctx: Ctx, uid: number) {
  const cb = cbOf(ctx);
  if (cb.enemies.some((e) => e.uid === uid && e.hp > 0)) cb.target = uid;
}

export function useConsumable(ctx: Ctx, idx: number, def: { use?: (c: Ctx) => boolean }): boolean {
  if (!def.use) return false;
  const ok = def.use(ctx);
  if (ok) ctx.run.consumables.splice(idx, 1);
  return ok;
}

export interface SkillPreview {
  keys: number[] | null;
  dmg: number;
  block: number;
  heal: number;
  gold: number;
  piggy: number;
  chance: boolean;
}

/** 스킬을 실제 규칙으로 복제 상태에서 미리 실행해 예상 효과를 구한다 (실제 상태·RNG는 건드리지 않음) */
export function previewSkill(ctx: Ctx, slot: number, prefer: number[]): SkillPreview {
  const empty: SkillPreview = { keys: null, dmg: 0, block: 0, heal: 0, gold: 0, piggy: 0, chance: false };
  const cb = ctx.run.combat;
  if (!cb || cb.phase === 'over' || !skillUsable(ctx, slot)) return empty;
  const keys = canUse(ctx, slot, prefer) ? prefer : autoPick(ctx, slot, prefer);
  if (!keys) return empty;
  const def = SKILL_BY_ID[ctx.run.skills[slot].id];
  const run2 = structuredClone(ctx.run);
  const c2: Ctx = { run: run2, emit: () => {} };
  const cb2 = run2.combat!;
  if (cb2.phase === 'roll') confirmHand(c2);
  if (cb2.result) return { ...empty, keys };
  const hp0 = cb2.enemies.reduce((s, e) => s + e.hp + e.block, 0);
  const b0 = cb2.block + cb2.keepBlock;
  const h0 = run2.hp;
  const g0 = run2.gold;
  const p0 = cb2.piggy;
  useSkill(c2, slot, keys, def.needsChoice ? undefined : undefined);
  const hp1 = cb2.enemies.reduce((s, e) => s + e.hp + e.block, 0);
  return {
    keys,
    dmg: Math.max(0, hp0 - hp1),
    block: Math.max(0, cb2.block + cb2.keepBlock - b0),
    heal: Math.max(0, run2.hp - h0),
    gold: Math.max(0, run2.gold - g0),
    piggy: Math.max(0, cb2.piggy - p0),
    chance: !!def.chance,
  };
}

/** 이번 턴에 더 할 수 있는 행동이 있는가 */
export function hasMoves(ctx: Ctx): boolean {
  const cb = ctx.run.combat;
  if (!cb || cb.phase === 'over') return false;
  if (cb.phase === 'roll' && canReroll(ctx)) return true;
  return ctx.run.skills.some((_, i) => skillUsable(ctx, i) && !!autoPick(ctx, i));
}

/** 강화 미리보기용: 조건에 맞는 대표 주사위로 스킬을 실행했을 때의 기본 효과 (족보·열기 배율 없이) */
export function skillSample(run: RunState, slot: number, up: number): { pips: number[]; dmg: number; block: number; heal: number; gold: number; piggy: number; poison: number; chance: boolean } | null {
  const inst = run.skills[slot];
  if (!inst) return null;
  const def = SKILL_BY_ID[inst.id];
  const c = def.cond;
  const pips =
    c.k === 'range' ? [c.hi] : c.k === 'even' ? [6] : c.k === 'odd' ? [5] : c.k === 'exact' ? [c.v]
      : c.k === 'same' ? Array(c.n).fill(6) : c.k === 'seq' ? Array.from({ length: c.n }, (_, i) => 7 - c.n + i)
        : c.k === 'sumPair' ? [3, 4] : c.k === 'sumMin' ? [6, 5, 4] : c.k === 'all' ? [6, 5, 4, 3, 2] : [6];
  const r2 = structuredClone(run);
  r2.combat = null;
  r2.heat = 0;
  r2.jackpot = 0;
  r2.skills[slot] = { id: inst.id, up };
  r2.dice = pips.map((_, i) => ({ uid: 9000 + i, material: 'wood', faces: [1, 2, 3, 4, 5, 6].map((p) => ({ pip: p })) }));
  const c2: Ctx = { run: r2, emit: () => {} };
  try {
    startCombat(c2, 'normal', ['golem']);
    const cb = r2.combat!;
    cb.enemies.forEach((e) => { e.hp = e.maxHp = 99999; e.block = 0; });
    cb.hand.forEach((h, i) => { h.pip = pips[i]; h.sticker = undefined; h.used = false; h.gone = false; h.locked = false; h.golden = false; });
    cb.phase = 'place';
    cb.turnCounters.confirmed = 1;
    cb.handResult = { id: 'none', name: '', mult: 1, heat: 0, jackpot: 0 };
    const presetBlock = def.sampleBlock ?? 0;
    cb.block = presetBlock;
    cb.keepBlock = 0;
    cb.piggy = 0;
    const hp0 = cb.enemies.reduce((s, e) => s + e.hp, 0);
    const h0 = r2.hp = Math.max(1, r2.maxHp - 50);
    const g0 = r2.gold;
    const keys = cb.hand.map((h) => h.key);
    if (!canUse(c2, slot, keys)) return null;
    useSkill(c2, slot, keys);
    const chanceDmg = def.chanceHit ? Math.round(def.chanceHit(pips[0]) * (1 + up)) : 0;
    return {
      pips,
      chance: !!def.chanceHit,
      poison: cb.enemies.reduce((s, e) => s + e.poison, 0),
      dmg: def.chanceHit ? chanceDmg : Math.max(0, hp0 - cb.enemies.reduce((s, e) => s + e.hp, 0)),
      block: Math.max(0, cb.block + cb.keepBlock - presetBlock),
      heal: Math.max(0, r2.hp - h0),
      gold: Math.max(0, r2.gold - g0),
      piggy: cb.piggy,
    };
  } catch {
    return null;
  }
}
