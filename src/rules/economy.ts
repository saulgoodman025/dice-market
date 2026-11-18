import type { Rarity, RewardOption, RunState } from '../core/state';
import { RARITIES } from '../core/state';
import { BALANCE } from '../data/balance';
import { CONSUMABLES, CONSUMABLE_BY_ID } from '../data/consumables';
import { FACES, FACE_BY_ID } from '../data/faces';
import { MATERIALS, MATERIAL_BY_ID } from '../data/materials';
import { RELICS, RELIC_BY_ID } from '../data/relics';
import { CARDS, CARD_BY_ID, isPoolCard } from '../data/cards';
import { COMBOS } from '../data/sets';
import { fire, getMods, rng, toast, type Ctx } from './ctx';
import { ddaRarityBonus } from './dda';
import { addConsumable, gainGold } from './ops';

export type ItemKind = RewardOption['kind'];

export function interestFor(run: RunState): number {
  const m = getMods(run);
  const unit = Math.max(1, BALANCE.interestUnit + m.interestUnit);
  const cap = Math.max(0, BALANCE.interestCap + m.interestCap);
  return Math.min(cap, Math.floor(run.gold / unit));
}

/** 상점/보상 등급 가중치 (막 이동 + DDA 보정 포함, 표시 확률 아님) */
export function rarityWeights(run: RunState, useDda = true): Record<Rarity, number> {
  const w = { ...BALANCE.rarityWeights };
  const shift = BALANCE.rarityShiftPerAct * (run.act - 1);
  w.rare += shift;
  w.epic += shift;
  w.legendary += shift;
  w.common -= shift * 3;
  if (useDda) {
    const b = ddaRarityBonus(run);
    w.rare += b * 0.5;
    w.epic += b * 0.33;
    w.legendary += b * 0.17;
    w.common -= b;
  }
  w.common = Math.max(5, w.common);
  return w;
}

export function rollRarity(ctx: Ctx, min: Rarity = 'common', weights?: Record<Rarity, number>): Rarity {
  const w = weights ?? rarityWeights(ctx.run);
  const minIdx = RARITIES.indexOf(min);
  const allowed = RARITIES.filter((_, i) => i >= minIdx);
  return rng(ctx, 'loot').weighted(allowed, (r) => w[r]);
}

const RARITY_FALLBACK = (r: Rarity): Rarity[] => {
  const i = RARITIES.indexOf(r);
  return [r, ...RARITIES.slice(0, i).reverse(), ...RARITIES.slice(i + 1)];
};

function poolOf(run: RunState, kind: ItemKind): { id: string; rarity: Rarity }[] {
  switch (kind) {
    case 'card': return cardPool(run).map((c) => ({ id: c.id, rarity: c.rarity as Rarity }));
    case 'relic': return RELICS.filter((r) => run.flags['pool_relic_' + r.id] !== 0 && !run.relics.includes(r.id));
    case 'face': return FACES.filter((f) => run.flags['pool_face_' + f.id] !== 0);
    case 'consumable': return CONSUMABLES;
    case 'material': return MATERIALS.filter((m) => m.inShop !== false);
  }
}

export function rollItemId(ctx: Ctx, kind: ItemKind, rarity: Rarity, stream: 'loot' | 'shop' = 'loot', exclude: string[] = []): string | null {
  const pool = poolOf(ctx.run, kind).filter((x) => !exclude.includes(x.id));
  for (const r of RARITY_FALLBACK(rarity)) {
    const c = pool.filter((x) => x.rarity === r);
    if (c.length) return rng(ctx, stream).pick(c).id;
  }
  return null;
}

export function rollOption(ctx: Ctx, kind: ItemKind, minRarity: Rarity = 'common', stream: 'loot' | 'shop' = 'loot', exclude: string[] = []): RewardOption | null {
  const r = kind === 'consumable' ? rollConsumableRarity(ctx) : rollRarity(ctx, minRarity);
  const id = rollItemId(ctx, kind, r, stream, exclude);
  return id ? ({ kind, id } as RewardOption) : null;
}

