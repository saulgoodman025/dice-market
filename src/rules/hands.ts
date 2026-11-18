import type { HandId } from '../core/state';
import { HANDS, HAND_BY_ID } from '../data/hands';

export interface HandDieInput {
  pip: number;
  wild?: boolean; // 가장 유리한 눈으로 취급
  magnet?: boolean; // 다른 주사위 1개와 같은 눈으로 취급 가능
}

export interface HandEvalOpts {
  smallLadder?: boolean; // 연속 3개도 스몰 스트레이트
}

function longestRun(vals: number[]): number {
  const set = new Set(vals.filter((v) => v >= 1 && v <= 6));
  let best = 0;
  for (let s = 1; s <= 6; s++) {
    let len = 0;
    while (set.has(s + len)) len++;
    best = Math.max(best, len);
  }
  return best;
}

/** 고정된 눈 배열의 족보 */
export function evalFixed(vals: number[], opts: HandEvalOpts = {}): HandId {
  const counts = new Map<number, number>();
  for (const v of vals) counts.set(v, (counts.get(v) ?? 0) + 1);
  const c = [...counts.values()].sort((a, b) => b - a);
  const top = c[0] ?? 0;
  const second = c[1] ?? 0;
  const run = longestRun(vals);
  const n = vals.length;
  if (n >= 5 && top >= 5) return 'yahtzee';
  if (top >= 4) return 'four';
  if (run >= 5) return 'large';
  if (top >= 3 && second >= 2) return 'full';
  if (run >= 4 || (opts.smallLadder && run >= 3)) return 'small';
  if (top >= 3) return 'triple';
  if (n >= 5 && (vals.every((v) => v % 2 === 1) || vals.every((v) => v % 2 === 0))) return 'flush';
  if (top >= 2 && second >= 2) return 'twopair';
  if (top >= 2) return 'pair';
  return 'none';
}

const rankOf = (h: HandId) => HAND_BY_ID[h].rank;

/** 와일드/자석 포함 최고 족보 판정 (가장 높은 족보 하나) */
export function evaluateHand(dice: HandDieInput[], opts: HandEvalOpts = {}): HandId {
  // 각 주사위의 후보 눈 목록
  const fixedPips = dice.filter((d) => !d.wild).map((d) => d.pip);
  const cands: number[][] = dice.map((d) => {
    if (d.wild) return [1, 2, 3, 4, 5, 6];
    if (d.magnet) {
      const others = new Set(fixedPips);
      others.add(d.pip);
      return [...others];
    }
    return [d.pip];
  });
  let best: HandId = 'none';
  const cur: number[] = new Array(dice.length);
  const rec = (i: number) => {
    if (i === dice.length) {
      const h = evalFixed(cur, opts);
      if (rankOf(h) > rankOf(best)) best = h;
      return;
    }
    for (const v of cands[i]) {
      cur[i] = v;
      rec(i + 1);
      if (best === 'yahtzee') return;
    }
  };
  rec(0);
  return best;
}

export { HANDS };
