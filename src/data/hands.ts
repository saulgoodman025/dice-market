import type { HandId } from '../core/state';

export interface HandDef {
  id: HandId;
  name: string;
  mult: number;
  heat: number; // -1 = 초기화
  jackpot: number;
  rank: number;
  celebrate?: boolean; // 전용 풀스크린 연출
}

// 판정 우선순위는 rank (표 순서)
export const HANDS: HandDef[] = [
  { id: 'none', name: '노 핸드', mult: 1.0, heat: -1, jackpot: 0, rank: 0 },
  { id: 'pair', name: '원 페어', mult: 1.2, heat: 0, jackpot: 2, rank: 1 },
  { id: 'twopair', name: '투 페어', mult: 1.5, heat: 1, jackpot: 4, rank: 2 },
  { id: 'flush', name: '플러시', mult: 1.8, heat: 1, jackpot: 5, rank: 3 },
  { id: 'triple', name: '트리플', mult: 1.8, heat: 1, jackpot: 6, rank: 4 },
  { id: 'small', name: '스몰 스트레이트', mult: 2.0, heat: 1, jackpot: 6, rank: 5 },
  { id: 'full', name: '풀하우스', mult: 2.5, heat: 2, jackpot: 10, rank: 6 },
  { id: 'large', name: '라지 스트레이트', mult: 3.0, heat: 2, jackpot: 15, rank: 7 },
  { id: 'four', name: '포카드', mult: 4.0, heat: 3, jackpot: 20, rank: 8 },
  { id: 'yahtzee', name: '야찌', mult: 7.0, heat: 5, jackpot: 50, rank: 9, celebrate: true },
];

export const HAND_BY_ID = Object.fromEntries(HANDS.map((h) => [h.id, h])) as Record<HandId, HandDef>;
