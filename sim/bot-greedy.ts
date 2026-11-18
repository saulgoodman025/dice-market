import type { Ctx } from '../src/rules/ctx';
import { endTurn, freeDice, lockLimit, previewSkill, reroll, skillUsable, toggleLock, useSkill } from '../src/rules/combat';
import { RARITIES, type HandDie, type RewardOption } from '../src/core/state';
import { SKILL_BY_ID, type Cond } from '../src/data/skills';
import { FACE_BY_ID } from '../src/data/faces';
import { CONSUMABLE_BY_ID } from '../src/data/consumables';
import { HAND_BY_ID } from '../src/data/hands';
import { evalFixed } from '../src/rules/hands';
import {
  advance, applyFace, applyMaterial, collectRewardGold, currentOptions, enterNode, eventChoose, leaveCasino, leaveReward,
  leaveShop, offerFaces, pickOffer, pickReward, replaceSkill, restHeal, restUpgrade, shopBuy, upgradeSkill, useConsumableOutside,
} from '../src/rules/run';
import { donEV, doubleOrNothing, haggle, haggleOdds, slotOdds, slotSpin } from '../src/rules/casino';
import { itemRarity } from '../src/rules/economy';
import { EVENT_BY_ID } from '../src/data/events';
import { alive } from '../src/rules/ops';
import type { Bot, BotRng } from './driver';

const rIdx = (o: RewardOption) => RARITIES.indexOf(itemRarity(o));

// ── 잠금/리롤: 몬테카를로로 족보 기대값이 가장 높은 잠금 선택 ──
function keepCandidates(h: HandDie[]): HandDie[][] {
  const out: HandDie[][] = [[...h]];
  const byVal = new Map<number, HandDie[]>();
  for (const d of h) byVal.set(d.pip, [...(byVal.get(d.pip) ?? []), d]);
  const groups = [...byVal.values()].sort((a, b) => b.length - a.length || b[0].pip - a[0].pip);
  if (groups[0]) out.push(groups[0]);
  if (groups[0] && groups[1] && groups[1].length >= 2) out.push([...groups[0], ...groups[1]]);
  // 최장 연속 (값마다 1개)
  const vals = [...byVal.keys()].filter((v) => v >= 1 && v <= 6).sort((a, b) => a - b);
  let best: number[] = [];
  let cur: number[] = [];
  for (const v of vals) { if (cur.length && v === cur[cur.length - 1] + 1) cur.push(v); else cur = [v]; if (cur.length > best.length) best = [...cur]; }
  if (best.length >= 3) out.push(best.map((v) => byVal.get(v)![0]));
  out.push(h.filter((d) => d.pip >= 5));
  out.push([]);
  return out;
}

function expectedScore(kept: HandDie[], total: number, r: BotRng, rerolls: number): number {
  const N = 24;
  let s = 0;
  for (let i = 0; i < N; i++) {
    const vals = kept.map((d) => d.pip);
    for (let k = kept.length; k < total; k++) vals.push(r.int(1, 6));
    // 리롤이 더 남았으면 한 번 더 가장 많은 눈 유지 후 굴림 (근사)
    if (rerolls > 1) {
      const c = new Map<number, number>();
      for (const v of vals) c.set(v, (c.get(v) ?? 0) + 1);
      const top = [...c.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0];
      if (top[1] < 4) for (let k = 0; k < vals.length; k++) if (vals[k] !== top[0] && !(k < kept.length)) vals[k] = r.int(1, 6);
    }
    const hand = evalFixed(vals);
    const sum = vals.slice().sort((a, b) => b - a).slice(0, 4).reduce((a, b) => a + b, 0);
    s += HAND_BY_ID[hand].mult * (sum + 6);
  }
  return s / N;
}

function rollPhase(ctx: Ctx, r: BotRng) {
  const cb = ctx.run.combat!;
  while (cb.rerollsLeft > 0 && !cb.result) {
    const free = cb.hand.filter((h) => !h.used);
    const fixedLocked = free.filter((h) => h.locked);
    const cands = keepCandidates(free);
    const noRerollScore = expectedScore(free, free.length, r, 0);
    let bestKeep: HandDie[] | null = null;
    let bestScore = noRerollScore * 1.03;
    const limit = lockLimit(ctx);
    for (const k0 of cands) {
      // 잠금 제한: 높은 눈 위주로 limit개까지만 지킨다
      const k = [...k0].sort((a, b) => b.pip - a.pip).slice(0, limit);
      const keep = [...new Set([...k, ...fixedLocked])].slice(0, Math.max(limit, fixedLocked.length));
      if (keep.length === free.length) continue;
      const sc = expectedScore(keep, free.length, r, cb.rerollsLeft);
      if (sc > bestScore) { bestScore = sc; bestKeep = keep; }
    }
    if (!bestKeep) break;
    for (const h of free) if (h.locked !== bestKeep.includes(h)) toggleLock(ctx, h.key);
    reroll(ctx);
  }
}

const condRank = (c: Cond) => ({ exact: 0, same: 1, seq: 1, sumPair: 1, sumMin: 2, range: 3, even: 4, odd: 4, any: 6, all: 9 } as Record<string, number>)[c.k];

