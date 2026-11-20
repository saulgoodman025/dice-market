import type { Rarity } from '../core/state';
import type { EffectSource } from '../rules/ctx';
import { toast } from '../rules/ctx';
import {
  addHeat, addJackpot, alive, damageEnemy, gainBlock, gainGold, healPlayer, maxHpChange,
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
  R({ id: 'pairpin', name: '페어 핀', emoji: '📌', rarity: 'common', cat: 'hand', desc: '원 페어의 배율이 ×1.4가 됩니다.', mods: { handAdd: { pair: 0.2 } } }),
  R({ id: 'twopairtie', name: '투페어 넥타이', emoji: '👔', rarity: 'common', cat: 'hand', desc: '투 페어가 나오면 방어도를 6 얻습니다.', hooks: { onHandScored: (c, a) => { if (a.hand?.id === 'twopair') gainBlock(c, 6); } } }),
  R({ id: 'flushring', name: '플러시 반지', emoji: '💍', rarity: 'rare', cat: 'hand', desc: '플러시의 배율이 0.5 오릅니다.', mods: { handAdd: { flush: 0.5 } } }),
  R({ id: 'tripletiara', name: '트리플 티아라', emoji: '👑', rarity: 'rare', cat: 'hand', desc: '트리플이 나오면 잭팟 게이지가 10% 찹니다.', hooks: { onHandScored: (c, a) => { if (a.hand?.id === 'triple') addJackpot(c, 10); } } }),
  R({ id: 'smallladder', name: '작은 사다리', emoji: '🪜', rarity: 'rare', cat: 'hand', desc: '이어지는 눈 3개만 있어도 스몰 스트레이트로 칩니다.', mods: { smallLadder: 1 } }),
  R({ id: 'fullhouse', name: '하우스 열쇠', emoji: '🏠', rarity: 'epic', cat: 'hand', desc: '풀하우스가 나오면 골드를 15 얻습니다.', hooks: { onHandScored: (c, a) => { if (a.hand?.id === 'full') gainGold(c, 15); } } }),
  R({
    id: 'bigladder', name: '황금 사다리', emoji: '🌟', rarity: 'epic', cat: 'hand', desc: '라지 스트레이트가 나오면 모든 적에게 20 피해를 줍니다.',
    hooks: { onHandScored: (c, a) => { if (a.hand?.id === 'large' && c.run.combat) for (const e of alive(c.run.combat)) damageEnemy(c, e, 20, { source: '황금 사다리' }); } },
  }),
  R({ id: 'quadcrown', name: '포카드 왕관', emoji: '🎖️', rarity: 'epic', cat: 'hand', desc: '포카드의 배율이 ×6이 됩니다.', mods: { handAdd: { four: 2 } } }),
  R({
    id: 'yahtzeebell', name: '야찌 종', emoji: '🔔', rarity: 'legendary', cat: 'hand', desc: '야찌가 나오면 열기가 최대가 되고 체력을 모두 회복합니다.',
    hooks: { onHandScored: (c, a) => { if (a.hand?.id === 'yahtzee') { addHeat(c, BALANCE.heatMax); healPlayer(c, c.run.maxHp); } } },
  }),
  R({ id: 'handbook', name: '족보책', emoji: '📖', rarity: 'legendary', cat: 'hand', desc: '모든 족보의 배율이 0.3 오릅니다.', mods: { handAll: 0.3 } }),
  // ── 경제형 ──
  R({ id: 'piggy', name: '돼지 저금통', emoji: '🐷', rarity: 'common', cat: 'eco', desc: '저금통 정산 금액이 20% 늘어납니다.', mods: { piggyPct: 0.2 } }),
  R({ id: 'coupon', name: '단골 쿠폰', emoji: '🎟️', rarity: 'common', cat: 'eco', desc: '상점 가격이 10% 내려갑니다.', mods: { shopDiscount: 0.1 } }),
  R({ id: 'tipjar', name: '팁 항아리', emoji: '🫙', rarity: 'common', cat: 'eco', desc: '상점에서 아무것도 사지 않고 나가면 골드를 5 얻습니다.', hooks: { onShopLeave: (c, a) => { if (!a.bought) gainGold(c, 5); } } }),
  R({ id: 'vault', name: '금고', emoji: '🏦', rarity: 'rare', cat: 'eco', desc: '이자 상한이 10골드로 늘어납니다.', mods: { interestCap: 5 } }),
  R({ id: 'goldtooth', name: '금니', emoji: '🦷', rarity: 'rare', cat: 'eco', desc: '적을 쓰러뜨릴 때마다 골드를 2 얻습니다.', hooks: { onKill: (c) => gainGold(c, 2) } }),
  R({ id: 'freeroll', name: '무료 리롤권', emoji: '🔁', rarity: 'rare', cat: 'eco', desc: '상점에 들어가면 첫 리롤이 무료입니다.', mods: { shopFirstRerollFree: 1 } }),
  R({ id: 'compound', name: '복리 증서', emoji: '📈', rarity: 'epic', cat: 'eco', desc: '이자가 5골드가 아니라 4골드마다 1씩 붙습니다.', mods: { interestUnit: -1 } }),
  R({ id: 'shopkeeper', name: '상점 주인 명함', emoji: '📇', rarity: 'epic', cat: 'eco', desc: '상점에 상품이 한 칸 더 나옵니다.', mods: { shopSlots: 1 } }),
  R({ id: 'goose', name: '황금 거위', emoji: '🪿', rarity: 'legendary', cat: 'eco', desc: '칸을 이동할 때마다 보유 골드의 10%를 더 얻습니다. (최대 15)', hooks: { onNodeMove: (c) => gainGold(c, Math.min(15, Math.floor(c.run.gold * 0.1))) } }),
  R({ id: 'mint', name: '조폐국 도장', emoji: '🔏', rarity: 'legendary', cat: 'eco', desc: '저금통 정산 금액의 1/10만큼 카지노 칩을 얻습니다.', mods: { piggyChipsRatio: 0.1 } }),
  // ── 도박형 ──
  R({ id: 'luckycoin', name: '행운의 동전', emoji: '🍀', rarity: 'common', cat: 'gamble', desc: '더블 오어 낫싱 첫 도전에 실패해도 절반은 지킵니다.', mods: { donFirstFailKeep: 0.5 } }),
  R({ id: 'fuzzydice', name: '털 주사위', emoji: '🧸', rarity: 'common', cat: 'gamble', desc: '슬롯머신 2개 일치 보상이 2배가 됩니다.', mods: { slotPairMult: 1 } }),
  R({ id: 'horseshoe', name: '말굽', emoji: '🧲', rarity: 'rare', cat: 'gamble', desc: '흥정 주사위가 1이 나와도 가격이 오르지 않습니다.', mods: { haggleKeepOnOne: 1 } }),
  R({ id: 'loaded', name: '로디드 다이스', emoji: '🎲', rarity: 'rare', cat: 'gamble', desc: '더블 오어 낫싱 성공 눈이 하나 늘어납니다.', mods: { donMinDelta: -1 } }),
  R({ id: 'croupier', name: '딜러의 장갑', emoji: '🧤', rarity: 'rare', cat: 'gamble', desc: '룰렛에서 0이 나올 확률이 2배가 됩니다.', mods: { rouletteZeroWeight: 1 } }),
  R({ id: 'redchip', name: '빨간 칩', emoji: '🔴', rarity: 'rare', cat: 'gamble', desc: '카지노에 들어가면 카지노 칩을 2개 더 받습니다.', mods: { casinoChips: 2 } }),
  R({ id: 'scratcher', name: '동전 긁개', emoji: '🪙', rarity: 'rare', cat: 'gamble', desc: '스크래치 카드가 3×4 칸이 됩니다.', mods: { scratchCols: 1 } }),
  R({ id: 'highroller', name: '하이롤러 카드', emoji: '💳', rarity: 'epic', cat: 'gamble', desc: '하이롤러 테이블 보상 등급이 하나 오릅니다.', mods: { highrollerTier: 1 } }),
  R({ id: 'sevenpin', name: '럭키 7 배지', emoji: '7️⃣', rarity: 'epic', cat: 'gamble', desc: '슬롯머신에서 7이 더 자주 나옵니다.', mods: { slotSevenWeight: 3 } }),
  R({ id: 'doubleup', name: '더블업 시계', emoji: '⏱️', rarity: 'epic', cat: 'gamble', desc: '더블 오어 낫싱을 최대 5번까지 이어갈 수 있습니다.', mods: { donMaxStreak: 2 } }),
  R({ id: 'housekey', name: '하우스의 열쇠', emoji: '🗝️', rarity: 'legendary', cat: 'gamble', desc: '모든 도박의 배당이 15% 늘어납니다.', mods: { payoutEv: 0.15 } }),
  R({
    id: 'mirrorball', name: '미러볼', emoji: '🪩', rarity: 'legendary', cat: 'gamble', desc: '도박에 성공하면 열기 +2, 실패하면 잭팟 게이지가 20% 찹니다.',
    hooks: { onGambleResult: (c, a) => { if (a.win) addHeat(c, 2); else addJackpot(c, 20); } },
  }),
  // ── 조작형 ──
  R({ id: 'extraroll', name: '여분의 컵', emoji: '🥤', rarity: 'common', cat: 'manip', desc: '매 턴 리롤을 1번 더 할 수 있습니다.', mods: { rerolls: 1 } }),
  R({ id: 'weighted', name: '무게추', emoji: '⚖️', rarity: 'common', cat: 'manip', desc: '전투 첫 굴림에서 1이 나온 주사위 하나를 다시 굴립니다.', mods: { weighted: 1 } }),
  R({
    id: 'sixth', name: '여섯 번째 주사위', emoji: '🎲', rarity: 'rare', cat: 'manip', desc: '주사위를 하나 더 얻습니다.',
    hooks: { onAcquire: (c) => { c.run.dice.push(newDie(c.run.nextUid++)); toast(c, '주사위가 6개가 되었다', 'good'); } },
  }),
  R({ id: 'nudge', name: '손가락 튕기기', emoji: '👆', rarity: 'rare', cat: 'manip', desc: '턴마다 1번, 주사위 하나의 눈을 1 올리거나 내릴 수 있습니다.', mods: { turnNudge: 1 } }),
  R({ id: 'foresight', name: '예지의 눈', emoji: '👁️', rarity: 'rare', cat: 'manip', desc: '다음 턴 첫 주사위의 눈을 미리 보여줍니다.', mods: { preview: 1 } }),
  R({ id: 'locksmith', name: '열쇠공', emoji: '🔑', rarity: 'legendary', cat: 'manip', desc: '주사위를 1개 더 잠글 수 있고, 잠근 주사위는 리롤할 때마다 눈이 1 오릅니다.', mods: { locksmith: 1, lockLimit: 1 } }),
  R({ id: 'stackdeck', name: '밑장빼기', emoji: '🂠', rarity: 'epic', cat: 'manip', desc: '전투 첫 턴에 주사위 하나를 원하는 눈으로 바꿀 수 있습니다.', mods: { stackdeck: 1 } }),
  R({ id: 'tumble', name: '텀블러', emoji: '🥃', rarity: 'epic', cat: 'manip', desc: '리롤할 때 잠근 주사위 중 가장 낮은 것도 함께 굴립니다. 낮아지면 원래대로 돌립니다.', mods: { tumble: 1 } }),
  R({ id: 'sixthslot', name: '여분의 카드', emoji: '➕', rarity: 'epic', cat: 'manip', desc: '매 턴 카드를 1장 더 뽑습니다.', mods: { drawPerTurn: 1 } }),
  R({ id: 'godhand', name: '신의 손', emoji: '🖐️', rarity: 'legendary', cat: 'manip', desc: '턴마다 1번, 주사위 하나를 원하는 눈으로 바꿀 수 있습니다.', mods: { turnGodhand: 1 } }),
  // ── 생존·전투형 ──
  R({ id: 'bandage', name: '붕대', emoji: '🩹', rarity: 'common', cat: 'survive', desc: '전투에서 이기면 체력을 4 회복합니다.', hooks: { onCombatEnd: (c, a) => { if (a.win) healPlayer(c, 4); } } }),
  R({
    id: 'ironheart', name: '강철 심장', emoji: '🫀', rarity: 'rare', cat: 'survive', desc: '얻을 때 최대 체력이 12 늘고 그만큼 회복합니다.',
    hooks: { onAcquire: (c) => { maxHpChange(c.run, 12); healPlayer(c, 12); } },
  }),
  R({ id: 'helmet', name: '투구', emoji: '⛑️', rarity: 'common', cat: 'survive', desc: '전투 첫 턴에 방어도를 8 얻습니다.', mods: { firstTurnBlock: 8 } }),
  R({ id: 'thornmail', name: '가시 갑옷', emoji: '🌵', rarity: 'rare', cat: 'survive', desc: '공격받을 때마다 2 피해를 되돌려줍니다.', mods: { reflect: 2 } }),
  R({ id: 'adrenaline', name: '아드레날린', emoji: '💉', rarity: 'rare', cat: 'survive', desc: '체력이 30% 이하면 주는 피해가 30% 늘어납니다.', dmgMult: (c) => (c.run.hp <= c.run.maxHp * 0.3 ? 1.3 : 1) }),
  R({
    id: 'phoenix', name: '불사조 깃털', emoji: '🪶', rarity: 'epic', cat: 'survive', desc: '쓰러지면 체력 30%로 한 번 되살아납니다. 그 뒤 사라집니다.',
    saveLethal: (c) => {
      c.run.relics = c.run.relics.filter((r) => r !== 'phoenix');
      c.run.hp = Math.round(c.run.maxHp * 0.3);
      toast(c, '🪶 불사조 깃털이 타오른다! 부활!', 'gold');
      return true;
    },
  }),
  R({ id: 'berserker', name: '광전사 목걸이', emoji: '📿', rarity: 'epic', cat: 'survive', desc: '열기 1단계마다 피해가 5% 더 늘어납니다.', mods: { heatDmgExtra: 0.05 } }),
  R({
    id: 'lastchance', name: '마지막 패', emoji: '🂡', rarity: 'epic', cat: 'survive', desc: '체력이 10 이하면 매 턴 첫 굴림에서 주사위 2개를 같은 눈으로 맞춰줍니다.',
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
    id: 'immortal', name: '불멸의 칩', emoji: '♾️', rarity: 'legendary', cat: 'survive', desc: '전투마다 한 번, 쓰러질 피해를 체력 1로 버팁니다. 그러면 잭팟 게이지가 가득 찹니다.',
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
