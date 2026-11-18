// 한 판(run)의 흐름: 맵 → 노드 → 보상 → 다음 층 → 막 → 클리어
import { makeRngState } from '../core/rng';
import type { MapNode, RewardOption, RunState, ShopItem } from '../core/state';
import { BALANCE } from '../data/balance';
import { CHAR_BY_ID } from '../data/characters';
import { CONSUMABLE_BY_ID } from '../data/consumables';
import { EVENTS, EVENT_BY_ID } from '../data/events';
import { FACE_BY_ID } from '../data/faces';
import { MATERIAL_BY_ID } from '../data/materials';
import { ACT1_MANIP_CHANCE, MANIP_SKILLS, META_LOCKED_START } from '../data/meta';
import { CARD_BY_ID, cardName, isPoolCard } from '../data/cards';
import { RELIC_BY_ID } from '../data/relics';
import { STAKES } from '../data/stakes';
import { HIGHROLLER } from '../data/casino';
import { TABLE_BY_ID } from '../data/tables';
import { dailyRuleById } from './daily';
import { fire, getMods, registerSources, rng, toast, type Ctx, type EffectSource } from './ctx';
import { startCombat } from './combat';
import {
  band, combatScore, computeFlow, ddaEliteRewardMult, ddaForceShopEpic, ddaHighrollerBonus, ddaShopIncludesPotion,
} from './dda';
import { newDie } from './dice';
import {
  acquire, addCurse, basePrice, cardPool, giveRelic, itemRarity, onNodeMove, rollCardReward, rollItemId, rollOption, rollRarity, type ItemKind,
} from './economy';
import { startDeck } from './deck';
import { offerAugment, syncSets } from './sets';
import { deckChanged } from './economy';
import { genActMap, pickEncounter } from './map';
import { gainChips, gainGold, healPlayer, maxHpChange } from './ops';
import { highroller, shopRerollDie } from './casino';

// ── 효과 소스 등록: 유물 + 캐릭터 + 스테이크 ──
registerSources((run) => {
  const out: EffectSource[] = [];
  for (const r of run.relics) if (RELIC_BY_ID[r]) out.push(RELIC_BY_ID[r]);
  const ch = CHAR_BY_ID[run.charId];
  if (ch) out.push(ch);
  for (const s of STAKES) if (s.level <= run.stake) out.push({ id: 'stake' + s.level, name: s.name, mods: s.mods });
  const tb = TABLE_BY_ID[run.table];
  if (tb?.mods) out.push({ id: 'table', name: tb.name, mods: tb.mods });
  const dr = run.dailyRule ? dailyRuleById(run.dailyRule) : undefined;
  if (dr) out.push({ id: 'daily', name: dr.name, mods: dr.mods });
  return out;
});

export const SAVE_VERSION = 7;

export interface MetaPool {
  unlocked: string[]; // "kind:id"
}

export interface RunOptions { table?: string; dailyKey?: string; dailyRule?: string }

