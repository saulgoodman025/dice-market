import type { Rarity } from '../core/state';
import type { EffectSource } from '../rules/ctx';
import { toast } from '../rules/ctx';
import {
  addHeat, addJackpot, alive, damageEnemy, gainBlock, gainGold, healPlayer,
} from '../rules/ops';
import { newDie } from '../rules/dice';
import { BALANCE } from './balance';

export interface RelicDef extends EffectSource {
  rarity: Rarity;
  emoji: string;
  desc: string;
  cat: 'hand' | 'eco' | 'gamble' | 'manip' | 'survive';
}

const R = (r: RelicDef) => r;

export const RELICS: RelicDef[] = [
  // ── 족보형 ──
  R({ id: 'pairpin', name: '페어 핀', emoji: '📌', rarity: 'common', cat: 'hand', desc: '원 페어 배율 ×1.2 → ×1.4', mods: { handAdd: { pair: 0.2 } } }),
  R({ id: 'twopairtie', name: '투페어 넥타이', emoji: '👔', rarity: 'common', cat: 'hand', desc: '투 페어 시 방어 +6', hooks: { onHandScored: (c, a) => { if (a.hand?.id === 'twopair') gainBlock(c, 6); } } }),
  R({ id: 'flushring', name: '플러시 반지', emoji: '💍', rarity: 'rare', cat: 'hand', desc: '플러시 배율 +0.5', mods: { handAdd: { flush: 0.5 } } }),
  R({ id: 'tripletiara', name: '트리플 티아라', emoji: '👑', rarity: 'rare', cat: 'hand', desc: '트리플 시 잭팟 +10%', hooks: { onHandScored: (c, a) => { if (a.hand?.id === 'triple') addJackpot(c, 10); } } }),
  R({ id: 'smallladder', name: '작은 사다리', emoji: '🪜', rarity: 'rare', cat: 'hand', desc: '스몰 스트레이트를 연속 3개로도 인정', mods: { smallLadder: 1 } }),
  R({ id: 'fullhouse', name: '하우스 열쇠', emoji: '🏠', rarity: 'epic', cat: 'hand', desc: '풀하우스 시 골드 +15', hooks: { onHandScored: (c, a) => { if (a.hand?.id === 'full') gainGold(c, 15); } } }),
  R({
    id: 'bigladder', name: '황금 사다리', emoji: '🌟', rarity: 'epic', cat: 'hand', desc: '라지 스트레이트 시 모든 적 피해 20',
    hooks: { onHandScored: (c, a) => { if (a.hand?.id === 'large' && c.run.combat) for (const e of alive(c.run.combat)) damageEnemy(c, e, 20, { source: '황금 사다리' }); } },
  }),
  R({ id: 'quadcrown', name: '포카드 왕관', emoji: '🎖️', rarity: 'epic', cat: 'hand', desc: '포카드 배율 ×4 → ×6', mods: { handAdd: { four: 2 } } }),
  R({
    id: 'yahtzeebell', name: '야찌 종', emoji: '🔔', rarity: 'legendary', cat: 'hand', desc: '야찌 시 열기 10단계 즉시, 체력 전부 회복',
    hooks: { onHandScored: (c, a) => { if (a.hand?.id === 'yahtzee') { addHeat(c, BALANCE.heatMax); healPlayer(c, c.run.maxHp); } } },
  }),
  R({ id: 'handbook', name: '족보책', emoji: '📖', rarity: 'legendary', cat: 'hand', desc: '모든 족보 배율 +0.3', mods: { handAll: 0.3 } }),
  // ── 경제형 ──
  R({ id: 'piggy', name: '돼지 저금통', emoji: '🐷', rarity: 'common', cat: 'eco', desc: '저금통 정산 +20%', mods: { piggyPct: 0.2 } }),
  R({ id: 'coupon', name: '단골 쿠폰', emoji: '🎟️', rarity: 'common', cat: 'eco', desc: '상점 가격 -10%', mods: { shopDiscount: 0.1 } }),
  R({ id: 'tipjar', name: '팁 항아리', emoji: '🫙', rarity: 'common', cat: 'eco', desc: '상점에서 아무것도 안 사고 나가면 5G', hooks: { onShopLeave: (c, a) => { if (!a.bought) gainGold(c, 5); } } }),
  R({ id: 'vault', name: '금고', emoji: '🏦', rarity: 'rare', cat: 'eco', desc: '이자 상한 5G → 10G', mods: { interestCap: 5 } }),
  R({ id: 'goldtooth', name: '금니', emoji: '🦷', rarity: 'rare', cat: 'eco', desc: '적 처치마다 2G', hooks: { onKill: (c) => gainGold(c, 2) } }),
  R({ id: 'freeroll', name: '무료 리롤권', emoji: '🔁', rarity: 'rare', cat: 'eco', desc: '상점 입장 시 첫 리롤 무료', mods: { shopFirstRerollFree: 1 } }),
  R({ id: 'compound', name: '복리 증서', emoji: '📈', rarity: 'epic', cat: 'eco', desc: '이자 계산 단위 5G → 4G', mods: { interestUnit: -1 } }),
  R({ id: 'shopkeeper', name: '상점 주인 명함', emoji: '📇', rarity: 'epic', cat: 'eco', desc: '상점 칸 5 → 6', mods: { shopSlots: 1 } }),
  R({ id: 'goose', name: '황금 거위', emoji: '🪿', rarity: 'legendary', cat: 'eco', desc: '노드 이동 시 보유 골드의 10% 추가 (최대 15G)', hooks: { onNodeMove: (c) => gainGold(c, Math.min(15, Math.floor(c.run.gold * 0.1))) } }),
  R({ id: 'mint', name: '조폐국 도장', emoji: '🔏', rarity: 'legendary', cat: 'eco', desc: '저금통 정산 금액의 1/10만큼 칩 지급', mods: { piggyChipsRatio: 0.1 } }),
  // ── 도박형 ──
  R({ id: 'luckycoin', name: '행운의 동전', emoji: '🍀', rarity: 'common', cat: 'gamble', desc: '더블 오어 낫싱 1회차 실패 시 원금 50% 보존', mods: { donFirstFailKeep: 0.5 } }),
  R({ id: 'fuzzydice', name: '털 주사위', emoji: '🧸', rarity: 'common', cat: 'gamble', desc: '슬롯 2개 일치 보상 ×2', mods: { slotPairMult: 1 } }),
  R({ id: 'horseshoe', name: '말굽', emoji: '🧲', rarity: 'rare', cat: 'gamble', desc: '흥정 주사위 1이 나와도 가격 유지', mods: { haggleKeepOnOne: 1 } }),
  R({ id: 'loaded', name: '로디드 다이스', emoji: '🎲', rarity: 'rare', cat: 'gamble', desc: '더블 오어 낫싱 성공 범위 +1', mods: { donMinDelta: -1 } }),
  R({ id: 'croupier', name: '딜러의 장갑', emoji: '🧤', rarity: 'rare', cat: 'gamble', desc: '룰렛 0 확률 2배 (표시 확률도 변경)', mods: { rouletteZeroWeight: 1 } }),
  R({ id: 'redchip', name: '빨간 칩', emoji: '🔴', rarity: 'rare', cat: 'gamble', desc: '카지노 노드 입장 시 칩 +2', mods: { casinoChips: 2 } }),
  R({ id: 'scratcher', name: '동전 긁개', emoji: '🪙', rarity: 'rare', cat: 'gamble', desc: '스크래치 카드 3×3 → 3×4', mods: { scratchCols: 1 } }),
  R({ id: 'highroller', name: '하이롤러 카드', emoji: '💳', rarity: 'epic', cat: 'gamble', desc: '하이롤러 테이블 보상 등급 +1', mods: { highrollerTier: 1 } }),
  R({ id: 'sevenpin', name: '럭키 7 배지', emoji: '7️⃣', rarity: 'epic', cat: 'gamble', desc: '슬롯의 7 가중치 2 → 5', mods: { slotSevenWeight: 3 } }),
  R({ id: 'doubleup', name: '더블업 시계', emoji: '⏱️', rarity: 'epic', cat: 'gamble', desc: '더블 오어 낫싱 최대 3회 → 5회', mods: { donMaxStreak: 2 } }),
  R({ id: 'housekey', name: '하우스의 열쇠', emoji: '🗝️', rarity: 'legendary', cat: 'gamble', desc: '모든 도박 장치 배당 EV +0.15 (표시 반영)', mods: { payoutEv: 0.15 } }),
  R({
    id: 'mirrorball', name: '미러볼', emoji: '🪩', rarity: 'legendary', cat: 'gamble', desc: '도박 성공 시 열기 +2, 실패 시 잭팟 +20%',
    hooks: { onGambleResult: (c, a) => { if (a.win) addHeat(c, 2); else addJackpot(c, 20); } },
  }),
  // ── 조작형 ──
  R({ id: 'extraroll', name: '여분의 컵', emoji: '🥤', rarity: 'common', cat: 'manip', desc: '턴당 리롤 +1', mods: { rerolls: 1 } }),
  R({ id: 'weighted', name: '무게추', emoji: '⚖️', rarity: 'common', cat: 'manip', desc: '전투 첫 굴림에서 1이 나온 주사위 1개 자동 재굴림', mods: { weighted: 1 } }),
  R({
    id: 'sixth', name: '여섯 번째 주사위', emoji: '🎲', rarity: 'rare', cat: 'manip', desc: '주사위 +1',
    hooks: { onAcquire: (c) => { c.run.dice.push(newDie(c.run.nextUid++)); toast(c, '주사위가 6개가 되었다', 'good'); } },
  }),
  R({ id: 'nudge', name: '손가락 튕기기', emoji: '👆', rarity: 'rare', cat: 'manip', desc: '턴당 1회, 주사위 1개 눈 ±1', mods: { turnNudge: 1 } }),
  R({ id: 'foresight', name: '예지의 눈', emoji: '👁️', rarity: 'rare', cat: 'manip', desc: '다음 턴 첫 굴림 결과 1개를 미리 보여줌', mods: { preview: 1 } }),
  R({ id: 'locksmith', name: '열쇠공', emoji: '🔑', rarity: 'rare', cat: 'manip', desc: '잠근 주사위가 리롤마다 +1 (최대 6)', mods: { locksmith: 1 } }),
  R({ id: 'stackdeck', name: '밑장빼기', emoji: '🂠', rarity: 'epic', cat: 'manip', desc: '전투 첫 턴에 주사위 1개를 원하는 눈으로', mods: { stackdeck: 1 } }),
  R({ id: 'tumble', name: '텀블러', emoji: '🥃', rarity: 'epic', cat: 'manip', desc: '리롤 시 잠근 주사위 중 가장 낮은 1개도 함께 굴림 (이전 눈 이하면 되돌림)', mods: { tumble: 1 } }),
  R({ id: 'sixthslot', name: '추가 스킬 칸', emoji: '➕', rarity: 'epic', cat: 'manip', desc: '스킬 칸 +1', hooks: { onAcquire: (c) => { c.run.maxSlots = Math.min(BALANCE.maxSlots, c.run.maxSlots + 1); } } }),
  R({ id: 'godhand', name: '신의 손', emoji: '🖐️', rarity: 'legendary', cat: 'manip', desc: '턴당 1회, 주사위 1개를 원하는 눈으로', mods: { turnGodhand: 1 } }),
  // ── 생존·전투형 ──
  R({ id: 'bandage', name: '붕대', emoji: '🩹', rarity: 'common', cat: 'survive', desc: '전투 종료 시 체력 4 회복', hooks: { onCombatEnd: (c, a) => { if (a.win) healPlayer(c, 4); } } }),
  R({ id: 'helmet', name: '투구', emoji: '⛑️', rarity: 'common', cat: 'survive', desc: '전투 첫 턴 방어 8', mods: { firstTurnBlock: 8 } }),
  R({ id: 'thornmail', name: '가시 갑옷', emoji: '🌵', rarity: 'rare', cat: 'survive', desc: '공격받을 때마다 2 반사', mods: { reflect: 2 } }),
  R({ id: 'adrenaline', name: '아드레날린', emoji: '💉', rarity: 'rare', cat: 'survive', desc: '체력 30% 이하에서 피해 +30%', dmgMult: (c) => (c.run.hp <= c.run.maxHp * 0.3 ? 1.3 : 1) }),
  R({
    id: 'phoenix', name: '불사조 깃털', emoji: '🪶', rarity: 'epic', cat: 'survive', desc: '1회 부활 (체력 30%) 후 파괴',
    saveLethal: (c) => {
      c.run.relics = c.run.relics.filter((r) => r !== 'phoenix');
      c.run.hp = Math.round(c.run.maxHp * 0.3);
      toast(c, '🪶 불사조 깃털이 타오른다! 부활!', 'gold');
      return true;
    },
  }),
  R({ id: 'berserker', name: '광전사 목걸이', emoji: '📿', rarity: 'epic', cat: 'survive', desc: '열기 단계당 피해 +5% 추가', mods: { heatDmgExtra: 0.05 } }),
  R({
    id: 'lastchance', name: '마지막 패', emoji: '🂡', rarity: 'epic', cat: 'survive', desc: '체력 10 이하일 때 매 턴 첫 굴림에서 주사위 2개를 다른 주사위 눈에 맞춤',
    hooks: {
      onRoll: (c) => {
        const cb = c.run.combat;
        if (!cb || c.run.hp > 10) return;
        const free = cb.hand.filter((h) => !h.used);
        if (free.length < 3) return;
        const counts = new Map<number, number>();
        for (const h of free) counts.set(h.pip, (counts.get(h.pip) ?? 0) + 1);
        const target = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
        let n = 0;
        for (const h of free) if (h.pip !== target && n < 2 && !h.sticker) { h.pip = target; n++; }
        toast(c, '🂡 마지막 패: 주사위가 맞춰진다', 'gold');
      },
    },
  }),
  R({
    id: 'immortal', name: '불멸의 칩', emoji: '♾️', rarity: 'legendary', cat: 'survive', desc: '전투당 1회 치명타를 체력 1로 버팀, 그 턴 잭팟 100%',
    saveLethal: (c) => {
      const cb = c.run.combat;
      if (!cb || cb.counters.immortal) return false;
      cb.counters.immortal = 1;
      c.run.hp = 1;
      addJackpot(c, 100);
      toast(c, '♾️ 불멸의 칩! 체력 1로 버텼다', 'gold');
      return true;
    },
  }),
];

export const RELIC_BY_ID = Object.fromEntries(RELICS.map((r) => [r.id, r])) as Record<string, RelicDef>;
