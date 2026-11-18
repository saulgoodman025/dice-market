// 시드 기반 RNG (mulberry32). 엔진 내장 난수 함수는 사용하지 않는다.
// 상태는 숫자 하나라 JSON 저장이 가능하다.

export type Stream = 'combat' | 'loot' | 'shop' | 'casino' | 'map' | 'deck' | 'reward' | 'augment';
export const STREAMS: Stream[] = ['combat', 'loot', 'shop', 'casino', 'map', 'deck', 'reward', 'augment'];

export function mulberry32Next(state: number): [number, number] {
  let a = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  const out = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return [a, out];
}

export function hashSeed(seed: number, salt: string): number {
  let h = (seed ^ 0x9e3779b9) | 0;
  for (let i = 0; i < salt.length; i++) {
    h = Math.imul(h ^ salt.charCodeAt(i), 0x85ebca6b);
    h ^= h >>> 13;
  }
  return h | 0;
}

/** 직렬화 가능한 RNG 핸들. state 객체를 직접 변경한다. */
export class Rng {
  constructor(private holder: { [k: string]: number }, private key: string) {}
  next(): number {
    const [s, v] = mulberry32Next(this.holder[this.key]);
    this.holder[this.key] = s;
    return v;
  }
  int(lo: number, hi: number): number {
    return lo + Math.floor(this.next() * (hi - lo + 1));
  }
  die(): number {
    return this.int(1, 6);
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }
  weighted<T>(items: readonly T[], weight: (t: T) => number): T {
    const total = items.reduce((s, t) => s + Math.max(0, weight(t)), 0);
    let r = this.next() * total;
    for (const t of items) {
      r -= Math.max(0, weight(t));
      if (r < 0) return t;
    }
    return items[items.length - 1];
  }
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}

export function makeRngState(seed: number): Record<Stream, number> {
  const o = {} as Record<Stream, number>;
  for (const s of STREAMS) o[s] = hashSeed(seed, s);
  return o;
}

/** 연출 전용(결과에 영향 없음) 난수. 시드 고정 불필요. */
let fxState = (Date.now() ^ 0x5bd1e995) | 0;
export function fxRandom(): number {
  const [s, v] = mulberry32Next(fxState);
  fxState = s;
  return v;
}