export function newRun(seed: number, charId: string, stake = 0, meta: MetaPool = { unlocked: [] }, opts: RunOptions = {}): RunState {
  const ch = CHAR_BY_ID[charId];
  const run: RunState = {
    version: SAVE_VERSION, seed, rng: makeRngState(seed), charId, stake, table: opts.table ?? 'classic', dailyKey: opts.dailyKey, dailyRule: opts.dailyRule,
    hp: ch.hp, maxHp: ch.hp, gold: BALANCE.startGold, chips: 0,
    dice: [], deck: [], augments: [], augmentOffer: null,
    relics: [], consumables: [], act: 1, floor: 0, map: [], path: [], nodesReached: 0, bossesKilled: 0,
    heat: 0, jackpot: 0, screen: 'map', combat: null, reward: null, shop: null, event: null,
    pending: null, offer: null, flags: {},
    stats: { yahtzees: 0, jackpotTurns: 0, gambles: 0, megaJackpots: 0, kills: 0, deathBy: null, combatsWon: 0, goldEarned: 0, removals: 0 },
    dda: { flow: 60, recentScores: [], shopsSinceEpic: 0, forceEpic: false, combatsTurns: [] },
    nextUid: 1, pendingFreeSpins: 0, pendingEliteFromSlot: false, log: [],
  };
  run.dice = ch.dice.map((m) => newDie(run.nextUid++, m));
  run.deck = startDeck(run);
  syncSets({ run, emit: () => {} });
  TABLE_BY_ID[run.table]?.setup?.(run, newDie);
  if (opts.dailyKey) run.flags.daily = 1;
  for (const l of META_LOCKED_START) {
    if (!meta.unlocked.includes(`${l.kind}:${l.id}`)) run.flags[`pool_${l.kind}_${l.id}`] = 0;
  }
  const m = getMods(run);
  if (m.startHpDelta) {
    run.maxHp = Math.max(20, run.maxHp + m.startHpDelta);
    run.hp = run.maxHp;
  }
  const ctx: Ctx = { run, emit: () => {} };
  run.map = genActMap(ctx);
  return run;
}

/** 이번 층에서 고를 수 있는 노드의 지도 인덱스 */
export function currentChoices(run: RunState): number[] {
  const floor = run.map[run.floor] ?? [];
  if (run.floor === 0) return floor.map((_, i) => i);
  const prev = run.map[run.floor - 1]?.[run.path[run.floor - 1]];
  return prev ? prev.next.filter((j) => j < floor.length) : floor.map((_, i) => i);
}

export function currentOptions(run: RunState): MapNode[] {
  return currentChoices(run).map((i) => run.map[run.floor][i]);
}

function relicRarity(id: string) {
  return RELIC_BY_ID[id]?.rarity ?? 'common';
}

export function updateFlow(run: RunState) {
  run.dda.flow = computeFlow(run, relicRarity);
}

// ───────────── 노드 진입 ─────────────
/** idx = 이번 층 선택지 중 몇 번째인지 (currentChoices 순서) */
export function enterNode(ctx: Ctx, idx: number) {
  const run = ctx.run;
  const mapIdx = currentChoices(run)[idx];
  const node = run.map[run.floor]?.[mapIdx];
  if (!node || run.screen !== 'map') return;
  run.path[run.floor] = mapIdx;
  run.nodesReached++;
  updateFlow(run);
  onNodeMove(ctx);
  switch (node.type) {
    case 'combat': startCombat(ctx, 'normal', pickEncounter(ctx, 'normal')); break;
    case 'elite': startCombat(ctx, 'elite', pickEncounter(ctx, 'elite'), ddaEliteRewardMult(run)); break;
    case 'boss': startCombat(ctx, 'boss', pickEncounter(ctx, 'boss')); break;
    case 'shop': openShop(ctx); break;
    case 'casino': openCasino(ctx); break;
    case 'event': openEvent(ctx); break;
    case 'rest': run.screen = 'rest'; break;
  }
}

