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
  cost: number; // 🔶 족보 칩 비용
  keepDie?: boolean; // 주사위를 바꾸기만 하고 소모하지 않음
  icon: string; // 카드 그림
  target?: 'enemy'; // 적 하나를 골라 쓰는 스킬 (없으면 화면에 놓기만 하면 발동)
  chance?: boolean; // 결과가 운에 달려 미리보기 불가
  chanceHit?: (pip: number) => number; // 운이 따랐을 때 기본 피해 (강화 미리보기용)
  sampleBlock?: number; // 강화 미리보기 때 가정할 방어도
  echo?: boolean; // 직전 스킬 반복
  primesDouble?: boolean; // 다음 스킬 ×2 준비 (자신에겐 미적용)
  run: (u: SkillUse) => void;
}

export const SKILLS: SkillDef[] = [
  // ── C ──
  { id: 'slash', name: '베기', cost: 1, icon: '🗡️', target: 'enemy', rarity: 'common', cond: { k: 'any' }, desc: '적에게 주사위 눈만큼 피해를 줍니다.', role: 'atk', run: (u) => { u.dmg(u.v); } },
  { id: 'guard', name: '방패', cost: 1, icon: '🛡️', rarity: 'common', cond: { k: 'any' }, desc: '주사위 눈만큼 방어도를 얻습니다.', role: 'def', run: (u) => u.block(u.v) },
  { id: 'jab', name: '잽', cost: 1, icon: '👊', target: 'enemy', rarity: 'common', cond: { k: 'range', lo: 1, hi: 3 }, desc: '적에게 눈의 {m}배만큼 피해를 줍니다.', v: { m: 2 }, role: 'atk', run: (u) => { u.dmg(u.v * 2); } },
  { id: 'heavy', name: '강타', cost: 1, icon: '🔨', target: 'enemy', rarity: 'common', cond: { k: 'range', lo: 4, hi: 6 }, desc: '적에게 눈의 {m}배만큼 피해를 줍니다.', v: { m: 2 }, role: 'atk', run: (u) => { u.dmg(u.v * 2); } },
  { id: 'firstaid', name: '응급처치', cost: 1, icon: '🩹', rarity: 'common', cond: { k: 'any' }, desc: '눈의 절반만큼 체력을 회복합니다. (전투당 {n}번)', v: { n: 2 }, perCombat: 2, role: 'def', run: (u) => u.heal(Math.ceil(u.v / 2)) },
  { id: 'coinflip', name: '동전 던지기', cost: 0, icon: '🪙', target: 'enemy', rarity: 'common', cond: { k: 'any' }, desc: '눈만큼 골드를 얻고, 그 절반만큼 피해를 줍니다.', role: 'eco', run: (u) => { u.gold(u.v); u.dmg(Math.ceil(u.v / 2)); } },
  { id: 'twin', name: '쌍검', cost: 1, icon: '⚔️', target: 'enemy', rarity: 'common', cond: { k: 'same', n: 2 }, desc: '두 눈의 합 × {m}만큼 피해를 줍니다.', v: { m: 2 }, role: 'atk', run: (u) => { u.dmg(u.sum * 2); } },
  { id: 'evenstab', name: '짝수 찌르기', cost: 1, icon: '🔱', target: 'enemy', rarity: 'common', cond: { k: 'even' }, desc: '적에게 눈 + {a}만큼 피해를 줍니다.', v: { a: 4 }, role: 'atk', run: (u) => { u.dmg(u.v + 4); } },
  { id: 'oddcut', name: '홀수 베기', cost: 1, icon: '🌀', rarity: 'common', cond: { k: 'odd' }, desc: '무작위 적에게 눈 + {a}만큼 피해를 줍니다.', v: { a: 3 }, role: 'atk', run: (u) => { u.dmg(u.v + 3, { random: true }); } },
  { id: 'thorns', name: '가시방패', cost: 1, icon: '🌵', rarity: 'common', cond: { k: 'any' }, desc: '눈만큼 방어도를 얻습니다. 이번 턴에 공격받으면 {r} 피해를 되돌려줍니다.', v: { r: 3 }, role: 'def', run: (u) => { u.block(u.v); cbOf(u.ctx).thorns += 3; } },
  // ── R ──
  { id: 'execute', name: '처형', cost: 2, icon: '🪓', target: 'enemy', rarity: 'rare', cond: { k: 'exact', v: 6 }, desc: '적에게 {d}의 피해를 줍니다.', v: { d: 18 }, role: 'atk', run: (u) => { u.dmg(18 * (u.vals[0] / 6)); } },
  {
    id: 'gamble', name: '도박사', cost: 0, icon: '🎲', target: 'enemy', rarity: 'rare', chance: true, chanceHit: () => 30, cond: { k: 'range', lo: 1, hi: 2 }, desc: '주사위를 다시 굴립니다. 6이 나오면 {d} 피해! 아니면 아무 일도 없습니다.', v: { d: 30 }, role: 'atk',
    run: (u) => {
      const r = rng(u.ctx, 'combat').die();
      u.ctx.emit({ t: 'chanceRoll', kind: 'die', result: r, win: r === 6, label: '6이 나오면 30 피해!' });
      if (r === 6) u.dmg(30);
    },
  },
  { id: 'straight', name: '스트레이트', cost: 2, icon: '🎳', rarity: 'rare', cond: { k: 'seq', n: 4 }, desc: '모든 적에게 {d}의 피해를 줍니다.', v: { d: 25 }, role: 'atk', run: (u) => { u.dmg(25, { aoe: true }); } },
  { id: 'triple', name: '삼연격', cost: 2, icon: '🐾', target: 'enemy', rarity: 'rare', cond: { k: 'same', n: 3 }, desc: '눈 × 3의 피해를 3번 줍니다.', role: 'atk', run: (u) => { u.dmg(u.v * 3, { hits: 3 }); } },
  {
    id: 'vampire', name: '흡혈', cost: 1, icon: '🧛', target: 'enemy', rarity: 'rare', cond: { k: 'any' }, desc: '눈만큼 피해를 주고, 준 피해의 절반만큼 회복합니다.', v: { p: 50 }, role: 'atk',
    run: (u) => { const d = u.dmg(u.v); u.heal(d * 0.5); },
  },
  {
    id: 'poison', name: '독침', cost: 1, icon: '🦂', target: 'enemy', rarity: 'rare', cond: { k: 'any' }, desc: '적을 눈만큼 중독시킵니다. 중독된 적은 매 턴 독만큼 피해를 받고, 독은 1씩 줄어듭니다.', role: 'atk',
    run: (u) => { const cb = cbOf(u.ctx); const t = cb.enemies.find((e) => e.uid === cb.target && e.hp > 0) ?? cb.enemies.find((e) => e.hp > 0); if (t) t.poison += Math.round(u.v * u.power); },
  },
  { id: 'bash', name: '방패치기', cost: 1, icon: '🧱', target: 'enemy', rarity: 'rare', sampleBlock: 10, cond: { k: 'any' }, desc: '현재 방어도만큼 피해를 줍니다.', role: 'atk', run: (u) => { const cb = cbOf(u.ctx); u.dmg(cb.block + cb.keepBlock); } },
  { id: 'invest', name: '투자', cost: 0, icon: '📈', rarity: 'rare', cond: { k: 'any' }, desc: '저금통에 눈의 {m}배를 넣습니다.', v: { m: 2 }, role: 'eco', run: (u) => u.piggy(u.v * 2) },
  { id: 'lucky7', name: '럭키 세븐', cost: 1, icon: '🍀', target: 'enemy', rarity: 'rare', cond: { k: 'sumPair', v: 7 }, desc: '{d}의 피해를 주고 골드를 {g} 얻습니다.', v: { d: 21, g: 7 }, role: 'atk', run: (u) => { u.dmg(21); u.gold(7); } },
  {
    id: 'split', name: '분할', cost: 0, icon: '✂️', rarity: 'rare', cond: { k: 'range', lo: 4, hi: 6 }, desc: '주사위를 둘로 쪼개 돌려받습니다. (6 → 3+3)', role: 'util', noEcho: true,
    run: (u) => { const p = u.dice[0].pip; const a = Math.ceil(p / 2); u.ret = [a, p - a]; },
  },
  { id: 'bump', name: '올리기', cost: 0, icon: '⬆️', rarity: 'rare', cond: { k: 'range', lo: 1, hi: 5 }, desc: '눈을 1 올려서 돌려받습니다.', role: 'util', noEcho: true, run: (u) => { u.ret = [u.dice[0].pip + 1]; } },
  { id: 'flip', name: '뒤집기', cost: 0, icon: '🔄', rarity: 'rare', cond: { k: 'any' }, desc: '주사위를 뒤집어 돌려받습니다. (1↔6, 2↔5, 3↔4)', role: 'util', noEcho: true, run: (u) => { u.ret = [Math.max(1, Math.min(6, 7 - u.dice[0].pip))]; } },
  // ── E ──
  {
    id: 'allin', name: '올인', cost: 2, icon: '💥', target: 'enemy', rarity: 'epic', cond: { k: 'all' }, desc: '남은 주사위를 모두 써서 합 × {m}의 피해를 줍니다. 합이 {t} 미만이면 저금통 절반을 잃습니다.', v: { m: 3, t: 15 }, role: 'atk',
    run: (u) => {
      u.dmg(u.sum * 3);
      const raw = u.dice.reduce((s, d) => s + d.pip, 0);
      if (raw < 15) { const cb = cbOf(u.ctx); cb.piggy = Math.floor(cb.piggy / 2); u.ctx.emit({ t: 'toast', text: '올인 실패: 저금통 절반 몰수', tone: 'bad' }); }
    },
  },
  {
    id: 'doubledown', name: '더블다운', cost: 1, icon: '✖️', rarity: 'epic', cond: { k: 'any' }, desc: '이번 턴에 다음으로 쓰는 카드의 효과가 2배가 됩니다. 쓰지 않으면 눈만큼 피해를 입습니다.', role: 'util', noEcho: true, primesDouble: true,
    run: (u) => { cbOf(u.ctx).doubledown = u.dice[0].pip; },
  },
  {
    id: 'roulette', name: '룰렛 베팅', cost: 1, icon: '🎡', target: 'enemy', rarity: 'epic', chance: true, chanceHit: (p) => p * 5, cond: { k: 'any' }, desc: '룰렛을 돌립니다. 적중하면 눈 × {m}의 피해! 0이 나오면 잭팟 게이지가 가득 찹니다.', v: { m: 5 }, role: 'atk',
    run: (u) => {
      const n = rng(u.ctx, 'combat').int(0, 36);
      u.ctx.emit({ t: 'chanceRoll', kind: 'roulette', result: n, win: n <= 18, label: n === 0 ? '0! 잭팟 100%' : '1~18이면 적중' });
      if (n === 0) addJackpot(u.ctx, 100);
      else if (n <= 18) u.dmg(u.v * 5);
    },
  },
  {
    id: 'chain', name: '연쇄 번개', cost: 2, icon: '⚡', rarity: 'epic', cond: { k: 'any' }, desc: '모든 적에게 눈 + (이번 턴에 쓴 주사위 수 × 2)의 피해를 줍니다.', role: 'atk',
    run: (u) => { u.dmg(u.v + cbOf(u.ctx).diceUsedThisTurn * 2, { aoe: true }); },
  },
  {
    id: 'fortress', name: '요새', cost: 2, icon: '🏰', rarity: 'epic', cond: { k: 'sumMin', n: 3, min: 15 }, desc: '방어도를 {b} 얻습니다. 이 방어도는 다음 턴까지 남습니다.', v: { t: 15, b: 25 }, role: 'def',
    run: (u) => { const cb = cbOf(u.ctx); const b = Math.round(25 * u.power * (cb.handResult?.mult ?? 1)); cb.keepBlock += b; u.ctx.emit({ t: 'block', amount: b }); },
  },
  { id: 'echo', name: '메아리', cost: 1, icon: '🔁', rarity: 'epic', cond: { k: 'any' }, desc: '직전에 쓴 카드를 이 주사위로 한 번 더 씁니다.', role: 'util', noEcho: true, echo: true, run: () => { /* combat.ts에서 처리 */ } },
  {
    id: 'reload', name: '재장전', cost: 0, icon: '🔃', rarity: 'epic', cond: { k: 'any' }, desc: '리롤을 1번 더 얻고, 주사위를 돌려받습니다. (턴당 1번)', perTurn: 1, role: 'util', noEcho: true,
    run: (u) => { const cb = cbOf(u.ctx); cb.rerollsLeft++; cb.phase = 'roll'; u.ret = [u.dice[0].pip]; },
  },
  // ── L ──
  {
    id: 'yahtzeehammer', name: '야찌 해머', cost: 1, icon: '🌟', target: 'enemy', rarity: 'legendary', cond: { k: 'same', n: 5 }, desc: '{d}의 피해를 주고 잭팟 게이지를 가득 채웁니다.', v: { d: 100 }, role: 'atk',
    run: (u) => { u.dmg(100); addJackpot(u.ctx, 100); },
  },
  {
    id: 'midas', name: '미다스의 손', cost: 1, icon: '👑', rarity: 'legendary', cond: { k: 'any' }, desc: '저금통을 {m}배로 불립니다. (전투당 1번)', v: { m: 1.5 }, perCombat: 1, role: 'eco',
    run: (u) => { const cb = cbOf(u.ctx); cb.piggy = Math.round(cb.piggy * 1.5 + u.v); },
  },
  {
    id: 'fate', name: '운명 조작', cost: 1, icon: '🔮', rarity: 'legendary', cond: { k: 'any' }, desc: '다른 주사위 하나를 원하는 눈으로 바꿉니다. 이 주사위는 돌려받습니다.', role: 'util', needsChoice: true, noEcho: true, keepDie: true,
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
    case 'even': return '짝수 눈';
    case 'odd': return '홀수 눈';
    case 'exact': return `${c.v}만`;
    case 'same': return `같은 눈 ${c.n}개`;
    case 'seq': return `연속 ${c.n}개`;
    case 'sumPair': return `합 ${c.v} (2개)`;
    case 'sumMin': return `3개 합 ${c.min}+`;
    case 'all': return '남은 전부';
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
