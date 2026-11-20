// 전투 규칙. UI를 모르는 순수 로직. 결과는 ctx.emit 이벤트로 알린다.
import type { CardInst, CombatState, Enemy, HandDie, HandResult, Intent, IntentSpec } from '../core/state';
import { BALANCE } from '../data/balance';
import { ENEMY_BY_ID, JESTER_POOL } from '../data/enemies';
import { FACE_BY_ID } from '../data/faces';
import { HAND_BY_ID } from '../data/hands';
import { MATERIAL_BY_ID } from '../data/materials';
import { checkCond, condCounts, condText } from '../data/cond';
import { CARD_BY_ID, resolveCard, type CardUse, type ResolvedCard } from '../data/cards';
import { HANDS } from '../data/hands';
import { addBuff, buffFx, playerStr, tickBuffsTurnStart } from './buffs';
import { resolveFor } from './cardfx';
import { snapshotTiers } from './sets';
import { discardHand, drawCards, shuffle } from './deck';
import { fire, getMods, rng, sources, toast, type Ctx } from './ctx';
import { ddaEnemyHpMult } from './dda';
import { effValue, faceOf, forcePip, refreshDerived, rollFaceIdx, rollHandDie, setFace } from './dice';
import { evaluateHand } from './hands';
import {
  addEnemyPoison, addHeat, addJackpot, alive, cbOf, damageEnemy, damagePlayer, gainBlock, gainGold, healPlayer, randomEnemy, resetHeat, targetEnemy,
} from './ops';

// ───────────── 시작 ─────────────
export function makeEnemy(ctx: Ctx, id: string, hpMult: number, patternOffset = 0): Enemy {
  const def = ENEMY_BY_ID[id];
  const hp = Math.max(1, Math.round(def.hp * hpMult));
  const e: Enemy = {
    uid: ctx.run.nextUid++, id, name: def.name, emoji: def.emoji, hp, maxHp: hp, block: 0,
    patternIdx: patternOffset % def.pattern.length, intent: { k: 'attack', label: '', icon: '' },
    poison: 0, weak: 0, nextMult: 1, stacks: 0, charge: 0, phase: 1, splitDone: false, enraged: false, weakPip: 1, str: 0, vuln: 0, frail: 0, immunePip: 0,
  };
  return e;
}

export function startCombat(ctx: Ctx, kind: CombatState['kind'], enemyIds: string[], rewardMult = 1) {
  const run = ctx.run;
  snapshotTiers(run);
  const m = getMods(run);
  const endless = Math.max(0, run.act - 3);
  const hpMult = BALANCE.enemyHpMult * (1 + m.enemyHpPct) * ddaEnemyHpMult(run) * (1 + 0.4 * endless);
  const enemies: Enemy[] = [];
  const seen: Record<string, number> = {};
  for (const id of enemyIds) {
    seen[id] = (seen[id] ?? 0);
    const en = makeEnemy(ctx, id, hpMult, seen[id]);
    en.stacks += 2 * endless; // 엔드리스: 공격력 +2/막
    enemies.push(en);
    seen[id]++;
    run.flags['seen_enemy_' + id] = 1;
  }
  const cb: CombatState = {
    kind, enemies, hand: [], phase: 'roll', turn: 0, rerollsLeft: 0, block: 0, keepBlock: 0, thorns: 0,
    piggy: m.combatPiggy, piggyMult: 1, handChips: 0, pStr: 0, pVuln: 0, pWeak: 0, handResult: null, target: enemies[0].uid, diceUsedThisTurn: 0,
    drawPile: [], cards: [], discard: [], exhausted: [], buffs: [], lastCard: null, cardsPlayed: 0, costFree: [], boosted: [], virtualPips: [], handBoost: 0,
    doubledown: 0, counters: {}, turnCounters: {},
    next: { six: 0, one: 0, rerollPenalty: 0, flip: false, stealDie: false, preview: [], seal: 0, chipTax: 0, pinned: [], setFirst: [], chipMult: 1, previewN: 0, sameFirst: 0 },
    jackpotTurn: false, houseRule: null, queenParity: null, lastSkillDamage: 0, dmgTaken: 0, result: null,
    nextKey: 1, rewardMult, brokenDice: [], log: [],
  };
  run.combat = cb;
  run.screen = 'combat';
  // 덱 전체를 복사해 뽑을 더미로 (deck 스트림 셔플)
  cb.drawPile = shuffle(ctx, run.deck.map((c) => ({ ...c })));
  for (const e of enemies) e.intent = makeIntent(ctx, e);
  fire(ctx, 'onCombatStart');
  startTurn(ctx);
}