// ───────────── 전투 종료 → 보상 ─────────────
export function finishCombat(ctx: Ctx) {
  const run = ctx.run;
  const cb = run.combat;
  if (!cb || !cb.result) return;
  const win = cb.result === 'win';
  run.dda.recentScores.push(combatScore(cb.dmgTaken, run.maxHp));
  run.dda.combatsTurns.push(cb.turn);
  fire(ctx, 'onCombatEnd', { win });
  if (cb.result === 'lose') {
    run.screen = 'gameover';
    return;
  }
  if (cb.result === 'fled') {
    run.combat = null;
    advance(ctx);
    return;
  }
  run.stats.combatsWon++;
  if (cb.kind === 'boss' && run.hp <= run.maxHp * 0.1) run.flags.ach_close_boss = 1;
  if (cb.kind === 'elite' && cb.dmgTaken === 0) run.flags.ach_perfect_elite = 1;
  const m = getMods(run);
  const base = (BALANCE.rewardGold[cb.kind] + m.rewardGold) * cb.rewardMult;
  let piggyPct = 1 + run.heat * BALANCE.heatPiggyPerStep + m.piggyPct;
  if (run.flags.luckycat > 0) {
    piggyPct += 0.2;
    run.flags.luckycat--;
  }
  const piggy = Math.round(cb.piggy * piggyPct);
  const options: RewardOption[] = [];
  const ex: string[] = [];
  const add = (o: RewardOption | null) => { if (o) { options.push(o); ex.push(o.id); } };
  if (cb.kind === 'normal') {
    // 일반 전투: 카드 보상 + 면 스티커 1장 중 택1은 사라지고, 면 스티커는 3장 중 1 (건너뛰기 가능)
    for (let i = 0; i < 3; i++) add(rollOption(ctx, 'face', 'common', 'loot', ex));
  } else if (cb.kind === 'elite') {
    for (let i = 0; i < 3; i++) add(rollOption(ctx, 'relic', 'common', 'loot', ex));
  } else {
    for (let i = 0; i < 3; i++) add(rollOption(ctx, 'relic', 'rare', 'loot', ex));
  }
  if (m.piggyChipsRatio > 0 && piggy > 0) gainChips(ctx, Math.max(1, Math.floor(piggy * m.piggyChipsRatio)));
  const heal = cb.kind === 'boss' ? Math.round(run.maxHp * BALANCE.bossHealOnWin) : 0;
  run.reward = {
    base: Math.round(base), piggy, heatMult: piggyPct, gold: Math.round(base) + piggy, donStreak: 0, donDone: false,
    donLastRoll: null, options, picked: false, chips: 0, heal, insuranceUsed: false,
    cards: rollCardReward(ctx, cb.kind), cardDone: false, combatKind: cb.kind,
  };
  if (cb.kind === 'boss') {
    run.bossesKilled++;
    if (run.act === 1) run.flags.meta_act1boss = 1;
  }
  run.combat = null;
  run.screen = 'reward';
}

export function collectRewardGold(ctx: Ctx) {
  const rw = ctx.run.reward;
  if (!rw || rw.donDone && rw.gold === 0 && rw.base === -1) return;
  if (rw.gold > 0) gainGold(ctx, rw.gold);
  if (rw.heal) healPlayer(ctx, rw.heal);
  rw.heal = 0;
  rw.gold = 0;
  rw.donDone = true;
  rw.base = -1; // 수령 완료 표시
}

/** 카드 보상: i번째 카드를 덱에 (null이면 건너뛰기 → 골드 +5) */
export function pickCardReward(ctx: Ctx, i: number | null) {
  const rw = ctx.run.reward;
  if (!rw || rw.cardDone) return;
  rw.cardDone = true;
  if (i === null || !rw.cards[i]) { gainGold(ctx, BALANCE.cardSkipGold); return; }
  acquire(ctx, { kind: 'card', id: rw.cards[i] }, 'reward');
}

export function pickReward(ctx: Ctx, i: number) {
  const rw = ctx.run.reward;
  if (!rw || rw.picked) return;
  const o = rw.options[i];
  if (!o) return;
  rw.picked = true;
  acquire(ctx, o, 'reward');
}

export function leaveReward(ctx: Ctx) {
  const rw = ctx.run.reward;
  if (rw && rw.base !== -1) collectRewardGold(ctx);
  ctx.run.reward = null;
  advance(ctx);
}

