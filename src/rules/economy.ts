import type { Rarity, RewardOption, RunState } from '../core/state';
import { RARITIES } from '../core/state';
import { BALANCE } from '../data/balance';
import { CONSUMABLES, CONSUMABLE_BY_ID } from '../data/consumables';
import { FACES, FACE_BY_ID } from '../data/faces';
import { MATERIALS, MATERIAL_BY_ID } from '../data/materials';
import { RELICS, RELIC_BY_ID } from '../data/relics';
import { SKILLS, SKILL_BY_ID } from '../data/skills';
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
    case 'skill': return SKILLS.filter((s) => run.flags['pool_skill_' + s.id] !== 0 && !run.skills.some((k) => k.id === s.id));
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
    case 'skill': return SKILL_BY_ID[o.id].rarity;
    case 'relic': return RELIC_BY_ID[o.id].rarity;
    case 'face': return FACE_BY_ID[o.id].rarity;
    case 'consumable': return CONSUMABLE_BY_ID[o.id].rarity;
    case 'material': return MATERIAL_BY_ID[o.id].rarity;
  }
}

export function itemName(o: RewardOption): string {
  switch (o.kind) {
    case 'skill': return SKILL_BY_ID[o.id].name;
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
    case 'skill':
      if (run.skills.length < run.maxSlots) {
        run.skills.push({ id: o.id, up: 0 });
        toast(ctx, `스킬 「${SKILL_BY_ID[o.id].name}」 획득`, 'good');
      } else {
        run.pending = { kind: 'skillReplace', id: o.id, then };
      }
      break;
    case 'relic':
      giveRelic(ctx, o.id);
      break;
    case 'face':
      run.pending = { kind: 'face', id: o.id, then };
      break;
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
