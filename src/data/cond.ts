// 카드 사용 조건 (넣을 수 있는 주사위). 기존 스킬 조건 체계를 그대로 쓰고 몇 가지를 더했다.
export type Cond =
  | { k: 'instant' } // 즉발: 주사위 없이 사용
  | { k: 'any' }
  | { k: 'anyN'; n: number } // 아무 눈 n개
  | { k: 'range'; lo: number; hi: number }
  | { k: 'even' }
  | { k: 'odd' }
  | { k: 'exact'; v: number }
  | { k: 'exactN'; v: number; n: number } // 같은 특정 눈 n개 (스네이크 아이즈)
  | { k: 'same'; n: number }
  | { k: 'sameMin'; n: number } // 같은 눈 n개 이상 (가변)
  | { k: 'seq'; n: number }
  | { k: 'sumPair'; v: number }
  | { k: 'sumSet'; sums: number[]; min: number; max: number } // 합이 sums 중 하나 (가변 개수)
  | { k: 'sumMin'; n: number; min: number }
  | { k: 'dice'; min: number; max: number } // 아무 눈 min~max개 (블랙잭)
  | { k: 'full' } // 같은 눈 3개 + 같은 눈 2개
  | { k: 'tripPlus2' } // 같은 눈 3개 + 아무 2개
  | { k: 'all' };

/** 이 조건이 받을 수 있는 주사위 개수 후보 (큰 쪽부터) */
export function condCounts(c: Cond, freeDice: number): number[] {
  switch (c.k) {
    case 'instant': return [0];
    case 'anyN': case 'same': case 'seq': case 'sumMin': case 'exactN': return [c.n];
    case 'sumPair': return [2];
    case 'sameMin': return range(Math.min(5, freeDice), c.n);
    case 'sumSet': case 'dice': return range(Math.min(c.max, freeDice), c.min);
    case 'full': case 'tripPlus2': return [5];
    case 'all': return [freeDice];
    default: return [1];
  }
}

function range(hi: number, lo: number): number[] {
  const out: number[] = [];
  for (let i = hi; i >= lo; i--) out.push(i);
  return out;
}

export function condText(c: Cond): string {
  switch (c.k) {
    case 'instant': return '즉발';
    case 'any': return '아무 눈';
    case 'anyN': return `아무 눈 ${c.n}개`;
    case 'range': return `${c.lo}~${c.hi}`;
    case 'even': return '짝수 눈';
    case 'odd': return '홀수 눈';
    case 'exact': return `${c.v}만`;
    case 'exactN': return `${c.v} ${c.n}개`;
    case 'same': return `같은 눈 ${c.n}개`;
    case 'sameMin': return `같은 눈 ${c.n}개+`;
    case 'seq': return `연속 ${c.n}개`;
    case 'sumPair': return `합 ${c.v} (2개)`;
    case 'sumSet': return `합 ${c.sums.join('/')}`;
    case 'sumMin': return `${c.n}개 합 ${c.min}+`;
    case 'dice': return `주사위 ${c.min}~${c.max}개`;
    case 'full': return '3개+2개';
    case 'tripPlus2': return '같은 눈 3개+2개';
    case 'all': return '남은 전부';
  }
}

/** pips: 고른 주사위들의 눈 */
export function checkCond(c: Cond, pips: number[], freeDice: number): boolean {
  if (c.k === 'instant') return pips.length === 0;
  if (!condCounts(c, freeDice).includes(pips.length) || pips.length === 0) return false;
  const p = pips[0];
  const cnt = () => { const m = new Map<number, number>(); for (const x of pips) m.set(x, (m.get(x) ?? 0) + 1); return [...m.values()].sort((a, b) => b - a); };
  switch (c.k) {
    case 'any': case 'anyN': case 'dice': case 'all': return true;
    case 'range': return p >= c.lo && p <= c.hi;
    case 'even': return p % 2 === 0;
    case 'odd': return p % 2 === 1;
    case 'exact': return p === c.v;
    case 'exactN': return pips.every((x) => x === c.v);
    case 'same': case 'sameMin': return pips.every((x) => x === p);
    case 'seq': {
      const s = [...pips].sort((a, b) => a - b);
      return s.every((x, i) => i === 0 || x === s[i - 1] + 1);
    }
    case 'sumPair': return pips[0] + pips[1] === c.v;
    case 'sumSet': return c.sums.includes(pips.reduce((a, b) => a + b, 0));
    case 'sumMin': return pips.reduce((a, b) => a + b, 0) >= c.min;
    case 'full': { const k = cnt(); return k[0] === 3 && k[1] === 2; }
    case 'tripPlus2': return cnt()[0] >= 3;
  }
  return false;
}
