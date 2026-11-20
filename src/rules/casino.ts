// 도박 장치. 표시 확률 함수는 run의 유물/스테이크만 참조하고 DDA 상태는 절대 읽지 않는다.
import type { Rarity, RunState } from '../core/state';
import { RARITIES } from '../core/state';
import {
  DON, HIGHROLLER, MYSTERY_WEIGHTS, ROULETTE_BETS, ROULETTE_RED, ROULETTE_SINGLE_PAYOUT,
  SCRATCH_SYMBOLS, SLOT_PAY, SLOT_SYMBOLS, type RouletteBet,
} from '../data/casino';
import { BALANCE } from '../data/balance';
import { fire, getMods, rng, toast, type Ctx } from './ctx';
import { giveRelic, relicOfRarity, rollItemId } from './economy';
import { addJackpot, gainChips, gainGold, healPlayer, damagePlayer } from './ops';

export const pct = (p: number) => `${(p * 100).toFixed(1)}%`;
export const evText = (ev: number) => `기대값 ×${ev.toFixed(2)}`;

export function payoutMult(run: RunState): number {
  return Math.max(0, 1 + getMods(run).payoutEv);
}

function consumeInsurance(ctx: Ctx): boolean {
  const i = ctx.run.consumables.indexOf('insurance');
  if (i < 0) return false;
  ctx.run.consumables.splice(i, 1);
  toast(ctx, '📄 보험증서 발동: 원금 반환', 'good');
  return true;
}

function gambleResult(ctx: Ctx, name: string, win: boolean) {
  ctx.run.stats.gambles++;
  fire(ctx, 'onGamble', { gamble: name });
  fire(ctx, 'onGambleResult', { gamble: name, win });
}

// ───────────── 더블 오어 낫싱 ─────────────
export function donMin(run: RunState): number {
  return Math.max(2, Math.min(6, DON.successMin + getMods(run).donMinDelta));
}
export function donChance(run: RunState): number {
  return (7 - donMin(run)) / 6;
}
export function donEV(run: RunState): number {
  return donChance(run) * DON.payout * payoutMult(run);
}
export function donMaxStreak(run: RunState): number {
  return BALANCE.donMaxStreak + getMods(run).donMaxStreak;
}

/** 실제 굴림: 주사위가 인접면을 따라 구르는 시뮬레이션. 최종 면 = 결과 (시작 면이 균등이라 결과도 정확히 균등) */
const TUMBLE_CYCLE = [1, 2, 4, 6, 5, 3];
export function tumbleRoll(ctx: Ctx, stream: 'casino' | 'shop' = 'casino'): { frames: number[]; result: number } {
  const r = rng(ctx, stream);
  let idx = r.int(0, 5);
  const steps = r.int(9, 16);
  const frames = [TUMBLE_CYCLE[idx]];
  for (let i = 0; i < steps; i++) {
    // 가끔 반대 방향으로 흔들림 (물리적 튕김)
    idx = (idx + (r.chance(0.15) ? 5 : 1)) % 6;
    frames.push(TUMBLE_CYCLE[idx]);
  }
  return { frames, result: frames[frames.length - 1] };
}

/** 보상 화면의 더블 오어 낫싱 1회 */
export function doubleOrNothing(ctx: Ctx): { frames: number[]; result: number; win: boolean } | null {
  const rw = ctx.run.reward;
  if (!rw || rw.donDone || rw.gold <= 0) return null;
  if (rw.donStreak >= donMaxStreak(ctx.run)) return null;
  const t = tumbleRoll(ctx);
  const win = t.result >= donMin(ctx.run);
  if (win) {
    rw.gold = Math.round(rw.gold * DON.payout * payoutMult(ctx.run));
    rw.donStreak++;
    if (rw.donStreak >= donMaxStreak(ctx.run)) rw.donDone = true;
  } else {
    const keep = getMods(ctx.run).donFirstFailKeep;
    if (consumeInsurance(ctx)) {
      // 원금(이번 판돈) 유지
    } else if (rw.donStreak === 0 && keep > 0) {
      rw.gold = Math.round(rw.gold * keep);
      toast(ctx, `🍀 행운의 동전: ${Math.round(keep * 100)}% 보존`, 'good');
    } else rw.gold = 0;
    rw.donDone = true;
  }
  rw.donLastRoll = t.result;
  gambleResult(ctx, 'don', win);
  return { ...t, win };
}

// ───────────── 슬롯머신 ─────────────
export function slotWeights(run: RunState): { id: string; emoji: string; w: number }[] {
  const m = getMods(run);
  return SLOT_SYMBOLS.map((s) => ({ id: s.id, emoji: s.emoji, w: s.weight + (s.luckyBoost ? m.slotSevenWeight : 0) }));
}

