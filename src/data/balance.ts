// 모든 기본 수치. 밸런스 조정은 이 파일에서.
import type { NodeType, Rarity } from '../core/state';

export const BALANCE = {
  baseRerolls: 2,
  lockLimit: 2, // 동시에 잠글 수 있는 주사위
  chipCarryMax: 3, // 다음 턴으로 넘길 수 있는 족보 칩
  weakMult: 1.75,
  vulnMult: 1.5, // 취약: 받는 피해 ×1.5
  frailMult: 0.75, // 약화: 주는 피해 ×0.75
  weakJackpot: 4, // 약점 눈 적중 시 잭팟 게이지 +% // 약점 눈 피해 배율
  startSlots: 4,
  maxSlots: 6,
  startGold: 10,
  maxConsumables: 3,

  rewardGold: { normal: 6, elite: 14, boss: 30 },
  interestUnit: 5,
  interestCap: 5,

  heatMax: 10,
  heatDmgPerStep: 0.05,
  heatPiggyPerStep: 0.1,
  feverAt: 5,

  jackpotMax: 100,

  donMaxStreak: 3,
  donSuccessMin: 4, // 4~6 성공

  shopSlotCount: 5,
  shopRerollStart: 2,
  shopRerollMax: 1, // 상점당 리롤 횟수 (유물 싹쓸이 방지)
  chipPrice: 8,
  prices: {
    skill: { common: 5, rare: 8, epic: 12, legendary: 18 },
    face: { common: 3, rare: 6, epic: 10, legendary: 15 },
    relic: { common: 6, rare: 10, epic: 15, legendary: 25 },
    material: { common: 8, rare: 10, epic: 12, legendary: 15 },
  } as Record<'skill' | 'face' | 'relic' | 'material', Record<Rarity, number>>,
  rarityWeights: { common: 60, rare: 28, epic: 10, legendary: 2 } as Record<Rarity, number>,
  rarityShiftPerAct: 3,

  nodeWeights: { combat: 40, elite: 12, shop: 18, casino: 12, event: 13, rest: 5 } as Record<Exclude<NodeType, 'boss'>, number>,
  floorsPerAct: 5,

  restHealPct: 0.3,
  restUpgrade: 0.3,

  casinoEnterChips: 2,

  // 적 체력 막 보정 (적 데이터 자체가 막별로 다름. 여기선 전역 배율)
  enemyHpMult: 0.9,
  bossHealOnWin: 0.25,
};

export const HEAT_RESET_HAND = 'none';
