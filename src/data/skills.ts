import type { HandDie, Rarity } from '../core/state';
import { rng, type Ctx } from '../rules/ctx';
import { addJackpot, cbOf, damagePlayer } from '../rules/ops';

export type Cond =
  | { k: 'any' }
  | { k: 'range'; lo: number; hi: number }
  | { k: 'even' }
  | { k: 'odd' }
  | { k: 'exact'; v: number }
  | { k: 'same'; n: number }
  | { k: 'seq'; n: number }
  | { k: 'sumPair'; v: number }
  | { k: 'sumMin'; n: number; min: number }
  | { k: 'all' };

export interface SkillUse {
  ctx: Ctx;
  slot: number;
  dice: HandDie[];
  vals: number[]; // 효과 계산용 값
  v: number; // 첫 주사위 값
  sum: number;
  power: number;
  /** 피해 (족보 배율·열기·배율 적용). 반환: 실제 준 피해 합 */
  dmg: (base: number, opts?: { aoe?: boolean; random?: boolean; hits?: number; flat?: boolean }) => number;
  block: (base: number) => void;
  gold: (base: number) => void;
  heal: (base: number) => void;
  piggy: (base: number) => void;
  /** 손으로 돌려보낼 주사위 눈 목록 */
  ret: number[] | null;
  choice?: { key: number; value: number };
}

export interface SkillDef {
  id: string;
  name: string;
  rarity: Rarity;
  cond: Cond;
  desc: string;
  v?: Record<string, number>;
  role: 'atk' | 'def' | 'eco' | 'util';
  perTurn?: number;
  perCombat?: number;
  needsChoice?: boolean; // 다른 주사위와 눈 선택 필요 (운명 조작)
  noEcho?: boolean;
  echo?: boolean; // 직전 스킬 반복
  primesDouble?: boolean; // 다음 스킬 ×2 준비 (자신에겐 미적용)
  run: (u: SkillUse) => void;
}

