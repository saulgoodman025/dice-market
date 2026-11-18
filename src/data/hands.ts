import type { HandId } from '../core/state';

export interface HandDef {
  id: HandId;
  name: string;
  mult: number;
  heat: number; // -1 = 초기화
  jackpot: number;
  rank: number;
  chips: number; // 🔶 족보 칩 (카드 비용으로 씀)
  celebrate?: boolean; // 전용 풀스크린 연출
  how: string; // 쉬운 설명
  example: number[];
}

// 판정 우선순위는 rank (표 순서)
export const HANDS: HandDef[] = [
  { id: 'none', chips: 1, name: '노 핸드', mult: 1.0, heat: -1, jackpot: 0, rank: 0, how: '족보 없음 (열기 꺼짐)', example: [1, 2, 4, 5, 6]},
  { id: 'pair', chips: 2, name: '원 페어', mult: 1.2, heat: 0, jackpot: 4, rank: 1, how: '같은 눈 2개', example: [3, 3, 1, 5, 6]},
  { id: 'twopair', chips: 3, name: '투 페어', mult: 1.5, heat: 1, jackpot: 8, rank: 2, how: '같은 눈 2개가 두 쌍', example: [2, 2, 5, 5, 1]},
  { id: 'flush', chips: 3, name: '플러시', mult: 1.8, heat: 1, jackpot: 8, rank: 3, how: '전부 홀수 또는 전부 짝수', example: [2, 4, 4, 6, 2]},
  { id: 'triple', chips: 3, name: '트리플', mult: 1.8, heat: 1, jackpot: 10, rank: 4, how: '같은 눈 3개', example: [4, 4, 4, 1, 6]},
  { id: 'small', chips: 4, name: '스몰 스트레이트', mult: 2.0, heat: 1, jackpot: 10, rank: 5, how: '이어지는 눈 4개', example: [1, 2, 3, 4, 6]},
  { id: 'full', chips: 4, name: '풀하우스', mult: 2.5, heat: 2, jackpot: 15, rank: 6, how: '3개 + 2개', example: [5, 5, 5, 2, 2]},
  { id: 'large', chips: 5, name: '라지 스트레이트', mult: 3.0, heat: 2, jackpot: 20, rank: 7, how: '이어지는 눈 5개', example: [2, 3, 4, 5, 6]},
  { id: 'four', chips: 5, name: '포카드', mult: 4.0, heat: 3, jackpot: 25, rank: 8, how: '같은 눈 4개', example: [6, 6, 6, 6, 1]},
  { id: 'yahtzee', chips: 7, name: '야찌', mult: 7.0, heat: 5, jackpot: 50, rank: 9, celebrate: true, how: '같은 눈 5개!', example: [6, 6, 6, 6, 6] },
];

export const HAND_BY_ID = Object.fromEntries(HANDS.map((h) => [h.id, h])) as Record<HandId, HandDef>;
