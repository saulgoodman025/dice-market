import type { EffectSource } from '../rules/ctx';
import { gainBlock } from '../rules/ops';

export interface CharacterDef extends EffectSource {
  emoji: string;
  hp: number;
  dice: string[]; // 재질 목록 (5개)
  skills: string[];
  desc: string;
  unlock: string; // 해금 조건 플래그 (meta.flags)
  unlockText: string;
}

export const CHARACTERS: CharacterDef[] = [
  {
    id: 'gambler', name: '도박사', emoji: '🎰', hp: 55,
    dice: ['glass', 'glass', 'wood', 'wood', 'wood'],
    skills: ['slash', 'guard', 'gamble', 'coinflip'],
    desc: '더블 오어 낫싱 성공 범위 4~6 → 3~6',
    mods: { donMinDelta: -1 },
    unlock: '', unlockText: '기본',
  },
  {
    id: 'merchant', name: '상인', emoji: '💼', hp: 60,
    dice: ['gold', 'wood', 'wood', 'wood', 'wood'],
    skills: ['slash', 'guard', 'invest', 'jab'],
    desc: '상품당 흥정 2회, 이자 상한 +3G',
    mods: { haggleCount: 1, interestCap: 3 },
    unlock: 'act1boss', unlockText: '1막 보스 처치',
  },
  {
    id: 'knight', name: '기사', emoji: '🛡️', hp: 75,
    dice: ['steel', 'steel', 'wood', 'wood', 'wood'],
    skills: ['slash', 'guard', 'thorns', 'bash'],
    desc: '턴 시작 시 방어 3',
    hooks: { onTurnStart: (c) => gainBlock(c, 3) },
    unlock: 'act2', unlockText: '2막 도달',
  },
  {
    id: 'sharp', name: '사기꾼', emoji: '🃏', hp: 50,
    dice: ['crystal', 'wood', 'wood', 'wood', 'wood'],
    skills: ['slash', 'guard', 'bump', 'flip'],
    desc: '턴당 리롤 3회, 다음 턴 첫 주사위 1개 미리보기',
    mods: { rerolls: 1, preview: 1 },
    unlock: 'clear', unlockText: '첫 클리어',
  },
];

export const CHAR_BY_ID = Object.fromEntries(CHARACTERS.map((c) => [c.id, c])) as Record<string, CharacterDef>;
