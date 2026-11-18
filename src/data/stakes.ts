import type { Mods } from '../rules/ctx';

export interface StakeDef {
  level: number;
  name: string;
  desc: string;
  mods: Partial<Mods>;
}

// 스테이크는 누적 적용된다 (스테이크 3 = 1+2+3)
export const STAKES: StakeDef[] = [
  { level: 1, name: '스테이크 1', desc: '적 체력 +10%', mods: { enemyHpPct: 0.1 } },
  { level: 2, name: '스테이크 2', desc: '이자 상한 -2', mods: { interestCap: -2 } },
  { level: 3, name: '스테이크 3', desc: '턴당 리롤 -1 (DDA 도움 절반)', mods: { rerolls: -1, ddaHalfDown: 1 } },
  { level: 4, name: '스테이크 4', desc: '엘리트 노드 증가', mods: { eliteWeight: 8 } },
  { level: 5, name: '스테이크 5', desc: '도박 배당 EV -0.05 (표시 반영)', mods: { payoutEv: -0.05 } },
  { level: 6, name: '스테이크 6', desc: '상점 가격 +20%', mods: { shopPricePct: 0.2 } },
  { level: 7, name: '스테이크 7', desc: '보스 2페이즈 강화', mods: { bossPhase2: 1 } },
  { level: 8, name: '스테이크 8', desc: '시작 체력 -15', mods: { startHpDelta: -15 } },
];