function incoming(ctx: Ctx): number {
  const cb = ctx.run.combat!;
  let s = 0;
  for (const e of alive(cb)) {
    const it = e.intent;
    const n = Number((it.label.match(/\d+/g) ?? ['0']).slice(-1)[0]);
    if (['attack', 'attackRange', 'bet', 'houseCopy', 'copy'].includes(it.k)) s += n;
    if (it.k === 'multi') s += Number(it.label.split('×')[0]) * (it.hits ?? 1);
  }
  return s;
}

function placePhase(ctx: Ctx) {
  const run = ctx.run;
  const cb = run.combat!;
  // 칩이 남아 있는 동안: 실제 예상 결과가 가장 이득인 카드부터 쓴다
  for (let guard = 0; guard < 8 && !cb.result; guard++) {
    const need = Math.max(0, incoming(ctx) - cb.block - cb.keepBlock);
    const lowHp = run.hp <= run.maxHp * 0.45;
    let best: { i: number; keys: number[]; v: number } | null = null;
    for (let i = 0; i < run.skills.length; i++) {
      if (!skillUsable(ctx, i)) continue;
      const def = SKILL_BY_ID[run.skills[i].id];
      // 약점 눈을 우선 사용
      const tgt = cb.enemies.find((e) => e.uid === cb.target && e.hp > 0) ?? cb.enemies.find((e) => e.hp > 0);
      const weakKeys = tgt ? freeDice(cb).filter((h) => h.pip === tgt.weakPip).map((h) => h.key) : [];
      const pv = previewSkill(ctx, i, def.role === 'atk' ? weakKeys : []);
      if (!pv.keys) continue;
      const enemyHp = cb.enemies.reduce((s2, e) => s2 + Math.max(0, e.hp), 0);
      let v = Math.min(pv.dmg, enemyHp) * 1.0
        + Math.min(pv.block, need) * (lowHp ? 1.4 : 1.0) + Math.max(0, pv.block - need) * 0.15
        + pv.heal * (lowHp ? 1.0 : 0.4) + pv.gold * 0.3 + pv.piggy * 0.2;
      if (pv.chance) v = 30 / 6 + 2; // 운 스킬: 기대값
      if (def.role === 'util') v = 0; // 유틸은 봇이 다루지 않음
      if (def.cond.k === 'all' && freeDice(cb).reduce((s2, h) => s2 + h.pip, 0) < 15) v = 0;
      v = v / Math.max(0.6, def.cost + pv.keys.length * 0.35); // 칩·주사위 대비 효율
      if (!best || v > best.v) best = { i, keys: pv.keys, v };
    }
    if (!best || best.v <= 0.5) break;
    useSkill(ctx, best.i, best.keys);
  }
}

function useCombatConsumables(ctx: Ctx) {
  const run = ctx.run;
  const cb = run.combat!;
  for (let i = run.consumables.length - 1; i >= 0; i--) {
    const def = CONSUMABLE_BY_ID[run.consumables[i]];
    if (!def.use) continue;
    if (def.id === 'potion' && run.hp < run.maxHp * 0.4) { def.use(ctx); run.consumables.splice(i, 1); }
    else if (def.id === 'bomb' && (cb.kind !== 'normal')) { def.use(ctx); run.consumables.splice(i, 1); }
    else if (['heatpill', 'jackpotjuice', 'rerolltoken', 'loadedone'].includes(def.id) && cb.kind !== 'normal' && cb.phase === 'roll') { def.use(ctx); run.consumables.splice(i, 1); }
    if (cb.result) return;
  }
}

export const resolveGreedy = (ctx: Ctx) => {
  const run = ctx.run;
  if (run.offer) {
    const best = run.offer.options.map((o, i) => [rIdx(o), i]).sort((a, b) => b[0] - a[0])[0];
    pickOffer(ctx, best ? best[1] : null);
    return;
  }
  const p = run.pending;
  if (!p) return;
  if (p.kind === 'face') {
    const fd = FACE_BY_ID[p.id];
    let bestD = 0, bestF = 0, bestScore = -1;
    run.dice.forEach((d, di) => d.faces.forEach((f, fi) => {
      if (f.sticker) return;
      const sc = fd.kind === 'replace' ? 7 - f.pip : f.pip;
      if (sc > bestScore) { bestScore = sc; bestD = di; bestF = fi; }
    }));
    applyFace(ctx, bestD, bestF);
  } else if (p.kind === 'material') {
    const i = run.dice.findIndex((d) => d.material === 'wood');
    applyMaterial(ctx, i >= 0 ? i : 0);
  } else if (p.kind === 'skillReplace') {
    const nr = RARITIES.indexOf(SKILL_BY_ID[p.id].rarity);
    const worst = run.skills.map((s, i) => [RARITIES.indexOf(SKILL_BY_ID[s.id].rarity), i] as const).filter(([, i]) => i >= 2).sort((a, b) => a[0] - b[0])[0];
    replaceSkill(ctx, worst && worst[0] < nr ? worst[1] : null);
  } else if (p.kind === 'upgrade') {
    const i = run.skills.findIndex((s) => SKILL_BY_ID[s.id].role === 'atk');
    upgradeSkill(ctx, i >= 0 ? i : 0);
  } else run.pending = null;
};

