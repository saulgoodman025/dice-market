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
  { id: 'crit', name: '크리티컬', emoji: '★', rarity: 'common', kind: 'attr', desc: '이 주사위로 쓴 스킬 ×{m}', v: { m: 2 }, powerMult: 2, jackpotOnUse: 5 },
  { id: 'gold', name: '금화', emoji: '🪙', rarity: 'common', kind: 'attr', desc: '나오면 +{g}골드', v: { g: 5 }, onFinal: (ctx) => gainGold(ctx, 5) },
  { id: 'shield', name: '방패 문양', emoji: '🛡', rarity: 'common', kind: 'attr', desc: '나오면 방어 +{b}', v: { b: 5 }, onFinal: (ctx) => gainBlock(ctx, 5) },
  { id: 'heart', name: '하트', emoji: '❤', rarity: 'common', kind: 'attr', desc: '나오면 체력 +{h}', v: { h: 3 }, onFinal: (ctx) => healPlayer(ctx, 3) },
  {
    id: 'bolt', name: '번개', emoji: '⚡', rarity: 'common', kind: 'attr', desc: '나오면 적에게 {d} 피해', v: { d: 5 },
    onFinal: (ctx) => { const e = randomEnemy(ctx); if (e) damageEnemy(ctx, e, 5, { source: '번개' }); },
  },
  { id: 'reroll', name: '리롤', emoji: '🔄', rarity: 'common', kind: 'attr', desc: '나오면 리롤 +1', onRolled: (ctx) => { cbOf(ctx).rerollsLeft++; } },
  { id: 'chip', name: '칩', emoji: '🎰', rarity: 'common', kind: 'attr', desc: '나오면 칩 +1', onFinal: (ctx) => gainChips(ctx, 1) },
  { id: 'jackpot', name: '잭팟', emoji: '💰', rarity: 'rare', kind: 'attr', desc: '나오면 잭팟 +{j}%', v: { j: 15 }, onFinal: (ctx) => addJackpot(ctx, 15) },
  { id: 'seven', name: '세븐', emoji: '7', rarity: 'rare', kind: 'replace', desc: '눈 7 (스트레이트엔 못 씀)', pip: 7 },
  { id: 'zero', name: '제로', emoji: '0', rarity: 'rare', kind: 'replace', desc: '눈 0 · 저금통 ×{m}', v: { m: 1.3 }, pip: 0, piggyMult: 1.3 },
  { id: 'wild', name: '와일드', emoji: '🃏', rarity: 'rare', kind: 'replace', desc: '족보에서 아무 눈 · 스킬엔 6', pip: 6, wild: true },
  {
    id: 'clone', name: '복제', emoji: '👥', rarity: 'rare', kind: 'attr', desc: '나오면 이번 턴 복사본 +1',
    onRolled: (ctx, hd) => {
      const cb = cbOf(ctx);
      if (cb.turnCounters['clone_' + hd.key]) return;
      cb.turnCounters['clone_' + hd.key] = 1;
      cb.hand.push({ ...hd, key: cb.nextKey++, dieIdx: -1, temp: true, sticker: undefined, locked: false, used: false, rolledFx: true });
    },
  },
  { id: 'magnet', name: '자석', emoji: '🧲', rarity: 'rare', kind: 'attr', desc: '족보에서 다른 주사위 눈으로', magnet: true },
  {
    id: 'fire', name: '불꽃', emoji: '🔥', rarity: 'rare', kind: 'attr', desc: '공격 시 독 {n}', v: { n: 3 },
    onUse: (u) => { const cb = cbOf(u.ctx); const t = alive(cb).find((e) => e.uid === cb.target) ?? alive(cb)[0]; if (t) t.poison += 3; },
  },
  {
    id: 'ice', name: '얼음', emoji: '❄', rarity: 'rare', kind: 'attr', desc: '쓰면 적 다음 공격 -{n}', v: { n: 3 },
    onUse: (u) => { for (const e of alive(cbOf(u.ctx))) e.weak += 3; },
  },
  { id: 'mirror', name: '거울', emoji: '🪞', rarity: 'epic', kind: 'replace', desc: '가장 높은 다른 눈을 복사', pip: 1, mirror: true },
  {
    id: 'bomb', name: '폭탄', emoji: '💣', rarity: 'epic', kind: 'attr', desc: '쓰면 모든 적 {d} 피해 (1회용)', v: { d: 8 },
    onUse: (u) => {
      const cb = cbOf(u.ctx);
      for (const e of alive(cb)) damageEnemy(u.ctx, e, 8, { source: '폭탄 면' });
      if (u.hd.dieIdx >= 0) cb.brokenDice.push(u.hd.dieIdx);
    },
  },
  {
    id: 'skull', name: '해골', emoji: '💀', rarity: 'epic', kind: 'attr', desc: '나오면 체력 -{s} · 3개면 모든 적 {d}', v: { s: 3, d: 50 }, cursed: true,
    onFinal: (ctx) => {
      const cb = cbOf(ctx);
      damagePlayer(ctx, 3, '해골 면', { ignoreBlock: true });
      cb.turnCounters.skull = (cb.turnCounters.skull ?? 0) + 1;
      if (cb.turnCounters.skull === 3) for (const e of alive(cb)) damageEnemy(ctx, e, 50, { source: '해골 3개' });
    },
  },
  {
    id: 'clover', name: '클로버', emoji: '🍀', rarity: 'epic', kind: 'attr', desc: '나오면 다른 주사위 1개 무료 리롤',
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
  { id: 'crown', name: '왕관', emoji: '👑', rarity: 'legendary', kind: 'replace', desc: '눈 6 · 족보 배율 +{m}', v: { m: 1.0 }, pip: 6, handMultAdd: 1.0 },
];

export const FACE_BY_ID = Object.fromEntries(FACES.map((f) => [f.id, f])) as Record<string, FaceDef>;
