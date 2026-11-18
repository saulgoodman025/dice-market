import type { HandDie, Rarity } from '../core/state';
import type { Ctx } from '../rules/ctx';
import { rollHandDie } from '../rules/dice';
import {
  addJackpot, alive, cbOf, damageEnemy, damagePlayer, gainBlock, gainChips, gainGold, healPlayer, randomEnemy,
} from '../rules/ops';

export interface FaceUse {
  ctx: Ctx;
  hd: HandDie;
  /** 이번 스킬 사용의 효과 배율에 곱해질 값 */
  power: { mult: number };
}

export interface FaceDef {
  id: string;
  name: string;
  emoji: string;
  rarity: Rarity;
  kind: 'attr' | 'replace';
  desc: string;
  v?: Record<string, number>;
  pip?: number; // 대체 면 눈
  wild?: boolean;
  magnet?: boolean;
  mirror?: boolean;
  handMultAdd?: number;
  powerMult?: number; // 스킬 효과 배율 (크리티컬)
  piggyMult?: number; // 저금통 배율
  cursed?: boolean; // 정화수로 제거 가능
  jackpotOnUse?: number;
  /** 굴려서 나왔을 때 (리롤 단계 즉시) */
  onRolled?: (ctx: Ctx, hd: HandDie) => void;
  /** 족보 확정 시 "나오면" 효과 */
  onFinal?: (ctx: Ctx, hd: HandDie) => void;
  /** 스킬에 사용될 때 */
  onUse?: (u: FaceUse) => void;
}