export const greedyBot: Bot = {
  name: 'greedy',
  chooseNode: (ctx) => {
    const run = ctx.run;
    const opts = currentOptions(run);
    const hpR = run.hp / run.maxHp;
    const score = (t: string) => {
      switch (t) {
        case 'boss': return 100;
        case 'combat': return 50;
        case 'elite': return hpR > 0.75 ? 60 : hpR > 0.5 ? 30 : 5;
        case 'rest': return hpR < 0.5 ? 80 : 10;
        case 'shop': return run.gold >= 20 ? 55 : 20;
        case 'event': return 40;
        case 'casino': return 25;
        default: return 0;
      }
    };
    const i = opts.map((o, i) => [score(o.type), i]).sort((a, b) => b[0] - a[0])[0][1];
    enterNode(ctx, i);
    return i;
  },
  combatStep: (ctx, r) => {
    const cb = ctx.run.combat!;
    // 타깃: 체력 가장 낮은 적
    const t = alive(cb).sort((a, b) => a.hp - b.hp)[0];
    if (t) cb.target = t.uid;
    useCombatConsumables(ctx);
    if (cb.result) return;
    rollPhase(ctx, r);
    if (cb.result) return;
    placePhase(ctx);
    if (!cb.result) endTurn(ctx);
  },
  reward: (ctx) => {
    const run = ctx.run;
    const rw = run.reward!;
    while (!rw.donDone && rw.gold > 0 && donEV(run) >= 1.0 - 1e-9) doubleOrNothing(ctx);
    collectRewardGold(ctx);
    while (run.pendingFreeSpins > 0) {
      run.pendingFreeSpins--;
      const res = slotSpin(ctx, { free: true });
      if (res?.elite) run.pendingEliteFromSlot = true;
      if (res?.faceChoice) resolveFaces(ctx);
    }
    const idx = rw.options.map((o, i) => [rIdx(o) + (o.kind === 'relic' ? 0.5 : 0) + (o.kind === 'skill' && run.skills.length < run.maxSlots ? 1 : 0) + (o.kind === 'skill' && SKILL_BY_ID[o.id].role === 'atk' ? 1 : 0), i]).sort((a, b) => b[0] - a[0])[0];
    if (idx) pickReward(ctx, idx[1]);
    if (run.pending || run.offer) resolveGreedy(ctx);
    leaveReward(ctx);
  },
  shop: (ctx) => {
    const run = ctx.run;
    const s = run.shop!;
    if (haggleOdds(run).ev < 1) for (let i = 0; i < s.items.length; i++) haggle(ctx, i);
    const prio = (o: RewardOption) => {
      if (o.kind === 'consumable') return o.id === 'potion' && run.hp < run.maxHp * 0.6 ? 6 : 0;
      if (o.kind === 'material') return rIdx(o) >= 1 ? 2 + rIdx(o) : -1;
      return { relic: 5, skill: 4, face: 3 }[o.kind] + rIdx(o);
    };
    const order = s.items.map((it, i) => [prio(it.opt), i]).sort((a, b) => b[0] - a[0]);
    for (const [p, i] of order) {
      if (p <= 0) continue;
      if (shopBuy(ctx, i)) { if (run.pending || run.offer) resolveGreedy(ctx); }
    }
    leaveShop(ctx);
  },
  casino: (ctx) => {
    const run = ctx.run;
    while (run.chips > 0 && slotOdds(run).ev >= 1.0) {
      const res = slotSpin(ctx);
      if (!res) break;
      if (res.elite) run.pendingEliteFromSlot = true;
      if (res.faceChoice) resolveFaces(ctx);
    }
    leaveCasino(ctx);
  },
  event: (ctx) => {
    const run = ctx.run;
    const def = EVENT_BY_ID[run.event!.id];
    const ok = def.choices.map((c, i) => [c, i] as const).filter(([c]) => !c.can || c.can(ctx));
    let pick = ok[0][1];
    if (def.id === 'devil' && run.maxHp < 60) pick = ok[ok.length - 1][1];
    if (def.id === 'fountain' && run.hp > run.maxHp * 0.5) pick = ok[ok.length - 1][1];
    eventChoose(ctx, pick);
    if (run.pending || run.offer) resolveGreedy(ctx);
    // 남은 소모품 사용
    for (let i = run.consumables.length - 1; i >= 0; i--) if (run.consumables[i] === 'potion' && run.hp < run.maxHp * 0.5) useConsumableOutside(ctx, i);
    advance(ctx);
  },
  rest: (ctx) => {
    const run = ctx.run;
    if (run.hp < run.maxHp * 0.65) restHeal(ctx);
    else { restUpgrade(ctx); resolveGreedy(ctx); }
  },
  resolve: (ctx) => resolveGreedy(ctx),
};

function resolveFaces(ctx: Ctx) {
  offerFaces(ctx, ctx.run.screen);
  resolveGreedy(ctx);
  if (ctx.run.pending) resolveGreedy(ctx);
}