// ───────────── 층 이동 ─────────────
export function advance(ctx: Ctx) {
  const run = ctx.run;
  run.combat = null;
  run.shop = null;
  run.event = null;
  if (run.pendingEliteFromSlot) {
    run.pendingEliteFromSlot = false;
    startCombat(ctx, 'elite', pickEncounter(ctx, 'elite'), 2);
    return;
  }
  const wasBoss = run.floor >= BALANCE.floorsPerAct - 1;
  if (wasBoss) {
    if (run.act >= 3 && !run.flags.endless) {
      run.screen = 'victory';
      run.flags.meta_clear = 1;
      return;
    }
    nextAct(ctx);
    if (run.act <= 3) offerAugment(ctx, 'boss', 'map');
    return;
  }
  const first = run.floor === 0;
  run.floor++;
  updateFlow(run);
  run.screen = 'map';
  // 증강: 1층 노드를 마친 직후
  if (first && run.act <= 3) offerAugment(ctx, 'floor', 'map');
}

function nextAct(ctx: Ctx) {
  const run = ctx.run;
  run.act++;
  run.floor = 0;
  run.map = [];
  run.path = [];
  if (run.act === 2) run.flags.meta_act2 = 1;
  // 이번 막 한정 주사위 제거
  run.dice = run.dice.filter((d) => {
    const a = run.flags['tempdie_' + d.uid];
    return !(a && a < run.act);
  });
  // 사채 상환
  if (run.flags.loan) {
    const owe = run.flags.loan;
    if (run.gold >= owe) {
      gainGold(ctx, -owe);
      toast(ctx, `사채 ${owe}G 상환`, 'info');
    } else {
      maxHpChange(run, -20);
      addCurse(ctx, 'debtnote');
      toast(ctx, '사채를 갚지 못했다: 최대 체력 -20, 빚 문서 카드', 'bad');
    }
    run.flags.loan = 0;
  }
  updateFlow(run);
  run.map = genActMap(ctx);
  run.screen = 'map';
  toast(ctx, run.act > 3 ? `♾️ 엔드리스 ${run.act}막: 적이 더 강해집니다` : `${run.act}막 시작: ${run.act === 2 ? 'VIP 라운지' : '하우스 금고'}`, 'info');
}

// ───────────── 휴식 ─────────────
export function restHeal(ctx: Ctx) {
  healPlayer(ctx, ctx.run.maxHp * BALANCE.restHealPct);
  advance(ctx);
}

export function restUpgrade(ctx: Ctx) {
  ctx.run.pending = { kind: 'upgradeCard', then: 'rest' };
}

export function restRemove(ctx: Ctx) {
  ctx.run.pending = { kind: 'removeCard', then: 'rest', count: 1 };
}

// ───────────── 상점 ─────────────
function shopItem(ctx: Ctx, kind: ItemKind, minRarity: 'common' | 'epic' = 'common', exclude: string[] = []): ShopItem | null {
  const run = ctx.run;
  let o: RewardOption | null = null;
  if (kind === 'card' && run.act === 1 && !exclude.some((id) => MANIP_SKILLS.includes(id)) && rng(ctx, 'shop').chance(ACT1_MANIP_CHANCE)) {
    const pool = cardPool(run).map((c) => c.id);
    const cands = MANIP_SKILLS.filter((id) => pool.includes(id) && !exclude.includes(id));
    if (cands.length) o = { kind: 'card', id: rng(ctx, 'shop').pick(cands) };
  }
  if (!o) {
    const r = kind === 'consumable' ? undefined : rollRarity(ctx, minRarity);
    if (r) {
      const id = rollItemId(ctx, kind, r, 'shop', exclude);
      o = id ? ({ kind, id } as RewardOption) : null;
    } else o = rollOption(ctx, kind, 'common', 'shop', exclude);
  }
  if (!o) return null;
  const p = basePrice(run, o);
  return { opt: o, price: p, basePrice: p, haggles: 0, lastHaggle: null, sold: false };
}