/** 보상의 골드 환산 가치 (EV 표시용 휴리스틱, 칩 1 = 8G) */
const SLOT_VALUE: Record<string, { three: number; two: number }> = {
  cherry: { three: 10, two: 4 },
  coin: { three: 60, two: 14 },
  dice: { three: 9, two: 16 },
  star: { three: 20, two: 15 },
  skull: { three: 8, two: -4 },
  seven: { three: 160, two: 16 },
};

export interface SlotOdds {
  id: string;
  emoji: string;
  three: number;
  two: number;
}

export function slotOdds(run: RunState): { rows: SlotOdds[]; ev: number } {
  const ws = slotWeights(run);
  const total = ws.reduce((a, b) => a + b.w, 0);
  const m = getMods(run);
  const pm = payoutMult(run);
  let ev = 0;
  const rows = ws.map((s) => {
    const p = s.w / total;
    const three = p ** 3;
    const two = 3 * p * p * (1 - p);
    const v = SLOT_VALUE[s.id];
    const twoV = v.two > 0 ? v.two * (1 + m.slotPairMult) : v.two;
    ev += three * v.three * pm + two * twoV * (v.two > 0 ? pm : 1);
    return { id: s.id, emoji: s.emoji, three, two };
  });
  return { rows, ev: ev / BALANCE.chipPrice };
}

export function spinReels(ctx: Ctx): string[] {
  const ws = slotWeights(ctx.run);
  const r = rng(ctx, 'casino');
  return [0, 1, 2].map(() => r.weighted(ws, (s) => s.w).id);
}

function slotScore(reels: string[]): number {
  const [a, b, c] = reels;
  if (a === b && b === c) return SLOT_VALUE[a].three;
  const pair = a === b || a === c ? a : b === c ? b : null;
  return pair ? SLOT_VALUE[pair].two : 0;
}

export interface SlotResult {
  reels: string[];
  match: 3 | 2 | 0;
  symbol: string | null;
  text: string;
  mega: boolean;
  elite: boolean;
  faceChoice: boolean;
  alternatives?: string[][];
}

/** 슬롯 1회. 결과는 스핀 시작 시 확정 */
export function slotSpin(ctx: Ctx, opts: { free?: boolean } = {}): SlotResult | null {
  const run = ctx.run;
  if (!opts.free) {
    const fi = run.consumables.indexOf('freespin');
    if (fi >= 0) {
      run.consumables.splice(fi, 1);
      toast(ctx, '🎰 무료 스핀권 사용', 'info');
    } else if (run.chips < 1) return null;
    else gainChips(ctx, -1);
  }
  let reels = spinReels(ctx);
  let alternatives: string[][] | undefined;
  const ti = run.consumables.indexOf('goldenticket');
  if (ti >= 0) {
    run.consumables.splice(ti, 1);
    alternatives = [reels, spinReels(ctx), spinReels(ctx)];
    reels = [...alternatives].sort((x, y) => slotScore(y) - slotScore(x))[0];
    toast(ctx, '🎫 황금 티켓: 3개 결과 중 최고를 선택', 'gold');
  }
  return applySlot(ctx, reels, alternatives);
}