export const SKILLS: SkillDef[] = [
  // ── C ──
  { id: 'slash', name: '베기', rarity: 'common', cond: { k: 'any' }, desc: '피해 = 눈', role: 'atk', run: (u) => { u.dmg(u.v); } },
  { id: 'guard', name: '방패', rarity: 'common', cond: { k: 'any' }, desc: '방어 = 눈', role: 'def', run: (u) => u.block(u.v) },
  { id: 'jab', name: '잽', rarity: 'common', cond: { k: 'range', lo: 1, hi: 3 }, desc: '피해 = 눈×{m}', v: { m: 2 }, role: 'atk', run: (u) => { u.dmg(u.v * 2); } },
  { id: 'heavy', name: '강타', rarity: 'common', cond: { k: 'range', lo: 4, hi: 6 }, desc: '피해 = 눈×{m}', v: { m: 2 }, role: 'atk', run: (u) => { u.dmg(u.v * 2); } },
  { id: 'firstaid', name: '응급처치', rarity: 'common', cond: { k: 'any' }, desc: '회복 = 눈÷2(올림). 전투당 {n}회', v: { n: 2 }, perCombat: 2, role: 'def', run: (u) => u.heal(Math.ceil(u.v / 2)) },
  { id: 'coinflip', name: '동전 던지기', rarity: 'common', cond: { k: 'any' }, desc: '골드 +눈, 피해 = 눈÷2', role: 'eco', run: (u) => { u.gold(u.v); u.dmg(Math.ceil(u.v / 2)); } },
  { id: 'twin', name: '쌍검', rarity: 'common', cond: { k: 'same', n: 2 }, desc: '같은 눈 2개: 피해 = 합×{m}', v: { m: 2 }, role: 'atk', run: (u) => { u.dmg(u.sum * 2); } },
  { id: 'evenstab', name: '짝수 찌르기', rarity: 'common', cond: { k: 'even' }, desc: '피해 = 눈+{a}', v: { a: 4 }, role: 'atk', run: (u) => { u.dmg(u.v + 4); } },
  { id: 'oddcut', name: '홀수 베기', rarity: 'common', cond: { k: 'odd' }, desc: '무작위 적에게 피해 = 눈+{a}', v: { a: 3 }, role: 'atk', run: (u) => { u.dmg(u.v + 3, { random: true }); } },
  { id: 'thorns', name: '가시방패', rarity: 'common', cond: { k: 'any' }, desc: '방어 = 눈, 이번 턴 반사 {r}', v: { r: 3 }, role: 'def', run: (u) => { u.block(u.v); cbOf(u.ctx).thorns += 3; } },
  // ── R ──
  { id: 'execute', name: '처형', rarity: 'rare', cond: { k: 'exact', v: 6 }, desc: '6: 피해 {d}', v: { d: 18 }, role: 'atk', run: (u) => { u.dmg(18 * (u.vals[0] / 6)); } },
  {
    id: 'gamble', name: '도박사', rarity: 'rare', cond: { k: 'range', lo: 1, hi: 2 }, desc: '재굴림: 6이면 피해 {d}, 아니면 0 (확률 16.7%)', v: { d: 30 }, role: 'atk',
    run: (u) => {
      const r = rng(u.ctx, 'combat').die();
      u.ctx.emit({ t: 'toast', text: `🎲 도박사 재굴림: ${r}${r === 6 ? ' — 명중!' : ''}`, tone: r === 6 ? 'gold' : 'info' });
      if (r === 6) u.dmg(30);
    },
  },
  { id: 'straight', name: '스트레이트', rarity: 'rare', cond: { k: 'seq', n: 4 }, desc: '연속 4개: 모든 적 피해 {d}', v: { d: 25 }, role: 'atk', run: (u) => { u.dmg(25, { aoe: true }); } },
  { id: 'triple', name: '삼연격', rarity: 'rare', cond: { k: 'same', n: 3 }, desc: '같은 눈 3개: 눈×3 피해를 3회', role: 'atk', run: (u) => { u.dmg(u.v * 3, { hits: 3 }); } },
  {
    id: 'vampire', name: '흡혈', rarity: 'rare', cond: { k: 'any' }, desc: '피해 = 눈, 준 피해의 {p}% 회복', v: { p: 50 }, role: 'atk',
    run: (u) => { const d = u.dmg(u.v); u.heal(d * 0.5); },
  },
  {
    id: 'poison', name: '독침', rarity: 'rare', cond: { k: 'any' }, desc: '독 = 눈 (매 턴 독만큼 피해, 1씩 감소)', role: 'atk',
    run: (u) => { const cb = cbOf(u.ctx); const t = cb.enemies.find((e) => e.uid === cb.target && e.hp > 0) ?? cb.enemies.find((e) => e.hp > 0); if (t) t.poison += Math.round(u.v * u.power); },
  },
  { id: 'bash', name: '방패치기', rarity: 'rare', cond: { k: 'any' }, desc: '피해 = 현재 방어도', role: 'atk', run: (u) => { const cb = cbOf(u.ctx); u.dmg(cb.block + cb.keepBlock); } },
  { id: 'invest', name: '투자', rarity: 'rare', cond: { k: 'any' }, desc: '저금통 +눈×{m}', v: { m: 2 }, role: 'eco', run: (u) => u.piggy(u.v * 2) },
  { id: 'lucky7', name: '럭키 세븐', rarity: 'rare', cond: { k: 'sumPair', v: 7 }, desc: '합 7인 주사위 2개: 피해 {d}, 골드 +{g}', v: { d: 21, g: 7 }, role: 'atk', run: (u) => { u.dmg(21); u.gold(7); } },
  {
    id: 'split', name: '분할', rarity: 'rare', cond: { k: 'range', lo: 4, hi: 6 }, desc: '주사위를 둘로 나눠 손으로 반환 (6→3+3, 5→3+2, 4→2+2)', role: 'util', noEcho: true,
    run: (u) => { const p = u.dice[0].pip; const a = Math.ceil(p / 2); u.ret = [a, p - a]; },
  },
  { id: 'bump', name: '올리기', rarity: 'rare', cond: { k: 'range', lo: 1, hi: 5 }, desc: '눈 +1 후 손으로 반환', role: 'util', noEcho: true, run: (u) => { u.ret = [u.dice[0].pip + 1]; } },
  { id: 'flip', name: '뒤집기', rarity: 'rare', cond: { k: 'any' }, desc: '눈 → 7-눈 후 손으로 반환', role: 'util', noEcho: true, run: (u) => { u.ret = [Math.max(1, Math.min(6, 7 - u.dice[0].pip))]; } },
  // ── E ──
  {
    id: 'allin', name: '올인', rarity: 'epic', cond: { k: 'all' }, desc: '남은 주사위 전부: 피해 = 합×{m}. 합 < {t}이면 저금통 절반 몰수', v: { m: 3, t: 15 }, role: 'atk',
    run: (u) => {
      u.dmg(u.sum * 3);
      const raw = u.dice.reduce((s, d) => s + d.pip, 0);
      if (raw < 15) { const cb = cbOf(u.ctx); cb.piggy = Math.floor(cb.piggy / 2); u.ctx.emit({ t: 'toast', text: '올인 실패: 저금통 절반 몰수', tone: 'bad' }); }
    },
  },
  {
    id: 'doubledown', name: '더블다운', rarity: 'epic', cond: { k: 'any' }, desc: '이번 턴 다음 스킬 효과 ×2. 다음 스킬이 없으면 체력 -눈', role: 'util', noEcho: true, primesDouble: true,
    run: (u) => { cbOf(u.ctx).doubledown = u.dice[0].pip; },
  },
  {
    id: 'roulette', name: '룰렛 베팅', rarity: 'epic', cond: { k: 'any' }, desc: '미니 룰렛: 48.6% 피해 눈×{m}, 2.7% 잭팟 100%, 48.6% 꽝', v: { m: 5 }, role: 'atk',
    run: (u) => {
      const n = rng(u.ctx, 'combat').int(0, 36);
      if (n === 0) { addJackpot(u.ctx, 100); u.ctx.emit({ t: 'toast', text: '룰렛 0! 잭팟 100%', tone: 'gold' }); }
      else if (n <= 18) { u.ctx.emit({ t: 'toast', text: `룰렛 ${n} — 적중!`, tone: 'gold' }); u.dmg(u.v * 5); }
      else u.ctx.emit({ t: 'toast', text: `룰렛 ${n} — 빗나감`, tone: 'bad' });
    },
  },
  {
    id: 'chain', name: '연쇄 번개', rarity: 'epic', cond: { k: 'any' }, desc: '모든 적 피해 = 눈 + 이번 턴 사용한 주사위 수×2', role: 'atk',
    run: (u) => { u.dmg(u.v + cbOf(u.ctx).diceUsedThisTurn * 2, { aoe: true }); },
  },
  {
    id: 'fortress', name: '요새', rarity: 'epic', cond: { k: 'sumMin', n: 3, min: 15 }, desc: '합 {t} 이상 주사위 3개: 방어 {b}, 다음 턴까지 유지', v: { t: 15, b: 25 }, role: 'def',
    run: (u) => { const cb = cbOf(u.ctx); const b = Math.round(25 * u.power * (cb.handResult?.mult ?? 1)); cb.keepBlock += b; u.ctx.emit({ t: 'block', amount: b }); },
  },
  { id: 'echo', name: '메아리', rarity: 'epic', cond: { k: 'any' }, desc: '직전 스킬을 이 눈으로 한 번 더', role: 'util', noEcho: true, echo: true, run: () => { /* combat.ts에서 처리 */ } },
  {
    id: 'reload', name: '재장전', rarity: 'epic', cond: { k: 'any' }, desc: '리롤 +1, 주사위는 손으로 반환 (턴당 1회)', perTurn: 1, role: 'util', noEcho: true,
    run: (u) => { const cb = cbOf(u.ctx); cb.rerollsLeft++; cb.phase = 'roll'; u.ret = [u.dice[0].pip]; },
  },
  // ── L ──
  {
    id: 'yahtzeehammer', name: '야찌 해머', rarity: 'legendary', cond: { k: 'same', n: 5 }, desc: '같은 눈 5개: 피해 {d}, 잭팟 100%', v: { d: 100 }, role: 'atk',
    run: (u) => { u.dmg(100); addJackpot(u.ctx, 100); },
  },
  {
    id: 'midas', name: '미다스의 손', rarity: 'legendary', cond: { k: 'any' }, desc: '저금통 ×{m} (전투당 1회)', v: { m: 1.5 }, perCombat: 1, role: 'eco',
    run: (u) => { const cb = cbOf(u.ctx); cb.piggy = Math.round(cb.piggy * 1.5 + u.v); },
  },
  {
    id: 'fate', name: '운명 조작', rarity: 'legendary', cond: { k: 'any' }, desc: '손의 다른 주사위 1개를 원하는 눈으로 변경', role: 'util', needsChoice: true, noEcho: true,
    run: () => { /* combat.ts에서 choice 처리 */ },
  },
];