function fillShop(ctx: Ctx): ShopItem[] {
  const run = ctx.run;
  const m = getMods(run);
  // 카드 3칸 + 무작위 2칸 (유물 / 면 스티커·재질 / 소모품)
  const kinds: ItemKind[] = ['card', 'card', 'card'];
  const r = rng(ctx, 'shop');
  const extra = BALANCE.shopSlotCount - kinds.length + m.shopSlots;
  const groups: ItemKind[][] = [['relic'], ['face', 'material'], ['consumable']];
  for (let i = 0; i < extra; i++) kinds.push(r.pick(r.pick(groups)));
  const items: ShopItem[] = [];
  const ex: string[] = [];
  const forceEpic = ddaForceShopEpic(run);
  kinds.forEach((k, i) => {
    const it = shopItem(ctx, k, forceEpic && k === 'relic' ? 'epic' : 'common', ex);
    if (it) { items.push(it); ex.push(it.opt.id); }
    void i;
  });
  if (ddaShopIncludesPotion(run)) {
    const ci = items.findIndex((x) => x.opt.kind === 'consumable');
    const p = basePrice(run, { kind: 'consumable', id: 'potion' });
    const potion: ShopItem = { opt: { kind: 'consumable', id: 'potion' }, price: p, basePrice: p, haggles: 0, lastHaggle: null, sold: false };
    if (ci >= 0) items[ci] = potion; else items.push(potion);
  }
  const hasEpic = items.some((x) => x.opt.kind !== 'consumable' && ['epic', 'legendary'].includes(itemRarity(x.opt)));
  if (hasEpic) { run.dda.shopsSinceEpic = 0; run.dda.forceEpic = false; } else run.dda.shopsSinceEpic++;
  return items;
}

export function openShop(ctx: Ctx) {
  const run = ctx.run;
  const m = getMods(run);
  run.shop = {
    items: fillShop(ctx), rerollCost: BALANCE.shopRerollStart, rerollFree: m.shopFirstRerollFree > 0, rerolls: 0,
    bought: false, lastRerollDie: null, discountNext: false, removeUsed: false,
  };
  // 상점 VIP: 카드 1장 무료
  if (m.shopFreeCard) { const c = run.shop.items.find((x) => x.opt.kind === 'card'); if (c) c.price = 0; }
  run.screen = 'shop';
  fire(ctx, 'onShopEnter');
}

export function shopReroll(ctx: Ctx): number | null {
  const run = ctx.run;
  const s = run.shop;
  if (!s || s.rerolls >= BALANCE.shopRerollMax) return null;
  const paid = s.rerollFree ? 0 : s.rerollCost;
  if (run.gold < paid) return null;
  if (paid) gainGold(ctx, -paid);
  s.rerollFree = false;
  s.rerolls++;
  const d = shopRerollDie(ctx);
  s.lastRerollDie = d;
  if (d === 6 && paid) {
    gainGold(ctx, paid);
    toast(ctx, `🎲 6! 리롤 비용 ${paid}G 돌려받음`, 'gold');
  }
  const kept = s.items.filter((i) => i.sold);
  const fresh = fillShop(ctx).filter((_, i) => !s.items[i]?.sold);
  s.items = s.items.map((it) => (it.sold ? it : fresh.shift() ?? it));
  void kept;
  return d;
}

export function shopBuy(ctx: Ctx, idx: number): boolean {
  const run = ctx.run;
  const s = run.shop;
  if (!s) return false;
  const it = s.items[idx];
  if (!it || it.sold || run.gold < it.price) return false;
  if (it.opt.kind === 'consumable' && run.consumables.length >= BALANCE.maxConsumables) {
    toast(ctx, '소모품 칸이 가득 찼다', 'bad');
    return false;
  }
  gainGold(ctx, -it.price);
  it.sold = true;
  s.bought = true;
  acquire(ctx, it.opt, 'shop');
  return true;
}

export function shopApplyPricetag(ctx: Ctx, idx: number): boolean {
  const run = ctx.run;
  const s = run.shop;
  const ti = run.consumables.indexOf('pricetag');
  if (!s || ti < 0) return false;
  const it = s.items[idx];
  if (!it || it.sold) return false;
  it.price = Math.floor(it.price * 0.5);
  run.consumables.splice(ti, 1);
  return true;
}

