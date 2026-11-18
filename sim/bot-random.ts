import type { Ctx } from '../src/rules/ctx';
import { canUse, endTurn, freeDice, reroll, toggleLock } from '../src/rules/combat';
import { condCount, SKILL_BY_ID } from '../src/data/skills';
import {
  applyFace, applyMaterial, currentOptions, enterNode, eventChoose, leaveCasino, leaveReward, leaveShop,
  pickOffer, pickReward, replaceSkill, restHeal, restUpgrade, shopBuy, upgradeSkill, advance, collectRewardGold,
} from '../src/rules/run';
import { doubleOrNothing, slotSpin } from '../src/rules/casino';
import { EVENT_BY_ID } from '../src/data/events';
import type { Bot, BotRng } from './driver';
import { useSkill } from '../src/rules/combat';

export const resolveRandom = (ctx: Ctx, r: BotRng) => {
  const run = ctx.run;
  if (run.offer) { pickOffer(ctx, r.int(0, run.offer.options.length - 1)); return; }
  const p = run.pending;
  if (!p) return;
  if (p.kind === 'face') applyFace(ctx, r.int(0, run.dice.length - 1), r.int(0, 5));
  else if (p.kind === 'material') applyMaterial(ctx, r.int(0, run.dice.length - 1));
  else if (p.kind === 'skillReplace') replaceSkill(ctx, r.chance(0.5) ? r.int(0, run.skills.length - 1) : null);
  else if (p.kind === 'upgrade') upgradeSkill(ctx, r.int(0, run.skills.length - 1));
  else run.pending = null;
};

export const randomBot: Bot = {
  name: 'random',
  chooseNode: (ctx, r) => { const n = currentOptions(ctx.run).length; enterNode(ctx, r.int(0, n - 1)); return 0; },
  combatStep: (ctx, r) => {
    const cb = ctx.run.combat!;
    // 무작위 잠금/리롤
    const rr = r.int(0, cb.rerollsLeft);
    for (let i = 0; i < rr; i++) {
      for (const h of cb.hand) if (r.chance(0.3)) toggleLock(ctx, h.key);
      reroll(ctx);
    }
    // 무작위 배치
    for (let tries = 0; tries < 20 && !cb.result; tries++) {
      const slot = r.int(0, ctx.run.skills.length - 1);
      const def = SKILL_BY_ID[ctx.run.skills[slot].id];
      const free = freeDice(cb);
      if (!free.length) break;
      const n = condCount(def.cond, free.length);
      const keys: number[] = [];
      const pool = [...free];
      while (keys.length < n && pool.length) keys.push(pool.splice(r.int(0, pool.length - 1), 1)[0].key);
      if (canUse(ctx, slot, keys)) {
        const other = free.find((h) => !keys.includes(h.key));
        useSkill(ctx, slot, keys, def.needsChoice && other ? { key: other.key, value: r.int(1, 6) } : undefined);
      }
    }
    if (!cb.result) endTurn(ctx);
  },
  reward: (ctx, r) => {
    const rw = ctx.run.reward!;
    while (!rw.donDone && rw.gold > 0 && r.chance(0.5)) doubleOrNothing(ctx);
    collectRewardGold(ctx);
    while (ctx.run.pendingFreeSpins > 0) { ctx.run.pendingFreeSpins--; slotSpin(ctx, { free: true }); }
    if (r.chance(0.7) && rw.options.length) pickReward(ctx, r.int(0, rw.options.length - 1));
    if (ctx.run.pending || ctx.run.offer) resolveRandom(ctx, r);
    leaveReward(ctx);
  },
  shop: (ctx, r) => {
    const s = ctx.run.shop!;
    for (let i = 0; i < 3; i++) {
      const idx = r.int(0, s.items.length - 1);
      if (r.chance(0.5)) shopBuy(ctx, idx);
      if (ctx.run.pending || ctx.run.offer) resolveRandom(ctx, r);
    }
    leaveShop(ctx);
  },
  casino: (ctx, r) => {
    while (ctx.run.chips > 0 && r.chance(0.6)) {
      const res = slotSpin(ctx);
      if (res?.faceChoice) { ctx.run.offer = null; }
      if (res?.elite) ctx.run.pendingEliteFromSlot = true;
    }
    leaveCasino(ctx);
  },
  event: (ctx, r) => {
    const ev = ctx.run.event!;
    const def = EVENT_BY_ID[ev.id];
    const ok = def.choices.map((c, i) => [c, i] as const).filter(([c]) => !c.can || c.can(ctx));
    eventChoose(ctx, r.pick(ok)[1]);
    if (ctx.run.pending || ctx.run.offer) resolveRandom(ctx, r);
    advance(ctx);
  },
  rest: (ctx, r) => {
    if (r.chance(0.5)) restHeal(ctx);
    else { restUpgrade(ctx); resolveRandom(ctx, r); }
  },
  resolve: resolveRandom,
};
