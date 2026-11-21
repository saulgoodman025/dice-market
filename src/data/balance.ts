// 모든 기본 수치. 밸런스 조정은 이 파일에서.
import type { NodeType, Rarity } from '../core/state';

export const BALANCE = {
  baseRerolls: 2,
  lockLimit: 2, // 동시에 잠글 수 있는 주사위
  chipCarryMax: 1, // 다음 턴으로 넘길 수 있는 족보 칩
  weakMult: 1.75,
  vulnMult: 1.5, // 취약: 받는 피해 ×1.5
  frailMult: 0.75, // 약화: 주는 피해 ×0.75
  weakJackpot: 6, // 약점 눈 적중 시 잭팟 게이지 +% // 약점 눈 피해 배율
  // ── 덱 ──
  startSlash: 4,
  startGuard: 4,
  drawPerTurn: 5,
  handMax: 10,
  minDeck: 5, // 이보다 작아지는 삭제는 불가
  cardChoices: 3,
  cardSkipGold: 5,
  charCardChance: 0.4, // 보상 카드 1장마다 캐릭터 전용일 확률
  comboPartnerChance: 0.15, // 카드 보상 마지막 칸이 덱 카드의 콤보 짝일 확률
  /** 카드 보상 등급 가중치 (표시 확률, DDA 미적용) */
  cardRewardWeights: {
    normal: { common: 60, rare: 33, epic: 6, legendary: 1 },
    elite: { common: 40, rare: 45, epic: 12, legendary: 3 },
    boss: { common: 0, rare: 60, epic: 30, legendary: 10 },
  } as Record<'normal' | 'elite' | 'boss', Record<Rarity, number>>,
  removeBase: 50, // 상점 카드 삭제 첫 비용
  removeStep: 25, // 이후 +25G
  shredderMax: 3, // 카지노 파쇄기 판당 횟수
  shredderChips: 1,
  shredderWin: 0.5,
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
  relicPriceStep: 0.15, // 유물을 1개 가질 때마다 상점 유물 가격 +15%
  chipPrice: 8,
  prices: {
    card: { common: 5, rare: 8, epic: 12, legendary: 18 },
    face: { common: 3, rare: 6, epic: 10, legendary: 15 },
    relic: { common: 8, rare: 13, epic: 20, legendary: 32 },
    material: { common: 8, rare: 10, epic: 12, legendary: 15 },
  } as Record<'card' | 'face' | 'relic' | 'material', Record<Rarity, number>>,
  rarityWeights: { common: 60, rare: 28, epic: 10, legendary: 2 } as Record<Rarity, number>,
  rarityShiftPerAct: 3,

  nodeWeights: { combat: 40, elite: 12, shop: 18, casino: 12, event: 13, rest: 5 } as Record<Exclude<NodeType, 'boss'>, number>,
  floorsPerAct: 8, // 7층 + 보스
  augmentFloor: 3, // 막마다 이 층에 오르면 증강 선택 (8층 지도의 앞쪽 절반)
  combatFloors: [0, 4], // 이 층은 전투(정예 포함)만: 어느 길로 가도 전투를 최소 2번 거친다
  floorHpStep: 0.04, // 층마다 적 체력 +4% (보스 층 +28%)
  // 3막 최종 보스: 거의 깰 수 없게. 캐릭터 태생 강함(시뮬 클리어율)에 맞춰 배율을 다르게,
  // 그리고 이번 판 최고 한 방 피해 × peakHits 이상의 체력 (폭주 빌드도 여러 번 때려야 한다)
  finalBoss: { hp: 2.2, atk: 1.6, peakHits: 9, charMult: { gambler: 1.0, merchant: 1.15, knight: 1.35, sharp: 1.05 } as Record<string, number> },
  // 엔드리스: 막마다 체력 ×1.8(지수), 공격 +35% +3, 최고 한 방 대비 체력 하한, 변이 능력
  endless: { hpGrowth: 1.8, atkPct: 0.35, atkFlat: 3, peakNormal: 0.8, peakElite: 1.6, peakBoss: 8, peakPerAct: 0.5 },

  restHealPct: 0.3,

  casinoEnterChips: 2,

  // 적 체력 막 보정 (적 데이터 자체가 막별로 다름. 여기선 전역 배율)
  enemyHpMult: 1.35,
  enemyAtkMult: 1.6, // 덱빌딩 업데이트로 방어·드로우가 늘어 적 공격도 올림
  bossHealOnWin: 0.25,
};

export const HEAT_RESET_HAND = 'none';