function applySlot(ctx: Ctx, reels: string[], alternatives?: string[][]): SlotResult {
  const run = ctx.run;
  const m = getMods(run);
  const pm = payoutMult(run);
  const pairMult = 1 + m.slotPairMult;
  const [a, b, c] = reels;
  const res: SlotResult = { reels, match: 0, symbol: null, text: '꽝', mega: false, elite: false, faceChoice: false, alternatives };
  if (a === b && b === c) {
    res.match = 3;
    res.symbol = a;
    switch (a) {
      case 'cherry': healPlayer(ctx, SLOT_PAY.cherry.three); res.text = `체력 ${SLOT_PAY.cherry.three} 회복`; break;
      case 'coin': gainGold(ctx, SLOT_PAY.coin.three * pm); res.text = `${Math.round(SLOT_PAY.coin.three * pm)}G!`; break;
      case 'dice': res.faceChoice = true; res.text = '면 스티커 선택!'; break;
      case 'star': {
        const id = relicOfRarity(ctx, rng(ctx, 'casino').weighted(['rare', 'epic', 'legendary'] as Rarity[], (r) => ({ rare: 70, epic: 25, legendary: 5 } as Record<string, number>)[r]));
        if (id) giveRelic(ctx, id);
        res.text = '유물 획득!';
        break;
      }
      case 'skull': res.elite = true; res.text = '엘리트 습격! (보상 2배)'; break;
      case 'seven': {
        res.mega = true;
        run.stats.megaJackpots++;
        const id = relicOfRarity(ctx, 'legendary');
        if (id) giveRelic(ctx, id);
        gainGold(ctx, SLOT_PAY.seven.threeGold * pm);
        addJackpot(ctx, 0);
        ctx.emit({ t: 'megaJackpot' });
        res.text = '메가 잭팟!!!';
        break;
      }
    }
  } else {
    const pair = a === b || a === c ? a : b === c ? b : null;
    if (pair) {
      res.match = 2;
      res.symbol = pair;
      switch (pair) {
        case 'cherry': healPlayer(ctx, SLOT_PAY.cherry.two * pairMult); res.text = `체력 ${SLOT_PAY.cherry.two * pairMult} 회복`; break;
        case 'coin': gainGold(ctx, SLOT_PAY.coin.two * pairMult * pm); res.text = `${Math.round(SLOT_PAY.coin.two * pairMult * pm)}G`; break;
        case 'dice': gainChips(ctx, SLOT_PAY.dice.two * pairMult); res.text = `칩 ${SLOT_PAY.dice.two * pairMult}`; break;
        case 'star': gainGold(ctx, SLOT_PAY.star.two * pairMult * pm); res.text = `${Math.round(SLOT_PAY.star.two * pairMult * pm)}G`; break;
        case 'skull': damagePlayer(ctx, -SLOT_PAY.skull.two, '슬롯 해골', { ignoreBlock: true }); res.text = `체력 ${SLOT_PAY.skull.two}`; break;
        case 'seven': gainChips(ctx, SLOT_PAY.seven.two * pairMult); res.text = `칩 ${SLOT_PAY.seven.two * pairMult}`; break;
      }
    }
  }
  const win = res.match > 0 && res.symbol !== 'skull';
  if (!win && res.match === 0 && consumeInsurance(ctx)) gainChips(ctx, 1);
  gambleResult(ctx, 'slot', win);
  return res;
}

// ───────────── 룰렛 ─────────────
export function rouletteZeroWeight(run: RunState): number {
  return 1 + getMods(run).rouletteZeroWeight;
}

export function rouletteOdds(run: RunState) {
  const zw = rouletteZeroWeight(run);
  const total = 36 + zw;
  const pm = payoutMult(run);
  const rows = ROULETTE_BETS.map((b) => {
    const cover = b.cover === 'zero' ? zw : b.cover;
    const p = cover / total;
    return { ...b, p, ev: p * b.payout * pm };
  });
  const single = { p: 1 / total, ev: (1 / total) * ROULETTE_SINGLE_PAYOUT * pm };
  return { rows, single, total };
}

export function rouletteWins(bet: RouletteBet, n: number): boolean {
  if (bet === 'zero') return n === 0;
  if (n === 0) return false;
  switch (bet) {
    case 'red': return ROULETTE_RED.has(n);
    case 'black': return !ROULETTE_RED.has(n);
    case 'odd': return n % 2 === 1;
    case 'even': return n % 2 === 0;
    case 'd1': return n <= 12;
    case 'd2': return n >= 13 && n <= 24;
    case 'd3': return n >= 25;
    default: return Number(bet.slice(1)) === n;
  }
}

export function roulettePayout(bet: RouletteBet): number {
  const b = ROULETTE_BETS.find((x) => x.id === bet);
  return b ? b.payout : ROULETTE_SINGLE_PAYOUT;
}

export function rouletteSpin(ctx: Ctx, bets: { bet: RouletteBet; chips: number }[]): { n: number; won: number } | null {
  const run = ctx.run;
  const stake = bets.reduce((s, b) => s + b.chips, 0);
  if (stake <= 0 || stake > run.chips) return null;
  gainChips(ctx, -stake);
  const zw = rouletteZeroWeight(run);
  const r = rng(ctx, 'casino');
  const n = r.next() * (36 + zw) < zw ? 0 : r.int(1, 36);
  let won = 0;
  for (const b of bets) if (rouletteWins(b.bet, n)) won += Math.round(b.chips * roulettePayout(b.bet) * payoutMult(run));
  if (n === 0 && bets.some((b) => b.bet === 'zero')) {
    addJackpot(ctx, 100);
    toast(ctx, '0 적중! 잭팟 게이지 100%', 'gold');
  }
  if (won === 0 && consumeInsurance(ctx)) won = stake;
  if (won > 0) gainChips(ctx, won);
  gambleResult(ctx, 'roulette', won > stake);
  return { n, won };
}

// ───────────── 하이롤러 ─────────────
export const HIGHROLLER_P = 15 / 36; // 2d6 ≥ 8

