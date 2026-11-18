// 계열 태그 단계 효과 (3·5·7장) + 숨은 콤보 20종
import type { EffectSource } from '../rules/ctx';
import { drawCards } from '../rules/deck';
import { addJackpot, cbOf } from '../rules/ops';
import type { Tag } from './tags';

export interface TierDef {
  desc: string;
  src: Omit<EffectSource, 'id' | 'name'>;
}

/** 단계 효과는 누적: 2단계면 1·2단계 효과가 모두 켜진다 */
export const TAG_TIER_FX: Record<Tag, [TierDef, TierDef, TierDef]> = {
  blade: [
    { desc: '전투 시작 시 힘 +1', src: { hooks: { onCombatStart: (c) => { cbOf(c).pStr += 1; } } } },
    { desc: '매 턴 첫 공격 카드 사용 시 1장 뽑기', src: { mods: { firstAtkDraw: 1 } } },
    { desc: '매 턴 첫 공격 카드 피해 +50%', src: { mods: { firstAtkPct: 50 } } },
  ],
  curse: [
    { desc: '독이 2턴에 1씩만 줄어듦', src: { mods: { poisonSlow: 1 } } },
    { desc: '내가 거는 약화·취약 지속 +1턴', src: { mods: { debuffTurns: 1 } } },
    { desc: '독 피해의 50%가 다른 무작위 적에게도', src: { mods: { poisonSplash: 50 } } },
  ],
  shield: [
    { desc: '전투 시작 방어 4', src: { mods: { firstTurnBlock: 4 } } },
    { desc: '남은 방어도의 25%가 다음 턴으로', src: { mods: { blockCarryPct: 25 } } },
    { desc: '방어도를 얻을 때마다 무작위 적에게 그 20% 피해', src: { mods: { blockToDmgPct: 20 } } },
  ],
  gamble: [
    { desc: '도박 카드 성공 확률 +5%p', src: { mods: { gambleOdds: 5 } } },
    { desc: '도박 실패 시 잭팟 +10%', src: { mods: { gambleFailJackpot: 10 } } },
    { desc: '도박 성공 효과 ×1.5, 성공 시 1장 뽑기', src: { mods: { gambleWinMult: 0.5, gambleWinDraw: 1 } } },
  ],
  eco: [
    { desc: '저금통 정산 +15%', src: { mods: { piggyPct: 0.15 } } },
    { desc: '전투 보상 골드 +10', src: { mods: { rewardGold: 10 } } },
    { desc: '턴 시작마다 저금통의 10%만큼 방어', src: { mods: { piggyBlockPct: 10 } } },
  ],
  chain: [
    { desc: '한 턴에 4번째 카드를 쓰면 1장 뽑기', src: { mods: { drawOnNth: 4 } } },
    { desc: '턴 시작 드로우 +1', src: { mods: { drawPerTurn: 1 } } },
    { desc: '매 턴 5번째 카드부터 비용 0', src: { mods: { freeFromNth: 5 } } },
  ],
  rig: [
    { desc: '턴당 리롤 +1', src: { mods: { rerolls: 1 } } },
    { desc: '주사위를 돌려받는 카드 사용 시 1장 뽑기 (턴당 2회)', src: { mods: { retDraw: 1 } } },
    { desc: '턴당 1회 주사위 1개를 원하는 눈으로', src: { mods: { turnGodhand: 1 } } },
  ],
  hand: [
    { desc: '원 페어 이상이면 족보 칩 +1', src: { hooks: { onHandScored: (c, a) => { if (a.hand && a.hand.id !== 'none' && !cbOf(c).turnCounters.tagChip) { cbOf(c).turnCounters.tagChip = 1; cbOf(c).handChips += 1; } } } } },
    { desc: '모든 족보 배율 +0.3', src: { mods: { handAll: 0.3 } } },
    { desc: '노 핸드를 원 페어로 판정', src: { mods: { noneAsPair: 1 } } },
  ],
};

export interface ComboDef {
  id: string;
  name: string;
  a: string;
  b: string;
  desc: string;
  char?: string; // 캐릭터 전용 콤보
  src: Omit<EffectSource, 'id' | 'name'>;
}