export function buyChip(ctx: Ctx): boolean {
  if (ctx.run.gold < BALANCE.chipPrice) return false;
  gainGold(ctx, -BALANCE.chipPrice);
  gainChips(ctx, 1);
  return true;
}

export function leaveShop(ctx: Ctx) {
  fire(ctx, 'onShopLeave', { bought: ctx.run.shop?.bought ?? false });
  advance(ctx);
}

// ───────────── 카지노 ─────────────
export function openCasino(ctx: Ctx) {
  const run = ctx.run;
  const m = getMods(run);
  let chips = BALANCE.casinoEnterChips + m.casinoChips;
  if (run.flags.vip) {
    chips *= 2;
    run.flags.vip = 0;
  }
  gainChips(ctx, chips);
  run.screen = 'casino';
  fire(ctx, 'onCasinoEnter');
}

export function casinoHighroller(ctx: Ctx, id: string) {
  if (ctx.run.act < 2) return null;
  return highroller(ctx, id, ddaHighrollerBonus(ctx.run));
}

export function leaveCasino(ctx: Ctx) {
  advance(ctx);
}

// ───────────── 이벤트 ─────────────
export function openEvent(ctx: Ctx) {
  const run = ctx.run;
  const pool = EVENTS.filter((e) => (e.minAct ?? 1) <= run.act && (e.maxAct ?? 3) >= run.act && !run.flags['evdone_' + e.id]);
  const ev = rng(ctx, 'map').pick(pool.length ? pool : EVENTS);
  run.flags['evdone_' + ev.id] = 1;
  run.event = { id: ev.id, done: false, resultText: null, data: {} };
  run.screen = 'event';
}

export function eventChoose(ctx: Ctx, i: number) {
  const run = ctx.run;
  const ev = run.event;
  if (!ev || ev.done) return;
  const c = EVENT_BY_ID[ev.id].choices[i];
  if (!c || (c.can && !c.can(ctx))) return;
  ev.resultText = c.run(ctx);
  ev.done = true;
}

// ───────────── 선택 처리 (면/재질/스킬 교체/강화) ─────────────
export function applyFace(ctx: Ctx, dieIdx: number, faceIdx: number) {
  const run = ctx.run;
  const p = run.pending;
  if (!p || p.kind !== 'face') return;
  const die = run.dice[dieIdx];
  if (!die) return;
  die.faces[faceIdx].sticker = p.id;
  toast(ctx, `${FACE_BY_ID[p.id].name} 면 부착`, 'good');
  run.flags['seen_face_' + p.id] = 1;
  run.pending = null;
}

export function applyMaterial(ctx: Ctx, dieIdx: number) {
  const run = ctx.run;
  const p = run.pending;
  if (!p || p.kind !== 'material') return;
  const die = run.dice[dieIdx];
  if (!die) return;
  die.material = p.id;
  toast(ctx, `${MATERIAL_BY_ID[p.id].name} 재질 적용`, 'good');
  run.pending = null;
}

/** 카드 강화 (분기형): 덱의 카드를 A 또는 B로. 카드당 1회 */
export function canUpgradeCard(run: RunState, uid: number): boolean {
  const c = run.deck.find((x) => x.uid === uid);
  return !!c && !c.up && !!CARD_BY_ID[c.id]?.upgrades;
}

export function upgradeCard(ctx: Ctx, uid: number, branch: 'A' | 'B') {
  const run = ctx.run;
  const p = run.pending;
  if (!p || p.kind !== 'upgradeCard' || !canUpgradeCard(run, uid)) return;
  const c = run.deck.find((x) => x.uid === uid)!;
  c.up = branch;
  toast(ctx, `「${cardName(c)}」 강화: ${CARD_BY_ID[c.id].upgrades![branch].label}`, 'good');
  const then = p.then;
  run.pending = null;
  if (then === 'rest') advance(ctx);
}