function rollConsumableRarity(ctx: Ctx): Rarity {
  return rng(ctx, 'loot').weighted(RARITIES, (r) => ({ common: 60, rare: 28, epic: 10, legendary: 2 })[r]);
}

export function itemRarity(o: RewardOption): Rarity {
  switch (o.kind) {
    case 'card': return CARD_BY_ID[o.id].rarity as Rarity;
    case 'relic': return RELIC_BY_ID[o.id].rarity;
    case 'face': return FACE_BY_ID[o.id].rarity;
    case 'consumable': return CONSUMABLE_BY_ID[o.id].rarity;
    case 'material': return MATERIAL_BY_ID[o.id].rarity;
  }
}

export function itemName(o: RewardOption): string {
  switch (o.kind) {
    case 'card': return CARD_BY_ID[o.id].name;
    case 'relic': return RELIC_BY_ID[o.id].name;
    case 'face': return FACE_BY_ID[o.id].name + ' 면';
    case 'consumable': return CONSUMABLE_BY_ID[o.id].name;
    case 'material': return MATERIAL_BY_ID[o.id].name + ' 재질';
  }
}

export function basePrice(run: RunState, o: RewardOption): number {
  const r = itemRarity(o);
  let p: number;
  if (o.kind === 'consumable') p = CONSUMABLE_BY_ID[o.id].price;
  else p = BALANCE.prices[o.kind][r];
  const m = getMods(run);
  return Math.max(1, Math.round(p * (1 - m.shopDiscount) * (1 + m.shopPricePct)));
}

/** 아이템 획득. 선택이 필요한 경우 run.pending 설정 */
export function acquire(ctx: Ctx, o: RewardOption, then: RunState['screen']): void {
  const run = ctx.run;
  switch (o.kind) {
    case 'card':
      addCard(ctx, o.id);
      break;
    case 'relic':
      giveRelic(ctx, o.id);
      break;
    case 'face': {
      // 면 스티커는 고르기만 하면 무작위 면에 자동으로 붙고, 붙은 위치를 보여준다
      const at = attachFaceRandom(ctx, o.id);
      if (at) run.pending = { kind: 'faceShow', id: o.id, ...at, then };
      break;
    }
    case 'material':
      run.pending = { kind: 'material', id: o.id, then };
      break;
    case 'consumable':
      addConsumable(ctx, o.id);
      break;
  }
}

export function giveRelic(ctx: Ctx, id: string) {
  const run = ctx.run;
  if (run.relics.includes(id)) {
    gainGold(ctx, 15);
    return;
  }
  run.relics.push(id);
  const def = RELIC_BY_ID[id];
  toast(ctx, `${def.emoji} 유물 「${def.name}」 획득`, def.rarity === 'legendary' ? 'gold' : 'good');
  def.hooks?.onAcquire?.(ctx, {});
  run.flags['seen_relic_' + id] = 1;
}

export function randomRelic(ctx: Ctx, min: Rarity): string | null {
  return rollItemId(ctx, 'relic', rollRarity(ctx, min));
}

export function relicOfRarity(ctx: Ctx, r: Rarity): string | null {
  return rollItemId(ctx, 'relic', r);
}

export function onNodeMove(ctx: Ctx) {
  const i = interestFor(ctx.run);
  if (i > 0) {
    gainGold(ctx, i);
    toast(ctx, `이자 +${i}G`, 'gold');
  }
  fire(ctx, 'onNodeMove');
}

// ───────────── 카드 ─────────────
/** 이 판에서 보상·상점에 나올 수 있는 카드 (공용 + 내 캐릭터 전용, 메타 해금 반영) */
export function cardPool(run: RunState, owner?: 'common' | 'char') {
  return CARDS.filter((c) => isPoolCard(c)
    && (c.owner === 'common' || c.owner === run.charId)
    && (owner === undefined || (owner === 'common' ? c.owner === 'common' : c.owner === run.charId))
    && run.flags['pool_card_' + c.id] !== 0);
}

