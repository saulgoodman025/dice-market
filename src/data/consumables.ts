import type { Rarity } from '../core/state';
import { toast, type Ctx } from '../rules/ctx';
import {
  addHeat, addJackpot, alive, cbOf, damageEnemy, gainChips, healPlayer,
} from '../rules/ops';
import { FACE_BY_ID } from './faces';

export interface ConsumableDef {
  id: string;
  name: string;
  emoji: string;
  rarity: Rarity;
  desc: string;
  price: number;
  /** combat: 전투 중만, any: 언제나, shop: 상점, passive: 해당 장치에서 자동/선택 사용 */
  when: 'combat' | 'any' | 'shop' | 'passive' | 'ui';
  /** 사용. false 반환 시 소모하지 않음 */
  use?: (ctx: Ctx) => boolean;
}

export const CONSUMABLES: ConsumableDef[] = [
  { id: 'potion', name: '회복 물약', emoji: '🧪', rarity: 'common', desc: '체력 20 회복', price: 4, when: 'any', use: (ctx) => { healPlayer(ctx, 20); return true; } },
  {
    id: 'rerolltoken', name: '리롤 토큰', emoji: '🎟️', rarity: 'common', desc: '이번 턴 리롤 +2', price: 3, when: 'combat',
    use: (ctx) => { const cb = cbOf(ctx); if (cb.phase !== 'roll') return false; cb.rerollsLeft += 2; return true; },
  },
  {
    id: 'loadedone', name: '로디드 원', emoji: '🎯', rarity: 'common', desc: '다음 굴림의 주사위 1개를 6으로', price: 4, when: 'combat',
    use: (ctx) => { cbOf(ctx).next.six++; return true; },
  },
  { id: 'chipbag', name: '칩 주머니', emoji: '👝', rarity: 'common', desc: '칩 +3', price: 5, when: 'any', use: (ctx) => { gainChips(ctx, 3); return true; } },
  { id: 'scratch', name: '스크래치 카드', emoji: '🎫', rarity: 'common', desc: '스크래치 1장 (같은 심볼 3개 = 보상)', price: 3, when: 'ui' },
  {
    id: 'bomb', name: '폭탄', emoji: '💣', rarity: 'common', desc: '모든 적 피해 15', price: 5, when: 'combat',
    use: (ctx) => { for (const e of alive(cbOf(ctx))) damageEnemy(ctx, e, 15, { source: '폭탄' }); return true; },
  },
  { id: 'insurance', name: '보험증서', emoji: '📄', rarity: 'rare', desc: '다음 도박 실패 시 원금 반환 (자동)', price: 6, when: 'passive' },
  { id: 'freespin', name: '무료 스핀권', emoji: '🎰', rarity: 'rare', desc: '슬롯 1회 무료 (슬롯에서 사용)', price: 5, when: 'passive' },
  { id: 'mystery', name: '미스터리 박스', emoji: '🎁', rarity: 'rare', desc: '유물 1개: 일반 50% / 희귀 30% / 영웅 15% / 전설 5%', price: 8, when: 'ui' },
  { id: 'pricetag', name: '할인 스티커', emoji: '🏷️', rarity: 'rare', desc: '상점 상품 1개 50% 할인 (상점에서 사용)', price: 5, when: 'shop' },
  {
    id: 'smoke', name: '연막탄', emoji: '💨', rarity: 'rare', desc: '일반·엘리트 전투에서 즉시 도주 (보상 없음)', price: 6, when: 'combat',
    use: (ctx) => { const cb = cbOf(ctx); if (cb.kind === 'boss') { toast(ctx, '보스에게선 도망칠 수 없다', 'bad'); return false; } cb.result = 'fled'; cb.phase = 'over'; return true; },
  },
  {
    id: 'cleanse', name: '정화수', emoji: '💧', rarity: 'rare', desc: '저주받은 재질 / 해골 면 1개 제거', price: 5, when: 'any',
    use: (ctx) => {
      for (const d of ctx.run.dice) {
        if (d.material === 'cursed') { d.material = 'wood'; toast(ctx, '저주받은 재질 제거', 'good'); return true; }
      }
      for (const d of ctx.run.dice) {
        const f = d.faces.find((x) => x.sticker && FACE_BY_ID[x.sticker].cursed);
        if (f) { f.sticker = undefined; toast(ctx, '해골 면 제거', 'good'); return true; }
      }
      toast(ctx, '정화할 대상이 없다', 'info');
      return false;
    },
  },
  { id: 'heatpill', name: '각성제', emoji: '💊', rarity: 'epic', desc: '열기 +3', price: 8, when: 'any', use: (ctx) => { addHeat(ctx, 3); return true; } },
  { id: 'jackpotjuice', name: '잭팟 주스', emoji: '🧃', rarity: 'epic', desc: '잭팟 게이지 +40%', price: 10, when: 'any', use: (ctx) => { addJackpot(ctx, 40); return true; } },
  {
    id: 'marked', name: '표시된 주사위', emoji: '✍️', rarity: 'epic', desc: '이번 전투 동안 매 턴 주사위 1개 눈 선택', price: 9, when: 'combat',
    use: (ctx) => { const cb = cbOf(ctx); cb.counters.marked = 1; cb.turnCounters.setValue = (cb.turnCounters.setValue ?? 0) + 1; return true; },
  },
  { id: 'goldenticket', name: '황금 티켓', emoji: '🎫', rarity: 'legendary', desc: '다음 슬롯 스핀 결과를 3개 중 고름 (자동)', price: 15, when: 'passive' },
];

export const CONSUMABLE_BY_ID = Object.fromEntries(CONSUMABLES.map((c) => [c.id, c])) as Record<string, ConsumableDef>;