/** 상점 카드 삭제 서비스 가격: 50 → 75 → 100… (판 단위 누적) */
export function removePrice(run: RunState): number {
  const m = getMods(run);
  return Math.max(0, BALANCE.removeBase + BALANCE.removeStep * (run.flags.shopRemovals ?? 0) - m.removeDiscount);
}

export function canRemoveMore(run: RunState, count = 1): boolean {
  return run.deck.length - count >= BALANCE.minDeck;
}

export function shopRemoveService(ctx: Ctx): boolean {
  const run = ctx.run;
  const s = run.shop;
  const price = removePrice(run);
  if (!s || s.removeUsed || run.gold < price || !canRemoveMore(run)) return false;
  run.pending = { kind: 'removeCard', then: 'shop', count: 1, cost: price };
  return true;
}

/** 카드 삭제 확정. uids = 지울 카드들 */
export function removeCards(ctx: Ctx, uids: number[]) {
  const run = ctx.run;
  const p = run.pending;
  if (!p || p.kind !== 'removeCard' || uids.length !== p.count || !canRemoveMore(run, uids.length)) return;
  if (p.cost && run.gold < p.cost) return;
  if (p.cost) gainGold(ctx, -p.cost);
  if (p.hpCost) { run.hp = Math.max(1, run.hp - p.hpCost); ctx.emit({ t: 'dmgPlayer', amount: p.hpCost, blocked: 0, src: '소각로' }); }
  const names = uids.map((u) => run.deck.find((c) => c.uid === u)).filter(Boolean).map((c) => cardName(c!));
  run.deck = run.deck.filter((c) => !uids.includes(c.uid));
  run.stats.removals += uids.length;
  if (p.then === 'shop' && run.shop) { run.shop.removeUsed = true; run.flags.shopRemovals = (run.flags.shopRemovals ?? 0) + 1; }
  toast(ctx, `🗑 ${names.join(', ')} 삭제`, 'good');
  deckChanged(ctx);
  const then = p.then;
  run.pending = null;
  if (then === 'rest') advance(ctx);
}

export function cancelPending(ctx: Ctx) {
  ctx.run.pending = null;
}

export function pickOffer(ctx: Ctx, i: number | null) {
  const run = ctx.run;
  const of = run.offer;
  if (!of) return;
  run.offer = null;
  if (i === null) return;
  const o = of.options[i];
  if (o) acquire(ctx, o, of.then);
}

/** 슬롯 다이스 3개 → 면 스티커 3중 1 */
export function offerFaces(ctx: Ctx, then: RunState['screen']) {
  const opts: RewardOption[] = [];
  for (let i = 0; i < 3; i++) {
    const id = rollItemId(ctx, 'face', rollRarity(ctx, 'common'), 'loot', opts.map((o) => o.id));
    if (id) opts.push({ kind: 'face', id });
  }
  ctx.run.offer = { title: '면 스티커 선택', options: opts, then };
}

export function useConsumableOutside(ctx: Ctx, idx: number): boolean {
  const run = ctx.run;
  const id = run.consumables[idx];
  const def = CONSUMABLE_BY_ID[id];
  if (!def || def.when !== 'any' || !def.use) return false;
  const ok = def.use(ctx);
  if (ok) run.consumables.splice(idx, 1);
  return ok;
}

export function giveStartingRelic(ctx: Ctx, id: string) {
  giveRelic(ctx, id);
}

export function flowBand(run: RunState) {
  return band(run.dda.flow);
}

export { HIGHROLLER };

/** 클리어 후 엔드리스로 계속: 4막부터 점점 세지는 막 */
export function continueEndless(ctx: Ctx) {
  const run = ctx.run;
  if (run.screen !== 'victory') return;
  run.flags.endless = 1;
  nextAct(ctx);
  offerAugment(ctx, 'boss', 'map');
}
