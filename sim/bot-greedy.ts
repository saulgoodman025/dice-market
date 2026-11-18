import type { Ctx } from '../src/rules/ctx';
import { autoPick, endTurn, freeDice, reroll, skillUsable, toggleLock, useSkill } from '../src/rules/combat';
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
    for (const k of cands) {
      const keep = [...new Set([...k, ...fixedLocked])];
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
  const slots = run.skills.map((s, i) => ({ i, def: SKILL_BY_ID[s.id] })).sort((a, b) => condRank(a.def.cond) - condRank(b.def.cond));
  const use = (i: number, keys: number[]) => {
    const def = SKILL_BY_ID[run.skills[i].id];
    let choice;
    if (def.needsChoice) {
      const other = freeDice(cb).filter((h) => !keys.includes(h.key)).sort((a, b) => a.pip - b.pip)[0];
      if (other) choice = { key: other.key, value: 6 };
    }
    useSkill(ctx, i, keys, choice);
  };
  // 1) 다중 주사위 / 강력 조건 스킬
  for (const { i, def } of slots) {
    if (cb.result) return;
    if (!['same', 'seq', 'sumPair', 'sumMin', 'exact'].includes(def.cond.k) || !skillUsable(ctx, i)) continue;
    const k = autoPick(ctx, i);
    if (k) use(i, k);
  }
  // 2) 방어
  const need = incoming(ctx) - cb.block - cb.keepBlock;
  const lowHp = run.hp <= run.maxHp * 0.5;
  if (need > 3 && (lowHp || need >= 8)) {
    for (const { i, def } of slots) {
      if (cb.result) return;
      if (def.role !== 'def' || !skillUsable(ctx, i) || def.perCombat) continue;
      const k = autoPick(ctx, i);
      if (k) use(i, k);
    }
  }
  // 3) 공격 / 유틸(무작위 사용 금지 대상 제외)
  for (const { i, def } of slots) {
    if (cb.result) return;
    if (def.role !== 'atk' || !skillUsable(ctx, i) || def.cond.k === 'all') continue;
    const k = autoPick(ctx, i);
    if (k) use(i, k);
  }
  // 4) 경제 / 회복
  for (const { i, def } of slots) {
    if (cb.result) return;
    if (!skillUsable(ctx, i)) continue;
    if (def.role === 'eco' || (def.role === 'def' && def.perCombat && run.hp < run.maxHp * 0.7)) {
      const k = autoPick(ctx, i);
      if (k) use(i, k);
    }
  }
  // 5) 올인 (남은 합이 15 이상일 때만)
  for (const { i, def } of slots) {
    if (cb.result) return;
    if (def.cond.k !== 'all' || !skillUsable(ctx, i)) continue;
    const free = freeDice(cb);
    if (free.reduce((s, h) => s + h.pip, 0) >= 15) { const k = autoPick(ctx, i); if (k) use(i, k); }
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
