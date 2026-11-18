// 일일 도전: 날짜로 정해지는 시드·캐릭터·테이블·특수 규칙. 누구나 같은 날엔 같은 판을 한다.
import { hashSeed } from '../core/rng';
import type { Mods } from './ctx';

export interface DailyRule {
  id: string;
  name: string;
  desc: string;
  mods: Partial<Mods>;
}

export const DAILY_RULES: DailyRule[] = [
  { id: 'rich', name: '부자의 밤', desc: '도박 배당 +30%, 적 체력 +20%', mods: { payoutEv: 0.3, enemyHpPct: 0.2 } },
  { id: 'chips', name: '칩 폭주', desc: '족보 칩 매 턴 +1, 상점 가격 +50%', mods: { handChips: 1, shopPricePct: 0.5 } },
  { id: 'reroll', name: '리롤 파티', desc: '리롤 +1, 잠금 -1', mods: { rerolls: 1, lockLimit: -1 } },
  { id: 'glass', name: '유리 대포', desc: '최대 체력 -15, 피해가 큰 족보에 유리 (모든 족보 배율 +0.3)', mods: { startHpDelta: -15, handAll: 0.3 } },
  { id: 'slow', name: '느긋한 밤', desc: '이자 상한 +5, 리롤 -1', mods: { interestCap: 5, rerolls: -1 } },
];

const CHARS = ['gambler', 'merchant', 'knight', 'sharp'];
const TABLE_IDS = ['classic', 'golden', 'six', 'glass', 'chips', 'highroller'];

export function todayKey(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function dailySetup(key: string) {
  const h = Math.abs(hashSeed(20261118, key));
  return {
    key,
    seed: h >>> 0,
    charId: CHARS[h % CHARS.length],
    tableId: TABLE_IDS[Math.floor(h / 7) % TABLE_IDS.length],
    rule: DAILY_RULES[Math.floor(h / 53) % DAILY_RULES.length],
  };
}

export function dailyRuleById(id: string): DailyRule | undefined {
  return DAILY_RULES.find((r) => r.id === id);
}

/** 일일 도전 점수 */
export function dailyScore(nodes: number, bosses: number, gold: number, won: boolean): number {
  return nodes * 10 + bosses * 60 + gold + (won ? 500 : 0);
}
