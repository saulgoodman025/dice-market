import type { Rarity } from '../core/state';

export interface SlotSymbol {
  id: string;
  emoji: string;
  name: string;
  weight: number;
  three: string; // 3개 일치 보상 설명
  two: string; // 2개 일치 보상 설명
  luckyBoost?: boolean; // 럭키 7 배지 가중치 보정 대상
}

export const SLOT_SYMBOLS: SlotSymbol[] = [
  { id: 'cherry', emoji: '🍒', name: '체리', weight: 30, three: '체력 20 회복', two: '체력 8 회복' },
  { id: 'coin', emoji: '🪙', name: '코인', weight: 30, three: '60G', two: '14G' },
  { id: 'dice', emoji: '🎲', name: '다이스', weight: 18, three: '면 스티커 선택 (3중 1)', two: '칩 2' },
  { id: 'star', emoji: '⭐', name: '스타', weight: 10, three: '희귀 이상 유물 1', two: '15G' },
  { id: 'skull', emoji: '💀', name: '해골', weight: 10, three: '엘리트 전투 즉시 (보상 2배)', two: '체력 -5' },
  { id: 'seven', emoji: '7️⃣', name: '세븐', weight: 2, three: '메가 잭팟: 전설 유물 + 100G', two: '칩 2', luckyBoost: true },
];

/** 슬롯 보상 수치 (데이터) */
export const SLOT_PAY = {
  cherry: { three: 20, two: 8 },
  coin: { three: 60, two: 14 },
  dice: { two: 2 },
  star: { two: 15 },
  skull: { two: -5 },
  seven: { threeGold: 100, two: 2 },
};

/** 유러피언 룰렛 빨간 숫자 */
export const ROULETTE_RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

export type RouletteBet = 'red' | 'black' | 'odd' | 'even' | 'd1' | 'd2' | 'd3' | 'zero' | `n${number}`;

export const ROULETTE_BETS: { id: RouletteBet; label: string; payout: number; cover: number | 'zero' }[] = [
  { id: 'red', label: '빨강', payout: 2, cover: 18 },
  { id: 'black', label: '검정', payout: 2, cover: 18 },
  { id: 'odd', label: '홀', payout: 2, cover: 18 },
  { id: 'even', label: '짝', payout: 2, cover: 18 },
  { id: 'd1', label: '1~12', payout: 3, cover: 12 },
  { id: 'd2', label: '13~24', payout: 3, cover: 12 },
  { id: 'd3', label: '25~36', payout: 3, cover: 12 },
  { id: 'zero', label: '0', payout: 36, cover: 'zero' },
];
export const ROULETTE_SINGLE_PAYOUT = 36;

export const SCRATCH_SYMBOLS = [
  { id: 'coin', emoji: '🪙', weight: 35, reward: '15G' },
  { id: 'heart', emoji: '❤️', weight: 25, reward: '체력 10 회복' },
  { id: 'chip', emoji: '🎰', weight: 25, reward: '칩 3' },
  { id: 'star', emoji: '⭐', weight: 15, reward: '일반~희귀 유물 1' },
];

export const MYSTERY_WEIGHTS: Record<Rarity, number> = { common: 50, rare: 30, epic: 15, legendary: 5 };

export const DON = { successMin: 4, payout: 2 };

export const HIGHROLLER = [
  { id: 'maxhp', label: '최대 체력 -10을 건다', stake: 10, kind: 'maxHp' as const, need: 8, prize: 'legendary' as Rarity },
  { id: 'hp', label: '체력 15를 건다', stake: 15, kind: 'hp' as const, need: 8, prize: 'epic' as Rarity },
];