export function highrollerTierBonus(run: RunState, ddaBonus: number): number {
  return getMods(run).highrollerTier + ddaBonus;
}

export function highroller(ctx: Ctx, optId: string, ddaBonus: number): { d: [number, number]; win: boolean; prize: string | null } | null {
  const run = ctx.run;
  const opt = HIGHROLLER.find((o) => o.id === optId);
  if (!opt) return null;
  if (opt.kind === 'hp' && run.hp <= opt.stake) return null;
  if (opt.kind === 'maxHp' && run.maxHp <= opt.stake + 5) return null;
  const r = rng(ctx, 'casino');
  const d: [number, number] = [r.die(), r.die()];
  const win = d[0] + d[1] >= opt.need;
  let prize: string | null = null;
  if (win) {
    const bonus = highrollerTierBonus(run, ddaBonus);
    const idx = Math.min(3, RARITIES.indexOf(opt.prize) + bonus);
    prize = relicOfRarity(ctx, RARITIES[idx]);
    if (prize) giveRelic(ctx, prize);
    const overflow = RARITIES.indexOf(opt.prize) + bonus - 3;
    if (overflow > 0) gainGold(ctx, 50 * overflow);
  } else if (consumeInsurance(ctx)) {
    // 보험: 판돈 지불 안 함
  } else if (opt.kind === 'hp') {
    damagePlayer(ctx, opt.stake, '하이롤러 테이블', { ignoreBlock: true });
    if (run.hp <= 0) run.hp = 1;
  } else {
    run.maxHp -= opt.stake;
    run.hp = Math.min(run.hp, run.maxHp);
  }
  gambleResult(ctx, 'highroller', win);
  return { d, win, prize };
}

// ───────────── 스크래치 ─────────────
export function scratchSize(run: RunState) {
  return { rows: 3, cols: 3 + getMods(run).scratchCols };
}

function binomAtLeast(n: number, p: number, k: number): number {
  let s = 0;
  const C = (a: number, b: number) => { let r = 1; for (let i = 0; i < b; i++) r = (r * (a - i)) / (i + 1); return r; };
  for (let i = k; i <= n; i++) s += C(n, i) * p ** i * (1 - p) ** (n - i);
  return s;
}

export function scratchOdds(run: RunState) {
  const { rows, cols } = scratchSize(run);
  const n = rows * cols;
  const total = SCRATCH_SYMBOLS.reduce((a, b) => a + b.weight, 0);
  return SCRATCH_SYMBOLS.map((s) => ({ ...s, p: binomAtLeast(n, s.weight / total, 3) }));
}

export function scratchCard(ctx: Ctx): { grid: string[]; wins: string[] } {
  const { rows, cols } = scratchSize(ctx.run);
  const r = rng(ctx, 'casino');
  const grid = Array.from({ length: rows * cols }, () => r.weighted(SCRATCH_SYMBOLS, (s) => s.weight).id);
  const wins = SCRATCH_SYMBOLS.filter((s) => grid.filter((g) => g === s.id).length >= 3).map((s) => s.id);
  const pm = payoutMult(ctx.run);
  for (const w of wins) {
    if (w === 'coin') gainGold(ctx, 15 * pm);
    if (w === 'heart') healPlayer(ctx, 10);
    if (w === 'chip') gainChips(ctx, Math.round(3 * pm));
    if (w === 'star') {
      const id = relicOfRarity(ctx, r.chance(0.7) ? 'common' : 'rare');
      if (id) giveRelic(ctx, id);
    }
  }
  gambleResult(ctx, 'scratch', wins.length > 0);
  return { grid, wins };
}

// ───────────── 미스터리 박스 ─────────────
export function mysteryOdds(): Record<Rarity, number> {
  const total = Object.values(MYSTERY_WEIGHTS).reduce((a, b) => a + b, 0);
  return Object.fromEntries(RARITIES.map((r) => [r, MYSTERY_WEIGHTS[r] / total])) as Record<Rarity, number>;
}

export function openMystery(ctx: Ctx): { rarity: Rarity; relic: string | null } {
  const rarity = rng(ctx, 'loot').weighted(RARITIES, (r) => MYSTERY_WEIGHTS[r]);
  const relic = rollItemId(ctx, 'relic', rarity);
  if (relic) giveRelic(ctx, relic);
  gambleResult(ctx, 'mystery', rarity !== 'common');
  return { rarity, relic };
}

/** 리롤 룰렛: 6이면 다음 리롤 무료 */
export function shopRerollDie(ctx: Ctx): number {
  return rng(ctx, 'shop').die();
}

export { ROULETTE_RED };