export const SKILL_BY_ID = Object.fromEntries(SKILLS.map((s) => [s.id, s])) as Record<string, SkillDef>;

export function condCount(c: Cond, freeDice: number): number {
  switch (c.k) {
    case 'same': case 'seq': case 'sumMin': return c.n;
    case 'sumPair': return 2;
    case 'all': return freeDice;
    default: return 1;
  }
}

export function condText(c: Cond): string {
  switch (c.k) {
    case 'any': return '아무 눈';
    case 'range': return `${c.lo}~${c.hi}`;
    case 'even': return '짝수';
    case 'odd': return '홀수';
    case 'exact': return `${c.v}`;
    case 'same': return `같은 눈 ${c.n}개`;
    case 'seq': return `연속 ${c.n}개`;
    case 'sumPair': return `합 ${c.v}인 2개`;
    case 'sumMin': return `${c.n}개 합 ${c.min}+`;
    case 'all': return '남은 주사위 전부';
  }
}

/** pips: 선택한 주사위들의 (조건 판정용) 눈 */
export function checkCond(c: Cond, pips: number[], freeDice: number): boolean {
  if (pips.length !== condCount(c, freeDice) || pips.length === 0) return false;
  const p = pips[0];
  switch (c.k) {
    case 'any': return true;
    case 'range': return p >= c.lo && p <= c.hi;
    case 'even': return p % 2 === 0;
    case 'odd': return p % 2 === 1;
    case 'exact': return p === c.v;
    case 'same': return pips.every((x) => x === p);
    case 'seq': {
      const s = [...pips].sort((a, b) => a - b);
      return s.every((x, i) => i === 0 || x === s[i - 1] + 1);
    }
    case 'sumPair': return pips[0] + pips[1] === c.v;
    case 'sumMin': return pips.reduce((a, b) => a + b, 0) >= c.min;
    case 'all': return true;
  }
}

export { damagePlayer };