let deckListener: ((ctx: Ctx) => void) | null = null;
/** 덱이 바뀔 때 부를 함수 등록 (태그·콤보 갱신) */
export function onDeckChange(fn: (ctx: Ctx) => void) { deckListener = fn; }
export function deckChanged(ctx: Ctx) { deckListener?.(ctx); }

export function addCard(ctx: Ctx, id: string) {
  const run = ctx.run;
  run.deck.push({ uid: run.nextUid++, id, up: null });
  const d = CARD_BY_ID[id];
  toast(ctx, `${d.icon} 「${d.name}」 카드가 덱에 들어왔다`, d.rarity === 'curse' ? 'bad' : 'good');
  deckChanged(ctx);
}

export function addCurse(ctx: Ctx, id: string) {
  addCard(ctx, id);
}

/** 카드 보상 3장: 등급 가중치(표시, DDA 미적용) + 장마다 40% 캐릭터 전용, 중복 없음 */
export function rollCardReward(ctx: Ctx, kind: 'normal' | 'elite' | 'boss'): string[] {
  const run = ctx.run;
  const r = rng(ctx, 'reward');
  const w = BALANCE.cardRewardWeights[kind];
  const out: string[] = [];
  const n = BALANCE.cardChoices + getMods(run).cardRewardChoices;
  for (let i = 0; i < n; i++) {
    const own = r.chance(BALANCE.charCardChance) ? 'char' : 'common';
    const rar = r.weighted(RARITIES, (x) => w[x]);
    const pick = (pool: ReturnType<typeof cardPool>) => {
      const free = pool.filter((c) => !out.includes(c.id));
      for (const rr of RARITY_FALLBACK(rar)) {
        const c = free.filter((x) => x.rarity === rr && (kind !== 'boss' || rr !== 'common'));
        if (c.length) return r.pick(c).id;
      }
      return null;
    };
    const id = pick(cardPool(run, own)) ?? pick(cardPool(run));
    if (id) out.push(id);
  }
  // 숨은 콤보 유도: 덱에 짝이 있는 카드가 보상 마지막 칸에 나올 확률
  if (out.length && r.chance(BALANCE.comboPartnerChance)) {
    const deck = new Set(run.deck.map((c) => c.id));
    const pool = new Set(cardPool(run).map((c) => c.id));
    const partners = COMBOS.flatMap((c) => [deck.has(c.a) ? c.b : null, deck.has(c.b) ? c.a : null])
      .filter((x): x is string => !!x && !deck.has(x) && pool.has(x) && !out.includes(x) && (kind !== 'boss' || CARD_BY_ID[x].rarity !== 'common'));
    if (partners.length) out[out.length - 1] = r.pick(partners);
  }
  return out;
}

/** 면 스티커를 무작위 면에 붙인다 (빈 면 우선, 없으면 아무 면을 덮어씀) */
export function attachFaceRandom(ctx: Ctx, id: string): { dieIdx: number; faceIdx: number; replaced?: string } | null {
  const run = ctx.run;
  const all = run.dice.flatMap((d, di) => d.faces.map((f, fi) => ({ di, fi, f })));
  if (!all.length) return null;
  const empty = all.filter((x) => !x.f.sticker);
  const pick = rng(ctx, 'loot').pick(empty.length ? empty : all);
  const replaced = pick.f.sticker;
  pick.f.sticker = id;
  run.flags['seen_face_' + id] = 1;
  toast(ctx, `${FACE_BY_ID[id].emoji} ${FACE_BY_ID[id].name} 면 → ${pick.di + 1}번 주사위 ${pick.f.pip} 면`, 'good');
  return { dieIdx: pick.di, faceIdx: pick.fi, replaced };
}