/** 두 카드가 같은 덱에 있으면 켜지는 숨은 콤보 */
export const COMBOS: ComboDef[] = [
  { id: 'bladestorm', name: '칼날 폭풍', a: 'twin', b: 'triple', desc: '쌍검이 피해를 2번 줍니다.', src: { cards: { twin: { v: { h: 2 } } } } },
  { id: 'chainreact', name: '연쇄 반응', a: 'poison', b: 'catalyst', desc: '기폭제 비용 0.', src: { cards: { catalyst: { cost: 0 } } } },
  { id: 'hedgehog', name: '고슴도치', a: 'thorns', b: 'counter', desc: '반사·반격 피해 2배.', src: { mods: { reflectMult: 1 } } },
  {
    id: 'addict', name: '도박 중독', a: 'gamble', b: 'roulette', desc: '도박에 실패할 때마다 잭팟 +10%, 힘 +1 (전투 끝까지).',
    src: { hooks: { onGambleCard: (c, a) => { if (!a.win) { addJackpot(c, 10); cbOf(c).pStr += 1; } } } },
  },
  { id: 'goldenegg', name: '황금알', a: 'invest', b: 'midas', desc: '미다스의 손을 전투당 2번 쓸 수 있습니다.', src: { cards: { midas: { perCombat: 2 } } } },
  { id: 'resonance', name: '공명', a: 'echo', b: 'chain', desc: '메아리로 연쇄 번개를 다시 쓰면 피해 2배.', src: { cards: { chain: { v: { echoMult: 2 } } } } },
  {
    id: 'fidget', name: '만지작', a: 'bump', b: 'flip', desc: '올리기·뒤집기를 쓰면 1장 뽑기 (턴당 2번).',
    src: { hooks: { onCardPlay: (c, a) => { const cb = cbOf(c); if (a.card && ['bump', 'flip'].includes(a.card.id) && (cb.turnCounters.fidget ?? 0) < 2) { cb.turnCounters.fidget = (cb.turnCounters.fidget ?? 0) + 1; drawCards(c, 1); } } } },
  },
  {
    id: 'yinyang', name: '음양', a: 'evenstab', b: 'oddcut', desc: '같은 턴에 둘 다 쓰면 다음 카드 비용 0.',
    src: { hooks: { onCardPlay: (c, a) => { const cb = cbOf(c); if (!a.card) return; if (a.card.id === 'evenstab') cb.turnCounters.yyE = 1; if (a.card.id === 'oddcut') cb.turnCounters.yyO = 1; if (cb.turnCounters.yyE && cb.turnCounters.yyO && !cb.turnCounters.yyDone) { cb.turnCounters.yyDone = 1; cb.turnCounters.nextFree = (cb.turnCounters.nextFree ?? 0) + 1; } } } },
  },
  {
    id: 'perfection', name: '완벽주의', a: 'straight', b: 'yahtzeehammer', desc: '스트레이트를 쓴 다음 턴, 첫 굴림 주사위 2개가 같은 눈.',
    src: { hooks: { onCardPlay: (c, a) => { if (a.card?.id === 'straight') cbOf(c).next.sameFirst = 1; } } },
  },
  {
    id: 'sevencoin', name: '세븐 코인', a: 'coinflip', b: 'lucky7', desc: '럭키 세븐을 쓰면 버린 더미의 동전 던지기 1장이 손으로.',
    src: { hooks: { onCardPlay: (c, a) => { if (a.card?.id !== 'lucky7') return; const cb = cbOf(c); const i = cb.discard.findIndex((x) => x.id === 'coinflip'); if (i >= 0) cb.cards.push(...cb.discard.splice(i, 1)); } } },
  },
  { id: 'sentence', name: '사형 선고', a: 'expose', b: 'execute', desc: '취약 상태 적에게는 처형을 아무 눈으로 쓸 수 있습니다.', src: { cards: { execute: { condVuln: { k: 'any' } } } } },
  { id: 'citadel', name: '철옹성', a: 'brace', b: 'bulwark', desc: '철벽이 켜진 전투에서 굳건함 방어 ×2.', src: { cards: { brace: { v: { bwx: 2 } } } } },
  {
    id: 'highroller', name: '하이 롤러', a: 'allin', b: 'doubledown', desc: '더블다운 다음 올인은 저금통을 몰수당하지 않습니다.',
    src: { hooks: { onCardPlay: (c, a) => { if (a.card?.id === 'doubledown') cbOf(c).turnCounters.allinSafe = 1; } } },
  },
  { id: 'runaway', name: '폭주 기관', a: 'link', b: 'infinitechain', desc: '무한 연쇄를 쓰면 3장 뽑기.', src: { cards: { infinitechain: { v: { d: 3 } } } } },
  { id: 'forgery', name: '위조 지폐', a: 'fate', b: 'duplicate', desc: '복제의 복사본 눈을 원하는 값으로.', src: { cards: { duplicate: { choose: 'value' } } } },
  { id: 'bloodfeast', name: '피의 축제', a: 'rally', b: 'vampire', desc: '흡혈 회복량에 힘 수치를 더합니다.', src: { cards: { vampire: { v: { hs: 1 } } } } },
  { id: 'bigfeeling', name: '대박 예감', a: 'jackpotshot', b: 'jackpotrush', char: 'gambler', desc: '잭팟 턴 동안 잭팟 노리기 피해 ×3.', src: { cards: { jackpotshot: { v: { jt: 3 } } } } },
  { id: 'compoundhell', name: '복리 지옥', a: 'interestbomb', b: 'usury', char: 'merchant', desc: '고리대의 매 턴 독 증가량에 보유 골드÷20 추가.', src: { cards: { usury: { v: { gp: 20 } } } } },
  { id: 'swordrain', name: '검의 비', a: 'resolve', b: 'thousandcuts', char: 'knight', desc: '천 개의 칼날이 때릴 때마다 힘 +1 (1턴, 최대 +5).', src: { mods: { cutsStr: 1 } } },
  { id: 'tazza', name: '타짜', a: 'sleight', b: 'deckstack', char: 'sharp', desc: '덱 쌓기로 본 카드 중 1장을 손으로 가져오고 1장 더 뽑습니다.', src: { cards: { deckstack: { vAdd: { d: 1 } } } } },
];

export const COMBO_BY_ID = Object.fromEntries(COMBOS.map((c) => [c.id, c])) as Record<string, ComboDef>;
