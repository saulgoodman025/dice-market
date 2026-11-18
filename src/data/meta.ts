// 메타 진행: 처음엔 각 카테고리 약 60%만 상점/보상 풀에 있다. 해금 포인트로 나머지를 연다.
export const META_LOCKED_START: { kind: 'skill' | 'relic' | 'face'; id: string }[] = [
  // 스킬 13개 (32 중 ~40%)
  { kind: 'skill', id: 'oddcut' }, { kind: 'skill', id: 'execute' }, { kind: 'skill', id: 'lucky7' },
  { kind: 'skill', id: 'split' }, { kind: 'skill', id: 'triple' }, { kind: 'skill', id: 'roulette' },
  { kind: 'skill', id: 'chain' }, { kind: 'skill', id: 'echo' }, { kind: 'skill', id: 'reload' },
  { kind: 'skill', id: 'allin' }, { kind: 'skill', id: 'yahtzeehammer' }, { kind: 'skill', id: 'midas' },
  { kind: 'skill', id: 'doubledown' }, { kind: 'skill', id: 'warcry' },
  // 면 8개 (20 중 40%)
  { kind: 'face', id: 'chip' }, { kind: 'face', id: 'clone' }, { kind: 'face', id: 'magnet' },
  { kind: 'face', id: 'ice' }, { kind: 'face', id: 'mirror' }, { kind: 'face', id: 'skull' },
  { kind: 'face', id: 'clover' }, { kind: 'face', id: 'crown' },
  // 유물 20개 (50 중 40%)
  { kind: 'relic', id: 'tripletiara' }, { kind: 'relic', id: 'bigladder' }, { kind: 'relic', id: 'yahtzeebell' },
  { kind: 'relic', id: 'handbook' }, { kind: 'relic', id: 'tipjar' }, { kind: 'relic', id: 'compound' },
  { kind: 'relic', id: 'goose' }, { kind: 'relic', id: 'mint' }, { kind: 'relic', id: 'croupier' },
  { kind: 'relic', id: 'scratcher' }, { kind: 'relic', id: 'sevenpin' }, { kind: 'relic', id: 'doubleup' },
  { kind: 'relic', id: 'mirrorball' }, { kind: 'relic', id: 'tumble' }, { kind: 'relic', id: 'stackdeck' },
  { kind: 'relic', id: 'godhand' }, { kind: 'relic', id: 'lastchance' }, { kind: 'relic', id: 'immortal' },
  { kind: 'relic', id: 'berserker' }, { kind: 'relic', id: 'housekey' },
];

/** 해금 1개당 필요한 포인트 */
export const META_POINTS_PER_UNLOCK = 6;

/** 1막 상점 스킬 칸에 눈 조작 스킬이 나올 확률 (가드레일 ≥60%) */
export const ACT1_MANIP_CHANCE = 0.65;
export const MANIP_SKILLS = ['bump', 'flip', 'fate'];
