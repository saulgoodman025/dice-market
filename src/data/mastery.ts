// 캐릭터 숙련도: 판을 할수록 오르는 레벨. 보상은 꾸미기와 짧은 이야기 (능력치에는 영향 없음)

export const MASTERY_LEVELS = [0, 20, 50, 100, 170, 260]; // 레벨 1~6에 필요한 누적 경험치

export interface Cosmetic {
  id: string;
  name: string;
  kind: 'skin' | 'felt';
  preview: string; // CSS 색
}

export const SKINS: Cosmetic[] = [
  { id: 'ivory', name: '상아', kind: 'skin', preview: '#f3dfb8' },
  { id: 'ruby', name: '루비', kind: 'skin', preview: '#e0566a' },
  { id: 'sapphire', name: '사파이어', kind: 'skin', preview: '#4f8fe8' },
  { id: 'emerald', name: '에메랄드', kind: 'skin', preview: '#3fbf86' },
  { id: 'obsidian', name: '흑요석', kind: 'skin', preview: '#3a3f46' },
  { id: 'gold', name: '24K', kind: 'skin', preview: '#f2b544' },
];

export const FELTS: Cosmetic[] = [
  { id: 'green', name: '카지노 그린', kind: 'felt', preview: '#1a3b33' },
  { id: 'blue', name: '미드나잇 블루', kind: 'felt', preview: '#16304f' },
  { id: 'red', name: '베가스 레드', kind: 'felt', preview: '#4a1820' },
  { id: 'purple', name: 'VIP 퍼플', kind: 'felt', preview: '#33204a' },
  { id: 'black', name: '하이롤러 블랙', kind: 'felt', preview: '#1b1d20' },
];

/** 캐릭터별 레벨 보상: [레벨, 보상] */
export const MASTERY_REWARDS: Record<string, { level: number; reward: string; story?: string }[]> = {
  gambler: [
    { level: 2, reward: 'skin:ruby' },
    { level: 3, reward: 'felt:red' },
    { level: 4, reward: 'story', story: '도박사는 하우스에 빚을 졌다. 갚을 방법은 하나, 하우스를 이기는 것.' },
    { level: 5, reward: 'skin:gold' },
    { level: 6, reward: 'story', story: '마지막 판에서 그는 웃었다. "확률은 거짓말을 안 해. 사람이 하지."' },
  ],
  merchant: [
    { level: 2, reward: 'skin:emerald' },
    { level: 3, reward: 'felt:purple' },
    { level: 4, reward: 'story', story: '상인은 하우스에 물건을 대던 사람이었다. 어느 날 장부가 맞지 않았다.' },
    { level: 6, reward: 'story', story: '"모든 건 값이 있지. 하우스의 값도."' },
  ],
  knight: [
    { level: 2, reward: 'skin:sapphire' },
    { level: 3, reward: 'felt:blue' },
    { level: 4, reward: 'story', story: '기사는 하우스의 경비였다. 지키던 문 안쪽을 본 뒤로 방패를 돌려 잡았다.' },
    { level: 6, reward: 'story', story: '"막는 것도 이기는 방법이다."' },
  ],
  sharp: [
    { level: 2, reward: 'skin:obsidian' },
    { level: 3, reward: 'felt:black' },
    { level: 4, reward: 'story', story: '사기꾼은 하우스의 딜러였다. 누구보다 주사위를 잘 다뤘다. 너무 잘.' },
    { level: 6, reward: 'story', story: '"눈속임이 아니야. 기술이지."' },
  ],
};

export function masteryLevel(xp: number): number {
  let lv = 1;
  MASTERY_LEVELS.forEach((need, i) => { if (xp >= need) lv = i + 1; });
  return lv;
}