// ───────────── 인텐트 ─────────────
function attackValue(ctx: Ctx, e: Enemy, base: number): number {
  const m = getMods(ctx.run);
  const cb = ctx.run.combat;
  let v = (base * BALANCE.enemyAtkMult + e.stacks + e.str) * e.nextMult;
  if (e.enraged) v *= 1.5;
  if (e.phase >= 2 && m.bossPhase2 > 0 && ENEMY_BY_ID[e.id].tier === 'boss') v *= 1.25;
  if (e.frail > 0) v *= BALANCE.frailMult - m.frailExtra; // 적 약화
  if (cb && cb.pVuln > 0) v *= BALANCE.vulnMult; // 내 취약
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
    case 'heal': return { ...spec, icon: '🩺', label: `회복 ${n}` };
    case 'guardAll': return { ...spec, icon: '🛡️', label: `전체 ${n}` };
    case 'seal': return { ...spec, icon: '🔒', label: '주사위 봉인' };
    case 'chipTax': return { ...spec, icon: '🏦', label: `칩 -${n}` };
    case 'enrage': return { ...spec, icon: '💪', label: `힘 +${n}` };
    case 'curseWeak': return { ...spec, icon: '🥀', label: `약화 ${n}` };
    case 'curseVuln': return { ...spec, icon: '💔', label: `취약 ${n}` };
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
  // 요새: 직전 턴에 쌓은 유지 방어는 이번 턴까지만 남는다. 철벽·불멸의 요새면 방어도가 그대로, 방패 2단계면 일부가 넘어온다
  const persist = buffFx(cb).keepBlock > 0;
  const carry = persist ? cb.block : m.blockPersistCap ? Math.min(m.blockPersistCap, cb.block) : Math.floor(cb.block * m.blockCarryPct / 100);
  cb.block = cb.keepBlock + (cb.turn > 1 ? carry : 0);
  cb.keepBlock = 0;
  tickBuffsTurnStart(ctx);
  cb.thorns = 0;
  cb.handResult = null;
  cb.diceUsedThisTurn = 0;
  cb.cardsPlayed = 0;
  cb.costFree = [];
  cb.boosted = [];
  cb.virtualPips = [];
  cb.handBoost = 0;
  cb.doubledown = 0;
  cb.houseRule = null;
  cb.queenParity = null;
  cb.turnCounters = {};
  // 카드 뽑기
  const mini = m.minimalist && run.deck.length <= 12 ? 1 : 0;
  drawCards(ctx, BALANCE.drawPerTurn + m.drawPerTurn + mini + (cb.turn === 1 ? m.firstTurnDraw : 0), 'turn');
  const curseRr = cb.cards.reduce((s2, c) => s2 + (CARD_BY_ID[c.id]?.inHandRerolls ?? 0), 0);
  cb.rerollsLeft = Math.max(0, baseRerolls(ctx) - cb.next.rerollPenalty + curseRr);
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
  if (m.turnBlock) gainBlock(ctx, m.turnBlock);
  if (m.piggyBlockPct && cb.piggy > 0) gainBlock(ctx, cb.piggy * m.piggyBlockPct / 100);
  fire(ctx, 'onTurnStart');
  for (const e of alive(cb)) {
    e.weakPip = rng(ctx, 'combat').int(1, 6);
    if (ENEMY_BY_ID[e.id].immuneRotate) {
      e.immunePip = rng(ctx, 'combat').int(1, 5);
      if (e.immunePip >= e.weakPip) e.immunePip++;
    }
  }
  for (const e of alive(cb)) ENEMY_BY_ID[e.id].onTurnStart?.(ctx, e);
  if (cb.houseRule === 'oneReroll') cb.rerollsLeft = Math.min(cb.rerollsLeft, 1);
  if (cb.result) return;

  // 첫 굴림 (고정 카드로 보관한 주사위는 그 눈 그대로)
  const preview = cb.next.preview;
  const pinned = cb.next.pinned;
  cb.next.pinned = [];
  hand.forEach((hd, i) => {
    const pin = pinned.find((p) => p.dieIdx === hd.dieIdx);
    if (pin) { hd.pip = pin.pip; hd.held = true; hd.locked = true; return; }
    if (i < preview.length) setFace(ctx, hd, preview[i]);
    else rollHandDie(ctx, hd);
  });
  cb.next.preview = [];
  // 밑장 빼기: 첫 굴림 주사위를 원하는 눈으로
  const setFirst = cb.next.setFirst;
  cb.next.setFirst = [];
  hand.filter((h) => !h.held).slice(0, setFirst.length).forEach((hd, i) => forcePip(ctx, hd, setFirst[i]));
  if (cb.next.sameFirst) {
    const free = hand.filter((h) => !h.held);
    if (free.length >= 2) forcePip(ctx, free[1], free[0].pip);
    cb.next.sameFirst = 0;
  }
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
  // 봉인: 무작위 주사위가 이번 턴 사용 불가
  while (cb.next.seal > 0) {
    cb.next.seal--;
    const free = hand.filter((h) => !h.used);
    if (!free.length) break;
    const t = rng(ctx, 'combat').pick(free);
    t.used = true;
    t.gone = true;
    t.locked = true;
    toast(ctx, `🔒 주사위 ${t.pip}이(가) 봉인됐다 (이번 턴)`, 'bad');
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
  if (!hd || hd.used || hd.held) return;
  if (cb.houseRule === 'noLock' && cb.phase === 'roll') return;
  if (MATERIAL_BY_ID[hd.material].noReroll) return;
  if (!hd.locked && cb.phase === 'roll' && lockedCount(cb) >= lockLimit(ctx)) {
    toast(ctx, `🔒 한 번에 ${lockLimit(ctx)}개까지만 잠글 수 있다`, 'bad');
    return;
  }
  hd.locked = !hd.locked;
}

export function lockLimit(ctx: Ctx): number {
  return Math.max(1, BALANCE.lockLimit + getMods(ctx.run).lockLimit);
}

/** 잠금 수 (리롤 안 되는 재질의 자동 잠금은 세지 않는다) */
export function lockedCount(cb: CombatState): number {
  return cb.hand.filter((h) => h.locked && !h.used && !h.held && !MATERIAL_BY_ID[h.material].noReroll).length;
}

/** 지금 쓸 수 있는 족보 칩 (아직 족보 확정 전이면 예상 족보의 칩까지 포함) */
export function chipsAvailable(ctx: Ctx): number {
  const cb = cbOf(ctx);
  if (cb.phase === 'roll' && !cb.turnCounters.confirmed) return cb.handChips + Math.max(0, handChipsFor(ctx, previewHand(ctx).id) - cb.next.chipTax);
  return cb.handChips;
}

export function handChipsFor(ctx: Ctx, id: HandResult['id']): number {
  return HAND_BY_ID[id].chips + getMods(ctx.run).handChips;
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
  const real = cb.hand.filter((h) => !h.gone).map((h) => {
    const f = faceOf(h);
    return { pip: h.pip, wild: !!(f?.wild || MATERIAL_BY_ID[h.material].wild), magnet: !!f?.magnet };
  });
  return [...real, ...(cb.virtualPips ?? []).map((pip) => ({ pip }))];
}

export function previewHand(ctx: Ctx): HandResult {
  const cb = cbOf(ctx);
  const m = getMods(ctx.run);
  let id = evaluateHand(handInputs(cb), { smallLadder: m.smallLadder > 0 });
  if (id === 'none' && m.noneAsPair) id = 'pair';
  if (id === 'four' && m.fourIsYahtzee) id = 'yahtzee';
  // 가짜 야찌: 족보 단계 +N
  if (cb.handBoost) id = HANDS[Math.min(HANDS.length - 1, HAND_BY_ID[id].rank + cb.handBoost)].id;
  return scoreHand(ctx, id);
}

export function scoreHand(ctx: Ctx, id: HandResult['id']): HandResult {
  const cb = cbOf(ctx);
  const m = getMods(ctx.run);
  const def = HAND_BY_ID[id];
  let mult = def.mult + (m.handAdd[id] ?? 0) + (id !== 'none' ? m.handAll : 0);
  if (m.straightFlush && (id === 'small' || id === 'large')) {
    const p = cb.hand.filter((h) => !h.gone).map((h) => h.pip);
    if (p.length >= 5 && (p.every((x) => x % 2 === 1) || p.every((x) => x % 2 === 0))) mult *= HAND_BY_ID.flush.mult + (m.handAdd.flush ?? 0);
  }
  if (id !== 'none') {
    for (const h of cb.hand) {
      const f = faceOf(h);
      if (f?.handMultAdd && !h.gone) mult += f.handMultAdd;
    }
  }
  return { id, name: def.name, mult: Math.round(mult * 100) / 100, heat: def.heat, jackpot: def.jackpot };
}

/**
 * 족보가 확정된 뒤 주사위 눈이 바뀌면(올리기·뒤집기·분할·운명 조작·손가락 튕기기 등) 족보를 다시 판정한다.
 * 화면의 주사위와 족보가 항상 일치하게. 더 좋은 족보가 되면 늘어난 만큼 열기·잭팟·족보 칩을 더 준다.
 */
export function rescoreHand(ctx: Ctx) {
  const cb = cbOf(ctx);
  if (!cb.turnCounters.confirmed || !cb.handResult || cb.result) return;
  const old = cb.handResult;
  const now = previewHand(ctx);
  if (now.id === old.id && now.mult === old.mult) return;
  cb.handResult = now;
  const oldDef = HAND_BY_ID[old.id];
  const newDef = HAND_BY_ID[now.id];
  if (newDef.rank > oldDef.rank) {
    const heatGain = Math.max(0, newDef.heat) - Math.max(0, oldDef.heat);
    if (heatGain > 0) addHeat(ctx, heatGain);
    if (newDef.jackpot > oldDef.jackpot) addJackpot(ctx, newDef.jackpot - oldDef.jackpot);
    const chipGain = newDef.chips - oldDef.chips;
    if (chipGain > 0) cb.handChips += chipGain;
    if (newDef.celebrate && !oldDef.celebrate) {
      ctx.run.stats.yahtzees++;
      cb.turnCounters.yahtzee = 1;
      ctx.emit({ t: 'yahtzee' });
    }
    fire(ctx, 'onHandScored', { hand: now });
    handDraw(ctx);
  }
  ctx.run.flags['seen_hand_' + now.id] = 1;
  ctx.emit({ t: 'hand', hand: now });
  refreshIntents(ctx);
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
  let gain = Math.max(0, handChipsFor(ctx, hand.id) - cb.next.chipTax);
  if (cb.next.chipMult === 2) gain *= 2;
  else if (cb.next.chipMult < 0) gain = Math.max(0, gain + cb.next.chipMult);
  cb.next.chipMult = 1;
  cb.handChips += gain;
  if (cb.next.chipTax) toast(ctx, `🏦 족보 칩 -${cb.next.chipTax} (은행원)`, 'bad');
  cb.next.chipTax = 0;
  run.flags.ach_max_chips = Math.max(run.flags.ach_max_chips ?? 0, cb.handChips);
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
  // 족보 드로우: 투 페어 이상이면 1장 (턴당 1회)
  handDraw(ctx);
  refreshIntents(ctx);
}

/** 이번 턴 족보 드로우를 받을 수 있는가 (손패 바 미리보기용) */
export function handDrawPending(ctx: Ctx, id: HandResult['id']): boolean {
  const cb = cbOf(ctx);
  return !cb.turnCounters.handDraw && HAND_BY_ID[id].rank >= (getMods(ctx.run).handDrawMin ? 1 : 2);
}

/** 족보가 투 페어(완화 시 원 페어) 이상이면 카드 1장 (턴당 1회) */
function handDraw(ctx: Ctx) {
  const cb = cbOf(ctx);
  if (cb.turnCounters.handDraw || !cb.handResult) return;
  const min = getMods(ctx.run).handDrawMin ? 1 : 2;
  if (HAND_BY_ID[cb.handResult.id].rank >= min) {
    cb.turnCounters.handDraw = 1;
    if (drawCards(ctx, 1, 'hand').length) toast(ctx, `🃏 ${HAND_BY_ID[cb.handResult.id].name} 보너스: 카드 +1`, 'good');
  }
}

// ───────────── 카드 사용 ─────────────
export function freeDice(cb: CombatState): HandDie[] {
  return cb.hand.filter((h) => !h.used);
}

/** 이번 턴 족보 단계 (확정 전이면 예상 족보) */
export function handRankNow(ctx: Ctx): number {
  const cb = cbOf(ctx);
  const h = cb.handResult ?? previewHand(ctx);
  return HAND_BY_ID[h.id].rank;
}

/** 도박 카드 성공 확률 보정 (%p) */
export function gambleOddsBonus(ctx: Ctx): number {
  return getMods(ctx.run).gambleOdds + buffFx(ctx.run.combat).gambleOdds;
}

/** 이 카드의 지금 비용 */
export function cardCost(ctx: Ctx, inst: CardInst): number {
  const cb = cbOf(ctx);
  const rc = resolveFor(ctx.run, inst);
  const m = getMods(ctx.run);
  if (rc.unplayable) return rc.cost;
  if (cb.costFree.includes(inst.uid) || cb.turnCounters.allFree || (cb.turnCounters.nextFree ?? 0) > 0) return 0;
  if (rc.tag && buffFx(cb).freeTags.includes(rc.tag)) return 0;
  if (m.freeRet && rc.retDie) return 0;
  if (m.freeFromNth && cb.cardsPlayed + 1 >= m.freeFromNth) return 0;
  let c = rc.cost;
  if ((cb.turnCounters.discount ?? 0) > 0) c -= 1;
  if (m.rhythm && cb.cardsPlayed === 2) c -= m.rhythm;
  return Math.max(0, c);
}

/** 카드를 쓸 수 있는 상태인가 (주사위 조건 제외) */
export function cardUsable(ctx: Ctx, idx: number): boolean {
  const cb = cbOf(ctx);
  const inst = cb.cards[idx];
  if (!inst || cb.phase === 'over') return false;
  const rc = resolveFor(ctx.run, inst);
  if (rc.unplayable) return false;
  if (rc.perTurn && (cb.turnCounters['cd_' + rc.id] ?? 0) >= rc.perTurn) return false;
  if (rc.perCombat && (cb.counters['cd_' + rc.id] ?? 0) >= rc.perCombat) return false;
  if (cardCost(ctx, inst) > chipsAvailable(ctx)) return false;
  if (rc.rollOnly && (cb.phase !== 'roll' || cb.turnCounters.confirmed)) return false;
  if (rc.needHand && handRankNow(ctx) < HAND_BY_ID[rc.needHand].rank) return false;
  if (rc.needGold && ctx.run.gold < (rc.n[rc.needGold] ?? 0)) return false;
  if (rc.echo && !cb.lastCard) return false;
  return true;
}

/** 쓸 수 없는 이유 (UI 안내용) */
export function cardBlockReason(ctx: Ctx, idx: number): string {
  const cb = cbOf(ctx);
  const inst = cb.cards[idx];
  if (!inst) return '';
  const rc = resolveFor(ctx.run, inst);
  if (rc.unplayable) return '사용할 수 없는 저주 카드';
  if (rc.perTurn && (cb.turnCounters['cd_' + rc.id] ?? 0) >= rc.perTurn) return '이번 턴에는 더 쓸 수 없다';
  if (rc.perCombat && (cb.counters['cd_' + rc.id] ?? 0) >= rc.perCombat) return '이번 전투에서는 더 쓸 수 없다';
  const cost = cardCost(ctx, inst);
  if (cost > chipsAvailable(ctx)) return `🔶 족보 칩이 부족하다 (필요 ${cost}, 보유 ${chipsAvailable(ctx)})`;
  if (rc.rollOnly && (cb.phase !== 'roll' || cb.turnCounters.confirmed)) return '리롤 단계(족보 확정 전)에만 쓸 수 있다';
  if (rc.needHand && handRankNow(ctx) < HAND_BY_ID[rc.needHand].rank) return `족보가 ${HAND_BY_ID[rc.needHand].name} 이상이어야 한다`;
  if (rc.needGold && ctx.run.gold < (rc.n[rc.needGold] ?? 0)) return `골드가 ${rc.n[rc.needGold]} 필요하다`;
  if (rc.echo && !cb.lastCard) return '따라 할 카드가 없다';
  return `이 카드는 ${condText(rc.cond)} 주사위가 필요하다`;
}

export function canPlay(ctx: Ctx, idx: number, keys: number[]): boolean {
  const cb = ctx.run.combat;
  if (!cb || cb.phase === 'over' || !cardUsable(ctx, idx)) return false;
  const rc = resolveFor(ctx.run, cb.cards[idx]);
  const dice = keys.map((k) => cb.hand.find((h) => h.key === k)).filter((h): h is HandDie => !!h && !h.used);
  if (dice.length !== keys.length) return false;
  if (cb.houseRule === 'noSix' && dice.some((d) => d.pip === 6)) return false;
  return checkCond(rc.cond, dice.map((d) => d.pip), freeDice(cb).length);
}

/** 조건을 만족하는 주사위 조합을 자동으로 찾는다 (선택 보조/봇용) */
export function autoPick(ctx: Ctx, idx: number, prefer: number[] = []): number[] | null {
  const cb = cbOf(ctx);
  const inst = cb.cards[idx];
  if (!inst) return null;
  const rc = resolveFor(ctx.run, inst);
  if (rc.cond.k === 'instant') return canPlay(ctx, idx, []) ? [] : null;
  const free = freeDice(cb);
  const ordered = [...free].sort((a, b) => (prefer.includes(b.key) ? 1 : 0) - (prefer.includes(a.key) ? 1 : 0) || b.pip - a.pip);
  for (const n of condCounts(rc.cond, free.length)) {
    if (n > free.length || n === 0) continue;
    const res: number[] = [];
    let found: number[] | null = null;
    let tries = 0;
    const rec = (start: number) => {
      if (found || tries > 400) return;
      if (res.length === n) {
        tries++;
        if (canPlay(ctx, idx, res)) found = [...res];
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
    if (found) return found;
  }
  return null;
}

export type CardChoice = CardUse['choice'];

/** 카드 사용. idx = 손패 위치 */
export function playCard(ctx: Ctx, idx: number, keys: number[], choice?: CardChoice): boolean {
  const run = ctx.run;
  const cb = cbOf(ctx);
  if (!canPlay(ctx, idx, keys)) return false;
  const inst = cb.cards[idx];
  const rc = resolveFor(ctx.run, inst);
  if (cb.phase === 'roll' && !rc.rollOnly) confirmHand(ctx);
  if (cb.result) return true;
  const cost = cardCost(ctx, inst);
  const m = getMods(run);
  const dice = keys.map((k) => cb.hand.find((h) => h.key === k)!);
  for (const d of dice) d.used = true;
  cb.handChips = Math.max(0, cb.handChips - cost);
  if (cost < rc.cost && (cb.turnCounters.discount ?? 0) > 0 && !cb.costFree.includes(inst.uid)) cb.turnCounters.discount--;
  if ((cb.turnCounters.nextFree ?? 0) > 0) cb.turnCounters.nextFree--;
  cb.diceUsedThisTurn += dice.length;
  if (rc.perTurn) cb.turnCounters['cd_' + rc.id] = (cb.turnCounters['cd_' + rc.id] ?? 0) + 1;
  if (rc.perCombat) cb.counters['cd_' + rc.id] = (cb.counters['cd_' + rc.id] ?? 0) + 1;
  // 손패에서 먼저 뺀다 (효과로 뽑는 카드와 섞이지 않게)
  const hi = cb.cards.indexOf(inst);
  if (hi >= 0) cb.cards.splice(hi, 1);

  // 메아리: 직전 카드를 이 눈으로
  let runInst: CardInst = inst;
  let runCard = rc;
  let power = 1;
  if (rc.echo) {
    const last = cb.lastCard;
    if (!last || resolveFor(run, last).noEcho) {
      toast(ctx, '메아리: 따라 할 카드가 없다', 'bad');
      finishPlay(ctx, inst, rc, 0, dice, cost);
      return true;
    }
    runInst = last;
    runCard = resolveFor(run, last);
    if (rc.n.bo) power *= 1.5;
    power *= runCard.n.echoMult ?? 1;
  }

  for (const d of dice) {
    const f = faceOf(d);
    if (f?.powerMult) {
      power *= f.powerMult;
      if (f.jackpotOnUse) addJackpot(ctx, f.jackpotOnUse);
    }
  }
  const crit = dice.some((d) => faceOf(d)?.powerMult);
  if (cb.doubledown && !rc.primesDouble) {
    power *= 2;
    cb.doubledown = 0;
  }
  if (cb.boosted.includes(inst.uid)) power *= 1.5;
  if (m.collector && run.deck.length >= 25) power *= 1.25;
  if (m.minimalist && run.deck.length <= 12 && cost === 0) power *= 2;

  const vals = dice.map((d) => effValue(ctx, d));
  const pips = dice.map((d) => d.pip);
  const primaryPip = pips.length ? Math.max(...pips) : undefined;
  let dealtTotal = 0;
  const handMult = cb.handResult?.mult ?? 1;
  const heatMult = 1 + run.heat * (BALANCE.heatDmgPerStep + m.heatDmgExtra);
  const extraMult = sources(run).reduce((acc, s) => acc * (s.dmgMult?.(ctx) ?? 1), 1);
  const steelBonus = dice.reduce((s, d) => s + (MATERIAL_BY_ID[d.material].blockBonus ?? 0), 0);
  const fx = buffFx(cb);
  const isAtk = runCard.role === 'atk';
  // 응수: 모아 둔 보너스는 다음 공격 카드가 가져간다
  const ripBonus = isAtk ? (cb.counters.ripBonus ?? 0) : 0;
  if (ripBonus) cb.counters.ripBonus = 0;
  let ripUsed = false;

  const u: CardUse = {
    ctx, inst: runInst, n: runCard.n, dice, vals, pips, v: vals[0] ?? 0, sum: vals.reduce((a, b) => a + b, 0), power, ret: null, choice,
    dmg: (base, opts = {}) => {
      const weakM = cb.pWeak > 0 ? BALANCE.frailMult : 1;
      const str = playerStr(cb) * ((opts.strMult ?? 1) + m.strMult);
      const flatAdd = isAtk ? m.atkFlat + (ripUsed ? 0 : ripBonus) : 0;
      ripUsed = true;
      const pct = isAtk ? 1 + (fx.atkPct + (runInst.up ? m.upAtkPct : 0) + (cb.turnCounters.firstAtk ? 0 : m.firstAtkPct)) / 100 : 1;
      const amount = opts.flat ? base * power : (base + str + flatAdd) * handMult * heatMult * power * extraMult * weakM * pct;
      const hits = opts.hits ?? 1;
      let total = 0;
      for (let i = 0; i < hits; i++) {
        const targets = opts.target ? [opts.target].filter((e) => e.hp > 0)
          : opts.aoe ? alive(cb) : opts.random ? [randomEnemy(ctx)].filter((e): e is Enemy => !!e) : [targetEnemy(cb)].filter((e): e is Enemy => !!e);
        for (const t of targets) total += damageEnemy(ctx, t, amount, { pip: primaryPip, crit, source: runCard.name });
      }
      dealtTotal += total;
      return total;
    },
    block: (base, opts = {}) => {
      let b = opts.flat ? base * power : base * handMult * power + steelBonus + (runCard.role === 'def' ? m.blockFlat : 0);
      if (runCard.role === 'def' && runInst.up && m.upBlockPct) b *= 1 + m.upBlockPct / 100;
      if (cb.houseRule === 'halfBlock') b /= 2;
      if (opts.keep) { const a = Math.max(0, Math.round(b)); cb.keepBlock += a; ctx.emit({ t: 'block', amount: a }); fire(ctx, 'onBlockGain', { amount: a }); }
      else gainBlock(ctx, b);
    },
    gold: (base, opts = {}) => gainGold(ctx, opts.flat ? base : base * handMult * power),
    heal: (base) => healPlayer(ctx, base * power),
    piggy: (base, opts = {}) => { cb.piggy += Math.round(opts.flat ? base : base * handMult * power); },
    pay: (g) => { if (run.gold < g) return false; if (g) gainGold(ctx, -g); return true; },
    draw: (k) => (k > 0 ? drawCards(ctx, k) : []),
    tgt: () => targetEnemy(cb),
    foes: () => alive(cb),
    poison: (e, k) => {
      const amt = Math.max(0, Math.round(k * power)) + (k > 0 ? m.poisonAdd : 0);
      for (const t of e === 'all' ? alive(cb) : [e]) if (t.hp > 0) addEnemyPoison(t, amt);
    },
    frail: (e, t) => { for (const x of e === 'all' ? alive(cb) : [e]) if (x.hp > 0) x.frail += t + m.debuffTurns; },
    vuln: (e, t) => { for (const x of e === 'all' ? alive(cb) : [e]) if (x.hp > 0) x.vuln += t + m.debuffTurns; },
    buff: (id, turns, value, owner = 'player') => addBuff(cb, { id, turns, value, owner: owner === 'player' ? 'player' : owner.uid, src: runCard.name }),
    gamble: (p, label) => {
      const pp = Math.max(0, Math.min(100, p + gambleOddsBonus(ctx)));
      const r = rng(ctx, 'combat');
      const forced = m.fallacy > 0 && (run.flags.gambleFails ?? 0) >= 3;
      const win = forced || r.next() * 100 < pp;
      run.flags.gambleFails = win ? 0 : (run.flags.gambleFails ?? 0) + 1;
      if (forced) toast(ctx, '🔮 도박꾼의 오류: 이번엔 확정 성공!', 'gold');
      run.stats.gambles++;
      ctx.emit({ t: 'chanceRoll', kind: 'die', result: win ? 6 : r.int(1, 5), win, label: `${Math.round(pp)}% · ${label}` });
      fire(ctx, 'onGambleCard', { win });
      fire(ctx, 'onGambleResult', { win, gamble: 'card' });
      if (!win) { if (m.gambleFailJackpot) addJackpot(ctx, m.gambleFailJackpot); return m.gambleFailHalf ? 0.5 : 0; }
      let mult = 1 + m.gambleWinMult;
      if ((cb.turnCounters.anteup ?? 0) > 0) { mult *= 2; cb.turnCounters.anteup--; }
      const wd = fx.gambleWinDraw + m.gambleWinDraw;
      if (wd) drawCards(ctx, wd);
      if (fx.gambleWinChips) cb.handChips += fx.gambleWinChips;
      return mult;
    },
    jackpot: (pct) => addJackpot(ctx, pct),
    handRank: () => handRankNow(ctx),
    rand: (lo, hi) => rng(ctx, 'combat').int(lo, hi),
    str: () => playerStr(cb),
    persist: () => buffFx(cb).keepBlock > 0,
  };

  // 운명 조작: 다른 주사위 눈 변경
  if (runCard.choose === 'otherDie' && choice?.key !== undefined && choice.value !== undefined) {
    const t = cb.hand.find((h) => h.key === choice.key && !h.used);
    if (t) {
      forcePip(ctx, t, Math.max(1, Math.min(6, choice.value)));
      if (runCard.n.two) {
        const o = cb.hand.filter((h) => !h.used && h !== t && !dice.includes(h)).sort((a, b) => a.pip - b.pip)[0];
        if (o) forcePip(ctx, o, Math.max(1, Math.min(6, choice.value)));
      }
      ctx.emit({ t: 'roll', keys: [t.key] });
    }
  }

  const times = isAtk && m.firstAtkTwice && !cb.turnCounters.firstAtk ? 2 : 1;
  for (let i = 0; i < times && !cb.result; i++) runCard.run(u);
  if (isAtk && !cb.turnCounters.firstAtk) {
    cb.turnCounters.firstAtk = 1;
    if (m.firstAtkDraw) drawCards(ctx, m.firstAtkDraw);
  }

  // 면 사용 효과
  for (const d of dice) faceOf(d)?.onUse?.({ ctx, hd: d, power: { mult: 1 } });

  // 주사위를 소모하지 않는 카드 (운명 조작 등)
  if (runCard.keepDie || rc.keepDie) {
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
      if (i === 0) cb.hand[cb.hand.indexOf(src)] = nd;
      else cb.hand.push(nd);
    });
    cb.diceUsedThisTurn -= 1;
    refreshDerived(cb);
    ctx.emit({ t: 'roll', keys: cb.hand.filter((h) => !h.used).map((h) => h.key) });
  }
  if ((runCard.retDie || u.ret) && m.retDraw && (cb.turnCounters.retDraw ?? 0) < 2) {
    cb.turnCounters.retDraw = (cb.turnCounters.retDraw ?? 0) + 1;
    drawCards(ctx, m.retDraw);
  }
  // 패 섞기: 남은 주사위 다시 굴림
  if (cb.turnCounters.repack) {
    const low = cb.turnCounters.repack === 2;
    cb.turnCounters.repack = 0;
    const targets = cb.hand.filter((h) => !h.used && !h.gone && (!low || h.pip <= 3));
    for (const hd of targets) rollHandDie(ctx, hd);
    postRoll(ctx, targets);
    refreshDerived(cb);
    ctx.emit({ t: 'roll', keys: targets.map((h) => h.key) });
  }
  if (isAtk) cb.turnCounters.atkPlayed = (cb.turnCounters.atkPlayed ?? 0) + 1;
  finishPlay(ctx, inst, rc, dealtTotal, dice, cost);
  return true;
}

function finishPlay(ctx: Ctx, inst: CardInst, rc: ResolvedCard, dealt: number, dice: HandDie[], cost = rc.cost) {
  const cb = cbOf(ctx);
  const m = getMods(ctx.run);
  if (!inst.temp) (rc.exhaust ? cb.exhausted : cb.discard).push(inst);
  cb.cardsPlayed++;
  if (m.drawOnNth && cb.cardsPlayed === m.drawOnNth) drawCards(ctx, 1);
  rescoreHand(ctx);
  cb.lastSkillDamage = dealt || cb.lastSkillDamage;
  if (!rc.echo) cb.lastCard = inst;
  // 천 개의 칼날: 카드를 쓸 때마다
  const cuts = buffFx(cb).cardPlayDmg;
  if (cuts && !cb.result) {
    const t = randomEnemy(ctx);
    if (t) damageEnemy(ctx, t, cuts + playerStr(cb), { source: '천 개의 칼날' });
    if (m.cutsStr && (cb.counters.cutsStr ?? 0) < 5) {
      cb.counters.cutsStr = (cb.counters.cutsStr ?? 0) + 1;
      addBuff(cb, { id: 'str', owner: 'player', turns: 1, value: m.cutsStr, src: '검의 비' });
    }
  }
  fire(ctx, 'onCardPlay', { card: inst, amount: cost });
  fire(ctx, 'onSkill');
  fire(ctx, 'onPlace');
  void dice;
  refreshIntents(ctx);
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
  if (cb.phase === 'place') rescoreHand(ctx);
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
  if (cb.phase === 'place') rescoreHand(ctx);
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
  cb.handChips = Math.min(BALANCE.chipCarryMax, cb.handChips);
  if (cb.pWeak > 0) cb.pWeak--;
  if (cb.pVuln > 0) cb.pVuln--;
  // 저주 카드: 턴 끝에 손에 있으면
  for (const c of cb.cards) CARD_BY_ID[c.id]?.inHandEnd?.(ctx);
  discardHand(cb);
  if (cb.doubledown > 0) {
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
  const nPrev = Math.max(m.preview, cb.next.previewN);
  cb.next.previewN = 0;
  if (nPrev > 0) {
    const idxs = run.dice.map((_, i) => i).filter((i) => !cb.brokenDice.includes(i)).slice(0, nPrev);
    cb.next.preview = idxs.map((di) => {
      const tmp: HandDie = { key: -1, dieIdx: di, temp: false, face: 0, pip: 1, material: run.dice[di].material, locked: false, used: false, rolledFx: false, golden: false, gone: false };
      return rollFaceIdx(ctx, tmp);
    });
  }

  enemyTurn(ctx);
  if (cb.result) return;
  startTurn(ctx);
}

/** 다음 턴 첫 굴림 미리보기 (주사위 순서대로) */
export function previewPips(ctx: Ctx): number[] {
  const cb = ctx.run.combat;
  if (!cb || !cb.next.preview.length) return [];
  const idxs = ctx.run.dice.map((_, i) => i).filter((i) => !cb.brokenDice.includes(i));
  return cb.next.preview.map((fi, k) => {
    const die = ctx.run.dice[idxs[k]];
    const f = die?.faces[fi];
    if (!f) return 0;
    return f.sticker && FACE_BY_ID[f.sticker].pip !== undefined ? FACE_BY_ID[f.sticker].pip! : f.pip;
  });
}

function enemyAttack(ctx: Ctx, e: Enemy, amount: number, hits = 1) {
  const cb = cbOf(ctx);
  const m = getMods(ctx.run);
  for (let i = 0; i < hits; i++) {
    if (cb.result) return;
    const blk0 = cb.block + cb.keepBlock;
    damagePlayer(ctx, amount, e.name);
    const fx = buffFx(cb);
    const rm = 1 + m.reflectMult;
    const reflect = cb.thorns + m.reflect + fx.reflect;
    if (reflect > 0 && e.hp > 0) damageEnemy(ctx, e, (reflect + m.reflectAdd) * rm, { source: '반사' });
    if (fx.counter > 0 && e.hp > 0) damageEnemy(ctx, e, (fx.counter + m.reflectAdd) * rm, { source: '반격' });
    if (m.spikes && cb.block + cb.keepBlock < blk0 && e.hp > 0) damageEnemy(ctx, e, m.spikes, { source: '가시 갑주' });
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
      poisonTick(ctx, e);
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
      case 'block': e.block += n; ctx.emit({ t: 'eBlock', uid: e.uid, amount: n }); break;
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
      case 'heal': {
        const t = alive(cb).filter((x) => x.hp < x.maxHp).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
        if (t) { const h = Math.min(n, t.maxHp - t.hp); t.hp += h; toast(ctx, `🩺 ${t.name} 체력 +${h}`, 'bad'); ctx.emit({ t: 'enemyAct', uid: t.uid }); }
        break;
      }
      case 'guardAll': for (const x of alive(cb)) { x.block += n; ctx.emit({ t: 'eBlock', uid: x.uid, amount: n }); } break;
      case 'seal': cb.next.seal += n || 1; break;
      case 'chipTax': cb.next.chipTax += n; cb.handChips = Math.max(0, cb.handChips - n); break;
      case 'enrage': e.str += n; toast(ctx, `💪 ${e.name}의 힘 +${n}`, 'bad'); break;
      case 'curseWeak': cb.pWeak += n; toast(ctx, `🥀 약화 ${n}턴: 내가 주는 피해 -25%`, 'bad'); break;
      case 'curseVuln': cb.pVuln += n; toast(ctx, `💔 취약 ${n}턴: 내가 받는 피해 +50%`, 'bad'); break;
      case 'houseCopy': enemyAttack(ctx, e, attackValue(ctx, e, Math.round(n * (cb.handResult?.mult ?? 1)))); break;
      default: break;
    }
    if (it.k !== 'charge') e.charge = 0;
    if (e.vuln > 0) e.vuln--;
    if (e.frail > 0) e.frail--;
    const def = ENEMY_BY_ID[e.id];
    e.patternIdx = (e.patternIdx + 1) % def.pattern.length;
    e.intent = makeIntent(ctx, e);
  }
}

/** 독 피해: 죽음의 표식 배율, 역병(모두에게/일부 전염), 감소 속도 */
function poisonTick(ctx: Ctx, e: Enemy) {
  const cb = cbOf(ctx);
  const m = getMods(ctx.run);
  const amt = Math.round(e.poison * (1 + buffFx(cb, e.uid).poisonMult));
  const others = alive(cb).filter((x) => x !== e);
  damageEnemy(ctx, e, amt, { source: '독' });
  if (m.poisonAll) for (const x of others) damageEnemy(ctx, x, amt, { source: '독' });
  else if (m.poisonSplash && others.length) {
    const t = rng(ctx, 'combat').pick(others);
    damageEnemy(ctx, t, Math.round(amt * m.poisonSplash / 100), { source: '독' });
  }
  fire(ctx, 'onPoisonTick', { enemy: e, amount: amt });
  // 저주 1단계: 독이 2턴에 1씩만 줄어든다
  const slow = m.poisonSlow > 0;
  if (!slow || (cb.turn % 2 === 0)) e.poison = Math.max(0, e.poison - 1);
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

export interface EnemyHit {
  uid: number;
  hpLoss: number; // 실제로 깎이는 체력
  blockLoss: number; // 방어도에 막히는 양
  poisonGain: number; // 새로 쌓이는 독
  poisonNext: number; // 사용 후 적의 다음 턴에 독으로 깎일 체력
  kill: boolean;
}

export interface CardPreview {
  keys: number[] | null;
  dmg: number; // 실제로 깎이는 체력 합 (방어도에 막힌 부분 제외)
  blocked: number;
  block: number;
  blockDmg: number; // 방어도를 얻어서 생긴 피해 (방패 3단계 등)
  heal: number;
  gold: number;
  piggy: number;
  draw: number;
  chance: boolean;
  hits: EnemyHit[];
}

/**
 * 카드를 실제 규칙으로 복제 상태에서 미리 실행해 예상 효과를 구한다 (실제 상태·RNG는 건드리지 않음).
 * 족보·열기·약점·힘·약화·취약·적 특수 능력·방어도·유물·버프가 모두 반영된다.
 */
export function previewCard(ctx: Ctx, idx: number, prefer: number[], targetUid: number | null = null): CardPreview {
  const empty: CardPreview = { keys: null, dmg: 0, blocked: 0, block: 0, blockDmg: 0, heal: 0, gold: 0, piggy: 0, draw: 0, chance: false, hits: [] };
  const cb = ctx.run.combat;
  if (!cb || cb.phase === 'over' || !cb.cards[idx] || !cardUsable(ctx, idx)) return empty;
  const keys = canPlay(ctx, idx, prefer) ? prefer : autoPick(ctx, idx, prefer);
  if (!keys) return empty;
  const rc = resolveFor(ctx.run, cb.cards[idx]);
  if (rc.choose) return { ...empty, keys };
  const run2 = structuredClone(ctx.run);
  const c2: Ctx = { run: run2, emit: () => {} };
  const cb2 = run2.combat!;
  if (targetUid !== null && cb2.enemies.some((e) => e.uid === targetUid && e.hp > 0)) cb2.target = targetUid;
  if (cb2.phase === 'roll' && !rc.rollOnly) confirmHand(c2);
  if (cb2.result) return { ...empty, keys };
  const i2 = cb2.cards.findIndex((c) => c.uid === cb.cards[idx].uid);
  if (i2 < 0) return { ...empty, keys };
  const before = new Map(cb2.enemies.map((e) => [e.uid, { hp: e.hp, block: e.block, poison: e.poison }]));
  const b0 = cb2.block + cb2.keepBlock;
  const h0 = run2.hp;
  const g0 = run2.gold;
  const p0 = cb2.piggy;
  const n0 = cb2.cards.length;
  cb2.turnCounters.pvBlockDmg = 0;
  playCard(c2, i2, keys);
  const hits: EnemyHit[] = [];
  for (const e of cb2.enemies) {
    const o = before.get(e.uid);
    if (!o) continue; // 분열로 새로 생긴 적
    const hpLoss = Math.max(0, o.hp - e.hp);
    const blockLoss = Math.max(0, o.block - e.block);
    const poisonGain = e.hp > 0 ? Math.max(0, e.poison - o.poison) : 0;
    if (hpLoss || blockLoss || poisonGain) hits.push({ uid: e.uid, hpLoss, blockLoss, poisonGain, poisonNext: e.hp > 0 ? Math.min(e.poison, e.hp) : 0, kill: o.hp > 0 && e.hp <= 0 });
  }
  return {
    keys,
    dmg: hits.reduce((s2, h) => s2 + h.hpLoss, 0),
    blocked: hits.reduce((s2, h) => s2 + h.blockLoss, 0),
    block: Math.max(0, cb2.block + cb2.keepBlock - b0),
    blockDmg: cb2.turnCounters.pvBlockDmg ?? 0,
    heal: Math.max(0, run2.hp - h0),
    gold: Math.max(0, run2.gold - g0),
    piggy: Math.max(0, cb2.piggy - p0),
    draw: Math.max(0, cb2.cards.length - (n0 - 1)),
    chance: !!rc.chance,
    hits,
  };
}

/** 이번 턴에 더 할 수 있는 행동이 있는가 */
export function hasMoves(ctx: Ctx): boolean {
  const cb = ctx.run.combat;
  if (!cb || cb.phase === 'over') return false;
  if (cb.phase === 'roll' && canReroll(ctx)) return true;
  return cb.cards.some((_, i) => cardUsable(ctx, i) && !!autoPick(ctx, i));
}
