import type { Rarity } from '../core/state';

export interface MaterialDef {
  id: string;
  name: string;
  rarity: Rarity;
  desc: string;
  v?: Record<string, number>;
  color: string;
  pipMap?: Record<number, number>; // 굴린 눈 치환 (돌: 1→2)
  rollFaces?: number[]; // 이 면 인덱스만 나옴 (납)
  powerMult?: number; // 스킬 효과 계산 시 눈 배율
  piggyMult?: number; // 저금통 투입 시 배율
  breakOn?: number; // 이 눈이 나오면 이번 전투 사용 불가
  blockBonus?: number; // 방어 스킬 보너스
  noReroll?: boolean;
  turnSelfDmg?: number;
  wild?: boolean; // 족보 판정 시 와일드
  keepBest?: boolean; // 리롤 시 이전/새 눈 중 높은 쪽 (수정)
  inShop?: boolean;
  icon: string; // 주사위 배지
  long: string; // 자세한 설명 (왜 그런지)
}

export const MATERIALS: MaterialDef[] = [
  { id: 'wood', name: '나무', rarity: 'common', desc: '특별한 효과가 없는 기본 주사위입니다.', color: '#a8743f', inShop: false, icon: '🪵', long: '특별한 효과가 없는 기본 주사위입니다.' },
  { id: 'stone', name: '돌', rarity: 'common', desc: '1이 나오면 2로 바뀝니다.', color: '#8a8f98', pipMap: { 1: 2 }, icon: '🪨', long: '1이 나오면 2로 바뀝니다.' },
  { id: 'steel', name: '강철', rarity: 'common', desc: '방어 카드에 쓰면 방어도를 3 더 얻습니다.', v: { b: 3 }, color: '#b8c4d6', blockBonus: 3, icon: '⚙️', long: '방어 카드에 쓰면 방어도를 3 더 얻습니다.' },
  { id: 'glass', name: '유리', rarity: 'rare', desc: '카드에 쓰면 눈이 2배로 계산됩니다. 1이 나오면 깨져서 이번 전투 동안 쓸 수 없습니다.', color: '#8fe3ff', powerMult: 2, breakOn: 1, icon: '🧊', long: '카드에 쓰면 눈이 2배로 계산됩니다. 1이 나오면 깨져서 이번 전투 동안 쓸 수 없습니다.' },
  { id: 'gold', name: '황금', rarity: 'rare', desc: '쓰지 않고 남기면 저금통에 눈의 2배가 쌓입니다.', color: '#ffc935', piggyMult: 2, icon: '💛', long: '쓰지 않고 남기면 저금통에 눈의 2배가 쌓입니다.' },
  { id: 'lead', name: '납', rarity: 'rare', desc: '4~6만 나옵니다. 대신 리롤할 수 없습니다.', color: '#5b6070', rollFaces: [3, 4, 5], noReroll: true, icon: '⚓', long: '4~6만 나옵니다. 대신 리롤할 수 없습니다.' },
  { id: 'crystal', name: '수정', rarity: 'epic', desc: '리롤해서 더 낮은 눈이 나오면 원래 눈을 지킵니다.', color: '#d38cff', keepBest: true, icon: '🔮', long: '리롤해서 더 낮은 눈이 나오면 원래 눈을 지킵니다.' },
  { id: 'cursed', name: '저주받은', rarity: 'epic', desc: '카드에 쓰면 눈이 3배로 계산됩니다. 대신 매 턴 체력을 2 잃습니다.', v: { d: 2 }, color: '#7a1f3d', powerMult: 3, turnSelfDmg: 2, icon: '😈', long: '카드에 쓰면 눈이 3배로 계산됩니다. 대신 매 턴 체력을 2 잃습니다.' },
  { id: 'rainbow', name: '무지개', rarity: 'legendary', desc: '족보를 따질 때 가장 유리한 눈으로 칩니다.', color: 'rainbow', wild: true, icon: '🌈', long: '족보를 따질 때 가장 유리한 눈으로 칩니다.' },
];

export const MATERIAL_BY_ID = Object.fromEntries(MATERIALS.map((m) => [m.id, m])) as Record<string, MaterialDef>;
