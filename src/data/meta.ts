// 메타 진행: 처음엔 각 카테고리 약 60%만 상점/보상 풀에 있다. 해금 포인트로 나머지를 연다.
export const META_LOCKED_START: { kind: 'card' | 'relic' | 'face'; id: string }[] = [
  // 공용 카드 18장 (60 중 30%) — 처음엔 70%만 풀에 있다
  { kind: 'card', id: 'oddcut' }, { kind: 'card', id: 'execute' }, { kind: 'card', id: 'lucky7' },
  { kind: 'card', id: 'split' }, { kind: 'card', id: 'triple' }, { kind: 'card', id: 'roulette' },
  { kind: 'card', id: 'chain' }, { kind: 'card', id: 'echo' }, { kind: 'card', id: 'reload' },
  { kind: 'card', id: 'allin' }, { kind: 'card', id: 'yahtzeehammer' }, { kind: 'card', id: 'midas' },
  { kind: 'card', id: 'doubledown' }, { kind: 'card', id: 'warcry' }, { kind: 'card', id: 'deathmark' },
  { kind: 'card', id: 'infinitechain' }, { kind: 'card', id: 'bulwark' }, { kind: 'card', id: 'catalyst' },
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

/** 1막 상점 카드 칸 하나에 눈 조작 카드가 나올 확률 (가드레일 ≥60%) */
export const ACT1_MANIP_CHANCE = 0.65;
export const MANIP_SKILLS = ['bump', 'flip', 'split'];