export const FACES: FaceDef[] = [
  { id: 'crit', name: '크리티컬', emoji: '★', rarity: 'common', kind: 'attr', desc: '이 면으로 쓴 카드의 효과가 {m}배가 됩니다.', v: { m: 2 }, powerMult: 2, jackpotOnUse: 5 },
  { id: 'gold', name: '금화', emoji: '🪙', rarity: 'common', kind: 'attr', desc: '이 면이 나오면 골드를 {g} 얻습니다.', v: { g: 5 }, onFinal: (ctx) => gainGold(ctx, 5) },
  { id: 'shield', name: '방패 문양', emoji: '🛡', rarity: 'common', kind: 'attr', desc: '이 면이 나오면 방어도를 {b} 얻습니다.', v: { b: 5 }, onFinal: (ctx) => gainBlock(ctx, 5) },
  { id: 'heart', name: '하트', emoji: '❤', rarity: 'common', kind: 'attr', desc: '이 면이 나오면 체력을 {h} 회복합니다.', v: { h: 3 }, onFinal: (ctx) => healPlayer(ctx, 3) },
  {
    id: 'bolt', name: '번개', emoji: '⚡', rarity: 'common', kind: 'attr', desc: '이 면이 나오면 무작위 적에게 {d} 피해를 줍니다.', v: { d: 5 },
    onFinal: (ctx) => { const e = randomEnemy(ctx); if (e) damageEnemy(ctx, e, 5, { source: '번개' }); },
  },
  { id: 'reroll', name: '리롤', emoji: '🔄', rarity: 'common', kind: 'attr', desc: '이 면이 나오면 이번 턴 리롤을 1번 더 얻습니다.', onRolled: (ctx) => { cbOf(ctx).rerollsLeft++; } },
  { id: 'chip', name: '칩', emoji: '🎰', rarity: 'common', kind: 'attr', desc: '이 면이 나오면 카지노 칩을 1 얻습니다.', onFinal: (ctx) => gainChips(ctx, 1) },
  { id: 'jackpot', name: '잭팟', emoji: '💰', rarity: 'rare', kind: 'attr', desc: '이 면이 나오면 잭팟 게이지가 {j}% 찹니다.', v: { j: 15 }, onFinal: (ctx) => addJackpot(ctx, 15) },
  { id: 'seven', name: '세븐', emoji: '7', rarity: 'rare', kind: 'replace', desc: '눈이 7이 됩니다. 스트레이트에는 쓸 수 없습니다.', pip: 7 },
  { id: 'zero', name: '제로', emoji: '0', rarity: 'rare', kind: 'replace', desc: '눈이 0이 됩니다. 저금통에 넣으면 저금통이 {m}배가 됩니다.', v: { m: 1.3 }, pip: 0, piggyMult: 1.3 },
  { id: 'wild', name: '와일드', emoji: '🃏', rarity: 'rare', kind: 'replace', desc: '족보에서는 가장 유리한 눈, 카드에 쓰면 6으로 칩니다.', pip: 6, wild: true },
  {
    id: 'clone', name: '복제', emoji: '👥', rarity: 'rare', kind: 'attr', desc: '이 면이 나오면 이번 턴에만 이 주사위의 복사본을 하나 얻습니다.',
    onRolled: (ctx, hd) => {
      const cb = cbOf(ctx);
      if (cb.turnCounters['clone_' + hd.key]) return;
      cb.turnCounters['clone_' + hd.key] = 1;
      cb.hand.push({ ...hd, key: cb.nextKey++, dieIdx: -1, temp: true, sticker: undefined, locked: false, used: false, rolledFx: true });
    },
  },
  { id: 'magnet', name: '자석', emoji: '🧲', rarity: 'rare', kind: 'attr', desc: '족보를 따질 때 다른 주사위 하나와 같은 눈으로 칩니다.', magnet: true },
  {
    id: 'fire', name: '불꽃', emoji: '🔥', rarity: 'rare', kind: 'attr', desc: '이 면으로 공격하면 적을 {n}만큼 중독시킵니다.', v: { n: 3 },
    onUse: (u) => { const cb = cbOf(u.ctx); const t = alive(cb).find((e) => e.uid === cb.target) ?? alive(cb)[0]; if (t) t.poison += 3; },
  },
  {
    id: 'ice', name: '얼음', emoji: '❄', rarity: 'rare', kind: 'attr', desc: '이 면을 쓰면 적 전체의 다음 공격이 {n} 줄어듭니다.', v: { n: 3 },
    onUse: (u) => { for (const e of alive(cbOf(u.ctx))) e.weak += 3; },
  },
  { id: 'mirror', name: '거울', emoji: '🪞', rarity: 'epic', kind: 'replace', desc: '손에서 가장 높은 다른 주사위의 눈을 따라 합니다.', pip: 1, mirror: true },
  {
    id: 'bomb', name: '폭탄', emoji: '💣', rarity: 'epic', kind: 'attr', desc: '이 면을 쓰면 모든 적에게 {d} 피해를 주고, 주사위는 이번 전투 동안 사라집니다.', v: { d: 8 },
    onUse: (u) => {
      const cb = cbOf(u.ctx);
      for (const e of alive(cb)) damageEnemy(u.ctx, e, 8, { source: '폭탄 면' });
      if (u.hd.dieIdx >= 0) cb.brokenDice.push(u.hd.dieIdx);
    },
  },
  {
    id: 'skull', name: '해골', emoji: '💀', rarity: 'epic', kind: 'attr', desc: '이 면이 나오면 체력을 {s} 잃습니다. 한 턴에 3개 나오면 모든 적에게 {d} 피해!', v: { s: 3, d: 50 }, cursed: true,
    onFinal: (ctx) => {
      const cb = cbOf(ctx);
      damagePlayer(ctx, 3, '해골 면', { ignoreBlock: true });
      cb.turnCounters.skull = (cb.turnCounters.skull ?? 0) + 1;
      if (cb.turnCounters.skull === 3) for (const e of alive(cb)) damageEnemy(ctx, e, 50, { source: '해골 3개' });
    },
  },
  {
    id: 'clover', name: '클로버', emoji: '🍀', rarity: 'epic', kind: 'attr', desc: '이 면이 나오면 가장 낮은 다른 주사위를 공짜로 다시 굴립니다.',
    onRolled: (ctx, hd) => {
      const cb = cbOf(ctx);
      const others = cb.hand.filter((h) => h.key !== hd.key && !h.used && !h.locked).sort((a, b) => a.pip - b.pip);
      const t = others[0];
      if (t) {
        rollHandDie(ctx, t);
        ctx.emit({ t: 'roll', keys: [t.key] });
      }
    },
  },
  { id: 'crown', name: '왕관', emoji: '👑', rarity: 'legendary', kind: 'replace', desc: '눈이 6이 되고, 족보가 나오면 배율이 {m} 오릅니다.', v: { m: 1.0 }, pip: 6, handMultAdd: 1.0 },
];

export const FACE_BY_ID = Object.fromEntries(FACES.map((f) => [f.id, f])) as Record<string, FaceDef>;
