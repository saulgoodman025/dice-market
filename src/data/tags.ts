// 계열 태그
export type Tag = 'blade' | 'curse' | 'shield' | 'gamble' | 'eco' | 'chain' | 'rig' | 'hand';

export const TAGS: Tag[] = ['blade', 'curse', 'shield', 'gamble', 'eco', 'chain', 'rig', 'hand'];

export const TAG_INFO: Record<Tag, { icon: string; name: string }> = {
  blade: { icon: '⚔️', name: '칼날' },
  curse: { icon: '☠️', name: '저주' },
  shield: { icon: '🛡', name: '방패' },
  gamble: { icon: '🎰', name: '도박' },
  eco: { icon: '💰', name: '경제' },
  chain: { icon: '🔗', name: '연쇄' },
  rig: { icon: '🔧', name: '조작' },
  hand: { icon: '🃏', name: '족보' },
};

/** 단계 기준 장수 */
export const TAG_TIERS = [3, 5, 7];
