import type { Mods } from '../rules/ctx';

export interface StakeDef {
  level: number;
  name: string;
  desc: string;
  mods: Partial<Mods>;
}

// 난이도 스테이지는 누적 적용된다 (스테이지 3 = 1+2+3)
export const STAKES: StakeDef[] = [
  { level: 1, name: '스테이지 1', desc: '적 체력 +10%', mods: { enemyHpPct: 0.1 } },
  { level: 2, name: '스테이지 2', desc: '이자 상한 -2', mods: { interestCap: -2 } },
  { level: 3, name: '스테이지 3', desc: '턴당 리롤 -1', mods: { rerolls: -1, ddaHalfDown: 1 } },
  { level: 4, name: '스테이지 4', desc: '엘리트 노드 증가', mods: { eliteWeight: 8 } },
  { level: 5, name: '스테이지 5', desc: '도박 배당 5% 감소', mods: { payoutEv: -0.05 } },
  { level: 6, name: '스테이지 6', desc: '상점 가격 +20%', mods: { shopPricePct: 0.2 } },
  { level: 7, name: '스테이지 7', desc: '보스 2페이즈 강화', mods: { bossPhase2: 1 } },
  { level: 8, name: '스테이지 8', desc: '시작 체력 -15', mods: { startHpDelta: -15 } },
];
