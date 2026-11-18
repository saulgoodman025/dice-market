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
}

export const MATERIALS: MaterialDef[] = [
  { id: 'wood', name: '나무', rarity: 'common', desc: '기본 재질', color: '#a8743f', inShop: false },
  { id: 'stone', name: '돌', rarity: 'common', desc: '1이 나와도 2로', color: '#8a8f98', pipMap: { 1: 2 } },
  { id: 'steel', name: '강철', rarity: 'common', desc: '방어에 쓰면 +{b}', v: { b: 3 }, color: '#b8c4d6', blockBonus: 3 },
  { id: 'glass', name: '유리', rarity: 'rare', desc: '효과 2배 · 1이 나오면 깨짐', color: '#8fe3ff', powerMult: 2, breakOn: 1 },
  { id: 'gold', name: '황금', rarity: 'rare', desc: '저금통에 2배로', color: '#ffc935', piggyMult: 2 },
  { id: 'lead', name: '납', rarity: 'rare', desc: '4~6만 나옴 · 리롤 안 됨', color: '#5b6070', rollFaces: [3, 4, 5], noReroll: true },
  { id: 'crystal', name: '수정', rarity: 'epic', desc: '리롤해도 높은 눈 유지', color: '#d38cff', keepBest: true },
  { id: 'cursed', name: '저주받은', rarity: 'epic', desc: '효과 3배 · 매 턴 체력 -{d}', v: { d: 2 }, color: '#7a1f3d', powerMult: 3, turnSelfDmg: 2 },
  { id: 'rainbow', name: '무지개', rarity: 'legendary', desc: '족보에서 아무 눈으로 쳐줌', color: 'rainbow', wild: true },
];

export const MATERIAL_BY_ID = Object.fromEntries(MATERIALS.map((m) => [m.id, m])) as Record<string, MaterialDef>;
