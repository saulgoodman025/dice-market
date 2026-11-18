// 증강 56종 (실버 24 · 골드 20 · 프리즘 12). 유물과 같은 mods/hooks 체계를 쓴다.
// 모든 증강은 자기 태그를 +1로 센다 (무색 제외).
import type { EffectSource } from '../rules/ctx';
import { rng } from '../rules/ctx';
import { drawCards } from '../rules/deck';
import { alive, cbOf, damageEnemy, damagePlayer, gainGold, targetEnemy } from '../rules/ops';
import { CARD_BY_ID } from './cards';
import type { Tag } from './tags';

export type AugTier = 'silver' | 'gold' | 'prism';

export interface AugmentDef extends EffectSource {
  tier: AugTier;
  tag?: Tag;
  icon: string;
  desc: string;
  exclusive?: string[]; // 함께 가질 수 없는 증강
}

const A = (d: AugmentDef) => d;

export const AUGMENTS: AugmentDef[] = [
  // ═════════ 실버 ═════════
  A({ id: 'whetstone', name: '날 세우기', tier: 'silver', tag: 'blade', icon: '🔪', desc: '공격 카드 피해 +2.', mods: { atkFlat: 2 } }),
  A({ id: 'bloodthirst', name: '피의 굶주림', tier: 'silver', tag: 'blade', icon: '🩸', desc: '적을 처치하면 체력 3 회복.', mods: { killHeal: 3 } }),
  A({ id: 'woodsword', name: '연습용 목검', tier: 'silver', tag: 'blade', icon: '🪵', desc: '전투 시작 시 힘 +1.', hooks: { onCombatStart: (c) => { cbOf(c).pStr += 1; } } }),
  A({
    id: 'rotblade', name: '썩은 칼날', tier: 'silver', tag: 'curse', icon: '🗡️', desc: '공격 카드를 쓰면 25% 확률로 대상에게 독 2.',
    hooks: { onCardPlay: (c, a) => { if (a.card && CARD_BY_ID[a.card.id]?.role === 'atk' && rng(c, 'combat').chance(0.25)) { const t = targetEnemy(cbOf(c)); if (t) t.poison += 2; } } },
  }),
  A({ id: 'sickly', name: '병약', tier: 'silver', tag: 'curse', icon: '🤒', desc: '약화된 적이 주는 피해 추가 -10%.', mods: { frailExtra: 0.1 } }),
  A({ id: 'potency', name: '독성 강화', tier: 'silver', tag: 'curse', icon: '☠️', desc: '독을 걸 때 +1.', mods: { poisonAdd: 1 } }),
  A({ id: 'thickhide', name: '두꺼운 가죽', tier: 'silver', tag: 'shield', icon: '🦏', desc: '방어 카드 방어 +2.', mods: { blockFlat: 2 } }),
  A({ id: 'callus', name: '굳은살', tier: 'silver', tag: 'shield', icon: '✋', desc: '매 턴 시작 방어 2.', mods: { turnBlock: 2 } }),
  A({ id: 'reflexes', name: '반사 신경', tier: 'silver', tag: 'shield', icon: '⚡', desc: '반사·반격 피해 +2.', mods: { reflectAdd: 2 } }),
  A({ id: 'rabbitfoot', name: '토끼발', tier: 'silver', tag: 'gamble', icon: '🐇', desc: '도박 카드 성공 확률 +5%p.', mods: { gambleOdds: 5 } }),
  A({ id: 'stakes2x', name: '판돈 2배', tier: 'silver', tag: 'gamble', icon: '✌️', desc: '더블 오어 낫싱 최대 연속 +1번.', mods: { donMaxStreak: 1 } }),
  A({ id: 'jackpotnose', name: '잭팟 냄새', tier: 'silver', tag: 'gamble', icon: '👃', desc: '잭팟 게이지 획득량 +20%.', mods: { jackpotGainPct: 20 } }),
  A({ id: 'penny', name: '짠돌이', tier: 'silver', tag: 'eco', icon: '🪙', desc: '이자 상한 +3.', mods: { interestCap: 3 } }),
  A({ id: 'coinpurse', name: '동전 지갑', tier: 'silver', tag: 'eco', icon: '👛', desc: '전투 보상 골드 +5.', mods: { rewardGold: 5 } }),
  A({ id: 'couponbook', name: '쿠폰북', tier: 'silver', tag: 'eco', icon: '🎫', desc: '상점 카드 삭제 비용 -25G.', mods: { removeDiscount: 25 } }),
  A({ id: 'nimble', name: '손놀림', tier: 'silver', tag: 'chain', icon: '🤹', desc: '전투 첫 턴 카드 +2장.', mods: { firstTurnDraw: 2 } }),
  A({ id: 'rhythm', name: '리듬', tier: 'silver', tag: 'chain', icon: '🥁', desc: '매 턴 3번째 카드 비용 -1.', mods: { rhythm: 1 } }),
  A({
    id: 'bounce', name: '탄력', tier: 'silver', tag: 'chain', icon: '🏀', desc: '비용 0 카드를 쓰면 20% 확률로 1장 뽑기.',
    hooks: { onCardPlay: (c, a) => { if (a.amount === 0 && rng(c, 'combat').chance(0.2)) drawCards(c, 1); } },
  }),
  A({ id: 'sparecup', name: '여분의 컵', tier: 'silver', tag: 'rig', icon: '🥤', desc: '턴당 리롤 +1.', mods: { rerolls: 1 } }),
  A({
    id: 'practice', name: '굴림 연습', tier: 'silver', tag: 'rig', icon: '🎯', desc: '매 턴 첫 리롤 때 가장 낮은 주사위 +1.',
    hooks: { onReroll: (c) => { const cb = cbOf(c); if (cb.turnCounters.practice) return; cb.turnCounters.practice = 1; const lo = cb.hand.filter((h) => !h.used && h.pip < 6).sort((x, y) => x.pip - y.pip)[0]; if (lo) lo.pip++; } },
  }),
  A({ id: 'wristsnap', name: '손목 스냅', tier: 'silver', tag: 'rig', icon: '🔥', desc: '주사위 태우기로 2장 뽑기.', mods: { burnDraw: 1 } }),
  A({
    id: 'pairmania', name: '페어 마니아', tier: 'silver', tag: 'hand', icon: '👯', desc: '원 페어일 때 족보 칩 +1.',
    hooks: { onHandScored: (c, a) => { if (a.hand?.id === 'pair') cbOf(c).handChips += 1; } },
  }),
  A({ id: 'oddeven', name: '홀짝 감별사', tier: 'silver', tag: 'hand', icon: '⚖️', desc: '플러시 배율 +0.5.', mods: { handAdd: { flush: 0.5 } } }),
  A({ id: 'handstudy', name: '족보 연구', tier: 'silver', tag: 'hand', icon: '📖', desc: '족보 드로우 조건이 원 페어 이상으로 완화.', mods: { handDrawMin: 1 } }),

  // ═════════ 골드 ═════════
  A({ id: 'berserk', name: '광전사', tier: 'gold', tag: 'blade', icon: '😤', desc: '체력 50% 이하에서 공격 피해 +40%.', dmgMult: (c) => (c.run.hp <= c.run.maxHp / 2 ? 1.4 : 1) }),
  A({ id: 'flurry', name: '연속 베기', tier: 'gold', tag: 'blade', icon: '🌀', desc: '한 턴 3번째 공격 카드부터 피해 ×1.5.', dmgMult: (c) => ((c.run.combat?.turnCounters.atkPlayed ?? 0) >= 2 ? 1.5 : 1) }),
  A({ id: 'weaponmastery', name: '무기 숙련', tier: 'gold', tag: 'blade', icon: '🗡️', desc: '강화된 공격 카드 피해 +30%.', mods: { upAtkPct: 30 } }),
  A({
    id: 'plaguecarrier', name: '역병 운반자', tier: 'gold', tag: 'curse', icon: '🐀', desc: '독 걸린 적이 죽으면 남은 독이 다른 무작위 적에게 옮겨감.',
    hooks: { onKill: (c, a) => { const e = a.enemy; if (!e || e.poison <= 0) return; const o = alive(cbOf(c)); if (o.length) rng(c, 'combat').pick(o).poison += e.poison; } },
  }),
  A({ id: 'weakspot', name: '약점 파악', tier: 'gold', tag: 'curse', icon: '🎯', desc: '취약 배율 ×1.5 → ×1.75.', mods: { vulnExtra: 0.25 } }),
  A({ id: 'spikedarmor', name: '가시 갑주', tier: 'gold', tag: 'shield', icon: '🦔', desc: '방어도가 깎일 때마다 공격자에게 3 피해.', mods: { spikes: 3 } }),
  A({ id: 'shieldmaster', name: '방패 숙련', tier: 'gold', tag: 'shield', icon: '🛡️', desc: '강화된 방어 카드 방어 +50%.', mods: { upBlockPct: 50 } }),
  A({ id: 'ironwill', name: '강철 의지', tier: 'gold', tag: 'shield', icon: '🗿', desc: '전투당 1번, 방어도 30 이상일 때 받는 공격 무효.', mods: { ironwill: 1 } }),
  A({
    id: 'highstakes', name: '하이 롤러', tier: 'gold', tag: 'gamble', icon: '🎩', desc: '도박 카드 성공 확률 +10%p. 실패할 때마다 체력 -3.', mods: { gambleOdds: 10 },
    hooks: { onGambleCard: (c, a) => { if (!a.win) damagePlayer(c, 3, '하이 롤러', { ignoreBlock: true }); } },
  }),
  A({ id: 'gamblersfallacy', name: '도박꾼의 오류', tier: 'gold', tag: 'gamble', icon: '🔮', desc: '도박 카드가 3번 연속 실패하면 다음 도박 카드는 확정 성공.', mods: { fallacy: 1 } }),
  A({
    id: 'sevenseven', name: '세븐 세븐', tier: 'gold', tag: 'gamble', icon: '7️⃣', desc: '족보를 확정할 때 합이 7인 주사위 2개가 있으면 골드 +3 (턴당 1번).',
    hooks: { onHandScored: (c) => { const cb = cbOf(c); if (cb.turnCounters.seven) return; const p = cb.hand.filter((h) => !h.used && !h.gone).map((h) => h.pip); if (p.some((x, i) => p.some((y, j) => i !== j && x + y === 7))) { cb.turnCounters.seven = 1; gainGold(c, 3); } } },
  }),
  A({ id: 'compoundmagic', name: '복리의 마법', tier: 'gold', tag: 'eco', icon: '🪄', desc: '저금통 정산 +30%.', mods: { piggyPct: 0.3 } }),
  A({ id: 'shopvip', name: '상점 VIP', tier: 'gold', tag: 'eco', icon: '💳', desc: '상점마다 카드 1장 무료.', mods: { shopFreeCard: 1 } }),
  A({ id: 'prodigy', name: '투자 귀재', tier: 'gold', tag: 'eco', icon: '🧑‍💼', desc: '전투 시작 시 저금통 +10.', mods: { combatPiggy: 10 } }),
  A({ id: 'cardstorm', name: '카드 폭풍', tier: 'gold', tag: 'chain', icon: '🌪️', desc: '턴 시작 드로우 +1, 손패 상한 +2.', mods: { drawPerTurn: 1, handMax: 2 } }),
  A({
    id: 'chainreaction', name: '연쇄 반응', tier: 'gold', tag: 'chain', icon: '💥', desc: '한 턴에 카드 5장을 쓰면 모든 적에게 10 피해.',
    hooks: { onCardPlay: (c) => { const cb = cbOf(c); if (cb.cardsPlayed === 5) for (const e of alive(cb)) damageEnemy(c, e, 10, { source: '연쇄 반응' }); } },
  }),
  A({
    id: 'loadedrainbow', name: '사기 주사위', tier: 'gold', tag: 'rig', icon: '🌈', desc: '얻으면 주사위 1개를 무지개 재질로 (족보에서 가장 유리한 눈).',
    hooks: { onAcquire: (c) => { const d = c.run.dice.find((x) => x.material === 'wood') ?? c.run.dice[0]; if (d) d.material = 'rainbow'; } },
  }),
  A({ id: 'riggermaster', name: '조작의 달인', tier: 'gold', tag: 'rig', icon: '🧤', desc: '주사위를 돌려받는 카드 비용 0.', mods: { freeRet: 1 } }),
  A({
    id: 'fullhouseaddict', name: '풀하우스 중독', tier: 'gold', tag: 'hand', icon: '🏠', desc: '풀하우스 배율 +1, 풀하우스면 족보 칩 +2.', mods: { handAdd: { full: 1 } },
    hooks: { onHandScored: (c, a) => { if (a.hand?.id === 'full') cbOf(c).handChips += 2; } },
  }),
  A({ id: 'straightflush', name: '스트레이트 플러시', tier: 'gold', tag: 'hand', icon: '🌊', desc: '스트레이트와 플러시가 동시에 성립하면 두 배율을 곱함.', mods: { straightFlush: 1 } }),

  // ═════════ 프리즘 ═════════
  A({ id: 'finalform', name: '최종 형태', tier: 'prism', tag: 'blade', icon: '👹', desc: '힘이 2배로 적용됩니다.', mods: { strMult: 1 } }),
  A({ id: 'plaguelord', name: '역병 군주', tier: 'prism', tag: 'curse', icon: '🦠', desc: '독 피해가 모든 적에게 동시에 들어갑니다.', mods: { poisonAll: 1 } }),
  A({ id: 'eternalfort', name: '불멸의 요새', tier: 'prism', tag: 'shield', icon: '🏯', desc: '방어도가 턴이 바뀌어도 사라지지 않습니다 (최대 60).', mods: { blockPersistCap: 60 } }),
  A({ id: 'beatthehouse', name: '하우스를 이겨라', tier: 'prism', tag: 'gamble', icon: '🃏', desc: '도박 카드·카지노 장치 확률 +15%p (더블 오어 낫싱 성공 눈 1칸 확대, 파쇄기 포함).', mods: { gambleOdds: 15, casinoOdds: 15, donMinDelta: -1 } }),
  A({ id: 'madgambler', name: '미친 도박사', tier: 'prism', tag: 'gamble', icon: '🤪', desc: '도박 카드가 실패해도 성공 효과의 50%가 발동합니다.', mods: { gambleFailHalf: 1 } }),
  A({ id: 'centralbank', name: '중앙은행', tier: 'prism', tag: 'eco', icon: '🏦', desc: '턴당 1번, 저금통에서 원하는 만큼 꺼내 1골드당 1 피해 (대상 지정).', mods: { centralBank: 1 } }),
  A({
    id: 'perpetual', name: '무한 동력', tier: 'prism', tag: 'chain', icon: '♾️', desc: '비용 0 카드를 쓸 때마다 1장 뽑기.',
    hooks: { onCardPlay: (c, a) => { if (a.amount === 0) drawCards(c, 1); } },
  }),
  A({ id: 'godhand2', name: '신의 손', tier: 'prism', tag: 'rig', icon: '🖐️', desc: '턴당 1번 주사위 1개를 원하는 눈으로 (유물 「신의 손」과 겹치면 2번).', mods: { turnGodhand: 1 } }),
  A({ id: 'yahtzeeblood', name: '야찌 체질', tier: 'prism', tag: 'hand', icon: '🧬', desc: '같은 눈 4개를 야찌로 판정합니다.', mods: { fourIsYahtzee: 1 } }),
  A({ id: 'polymath', name: '다재다능', tier: 'prism', icon: '🌟', desc: '모든 태그 +1.', mods: { tagBonus: { blade: 1, curse: 1, shield: 1, gamble: 1, eco: 1, chain: 1, rig: 1, hand: 1 } } }),
  A({ id: 'collector', name: '카드 수집가', tier: 'prism', icon: '🗂️', desc: '덱이 25장 이상이면 모든 카드 효과 +25%.', mods: { collector: 1 }, exclusive: ['minimalist'] }),
  A({ id: 'minimalist', name: '미니멀리스트', tier: 'prism', icon: '🪶', desc: '덱이 12장 이하면 드로우 +1, 비용 0 카드 효과 2배.', mods: { minimalist: 1 }, exclusive: ['collector'] }),
];

export const AUGMENT_BY_ID = Object.fromEntries(AUGMENTS.map((a) => [a.id, a])) as Record<string, AugmentDef>;

export const AUG_TIER_INFO: Record<AugTier, { name: string; color: string }> = {
  silver: { name: '실버', color: '#c9d1d9' },
  gold: { name: '골드', color: '#f5c542' },
  prism: { name: '프리즘', color: '#d38cff' },
};

/** 획득 시점별 등급 확률 (표시, DDA 미적용) — [실버, 골드, 프리즘] */
export const AUG_ODDS: { key: string; label: string; w: [number, number, number] }[] = [
  { key: '1-1', label: '1막 1층', w: [60, 35, 5] },
  { key: '1-b', label: '1막 보스', w: [30, 55, 15] },
  { key: '2-1', label: '2막 1층', w: [30, 55, 15] },
  { key: '2-b', label: '2막 보스', w: [10, 55, 35] },
  { key: '3-1', label: '3막 1층', w: [10, 50, 40] },
];
