import type { Ctx } from '../src/rules/ctx';
import { canPlay, endTurn, freeDice, playCard, reroll, toggleLock } from '../src/rules/combat';
import { condCounts } from '../src/data/cond';
import { resolveFor } from '../src/rules/cardfx';
import { pickAugment } from '../src/rules/sets';
import {
  applyFace, applyMaterial, currentOptions, enterNode, eventChoose, leaveCasino, leaveReward, leaveShop,
  pickOffer, pickReward, restHeal, restUpgrade, shopBuy, advance, collectRewardGold, pickCardReward, upgradeCard, removeCards, canUpgradeCard, canRemoveMore,
} from '../src/rules/run';
import { doubleOrNothing, slotSpin } from '../src/rules/casino';
import { EVENT_BY_ID } from '../src/data/events';
import type { Bot, BotRng } from './driver';

export const resolveRandom = (ctx: Ctx, r: BotRng) => {
  const run = ctx.run;
  if (run.augmentOffer) { pickAugment(ctx, r.int(0, run.augmentOffer.ids.length - 1)); return; }
  if (run.offer) { pickOffer(ctx, r.int(0, run.offer.options.length - 1)); return; }
  const p = run.pending;
  if (!p) return;
  if (p.kind === 'face') applyFace(ctx, r.int(0, run.dice.length - 1), r.int(0, 5));
  else if (p.kind === 'material') applyMaterial(ctx, r.int(0, run.dice.length - 1));
  else if (p.kind === 'upgradeCard') { const c = run.deck.filter((x) => canUpgradeCard(run, x.uid)); if (c.length) upgradeCard(ctx, r.pick(c).uid, r.chance(0.5) ? 'A' : 'B'); else run.pending = null; }
  else if (p.kind === 'removeCard') { if (canRemoveMore(run, p.count)) { const pool = [...run.deck]; const u: number[] = []; while (u.length < p.count) u.push(pool.splice(r.int(0, pool.length - 1), 1)[0].uid); removeCards(ctx, u); } else run.pending = null; }
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
      if (!cb.cards.length) break;
      const slot = r.int(0, cb.cards.length - 1);
      const def = resolveFor(ctx.run, cb.cards[slot]);
      const free = freeDice(cb);
      const cnts = condCounts(def.cond, free.length);
      const n = cnts[r.int(0, cnts.length - 1)];
      const keys: number[] = [];
      const pool = [...free];
      while (keys.length < n && pool.length) keys.push(pool.splice(r.int(0, pool.length - 1), 1)[0].key);
      if (canPlay(ctx, slot, keys)) {
        const other = free.find((h) => !keys.includes(h.key));
        playCard(ctx, slot, keys, def.choose ? { key: other?.key, value: r.int(1, 6) } : undefined);
      }
    }
    if (!cb.result) endTurn(ctx);
  },
  reward: (ctx, r) => {
    const rw = ctx.run.reward!;
    while (!rw.donDone && rw.gold > 0 && r.chance(0.5)) doubleOrNothing(ctx);
    collectRewardGold(ctx);
    while (ctx.run.pendingFreeSpins > 0) { ctx.run.pendingFreeSpins--; slotSpin(ctx, { free: true }); }
    pickCardReward(ctx, r.chance(0.8) ? r.int(0, Math.max(0, rw.cards.length - 1)) : null);
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
