import type { Enemy, HandResult, IntentSpec } from '../core/state';
import { getMods, rng, toast, type Ctx } from '../rules/ctx';
import { addConsumable, damageEnemy, gainChips, gainGold, type DmgInfo } from '../rules/ops';
import { HAND_BY_ID } from './hands';
import { CONSUMABLES } from './consumables';

export interface EnemyDef {
  id: string;
  name: string;
  emoji: string;
  hp: number;
  act: 1 | 2 | 3;
  tier: 'normal' | 'elite' | 'boss';
  pattern: IntentSpec[];
  desc: string;
  count?: number; // 함께 등장하는 수
  frozePiggy?: boolean; // 방어도가 있으면 저금통 동결
  modIncoming?: (ctx: Ctx, e: Enemy, amount: number, info: DmgInfo) => number;
  onDamaged?: (ctx: Ctx, e: Enemy, dealt: number) => void;
  onDeath?: (ctx: Ctx, e: Enemy) => void;
  onTurnStart?: (ctx: Ctx, e: Enemy) => void; // 플레이어 턴 시작 시
  onHandScored?: (ctx: Ctx, e: Enemy, hand: HandResult) => void;
}


export const HOUSE_RULES: Record<string, string> = {
  noSix: '하우스 룰: 6은 스킬에 쓸 수 없다',
  oneReroll: '하우스 룰: 리롤 1회',
  noLock: '하우스 룰: 잠금 금지',
  halfBlock: '하우스 룰: 방어 절반',
};

export const ENEMIES: EnemyDef[] = [
  // ── 1막 로비 ──
  { id: 'bouncer', name: '문지기', emoji: '🕴️', hp: 26, act: 1, tier: 'normal', pattern: [{ k: 'attack', n: 7 }, { k: 'block', n: 6 }], desc: '' },
  { id: 'pickpocket', name: '소매치기', emoji: '🥷', hp: 18, act: 1, tier: 'normal', pattern: [{ k: 'steal', n: 5 }, { k: 'attack', n: 5 }], desc: '훔치기: 저금통 5 감소' },
  {
    id: 'chiprat', name: '칩 쥐', emoji: '🐀', hp: 12, act: 1, tier: 'normal', count: 2, pattern: [{ k: 'attack', n: 4 }], desc: '처치 시 칩 1',
    onDeath: (ctx) => gainChips(ctx, 1),
  },
  { id: 'drunk', name: '취객', emoji: '🥴', hp: 30, act: 1, tier: 'normal', pattern: [{ k: 'attackRange', n: 3, n2: 12 }], desc: '공격 3~12 무작위' },
  { id: 'valet', name: '주차요원', emoji: '🅿️', hp: 22, act: 1, tier: 'normal', pattern: [{ k: 'attack', n: 6 }, { k: 'debuff' }], desc: '디버프: 다음 턴 리롤 -1' },
  { id: 'cardshark', name: '카드 샤크', emoji: '🦈', hp: 24, act: 1, tier: 'normal', pattern: [{ k: 'attack', n: 5 }, { k: 'buff' }], desc: '버프: 다음 공격 ×2' },
  {
    id: 'pitguard', name: '경비대장', emoji: '💂', hp: 60, act: 1, tier: 'elite', pattern: [{ k: 'block', n: 10 }, { k: 'attack', n: 14 }, { k: 'multi', n: 6, hits: 2 }],
    desc: '방어도가 있을 때 홀수 눈 피해 절반',
    modIncoming: (_c, e, a, info) => (e.block > 0 && info.pip !== undefined && info.pip % 2 === 1 ? a / 2 : a),
  },
  { id: 'dicethief', name: '주사위 도둑', emoji: '🦝', hp: 45, act: 1, tier: 'elite', pattern: [{ k: 'stealDie' }, { k: 'attack', n: 9 }], desc: '훔치기: 다음 턴 가장 높은 주사위 1개를 빼앗음' },
  {
    id: 'pitboss', name: '피트 보스', emoji: '🎩', hp: 128, act: 1, tier: 'boss', pattern: [{ k: 'attackRange', n: 10, n2: 14 }],
    desc: '체력 50% 이하: 매 턴 하우스 룰 1개 적용 (턴 시작 시 공개)',
    onTurnStart: (ctx, e) => {
      const cb = ctx.run.combat!;
      if (e.phase === 1 && e.hp <= e.maxHp / 2) { e.phase = 2; toast(ctx, '피트 보스 2페이즈: 하우스 룰 발동!', 'bad'); }
      if (e.phase >= 2) {
        cb.houseRule = rng(ctx, 'combat').pick(Object.keys(HOUSE_RULES));
        toast(ctx, HOUSE_RULES[cb.houseRule], 'bad');
      }
    },
  },
  // ── 2막 VIP 라운지 ──
  { id: 'taxman', name: '세금 징수원', emoji: '🧾', hp: 40, act: 2, tier: 'normal', pattern: [{ k: 'attack', n: 8 }, { k: 'tax' }], desc: '징수: 보유 골드 10%' },
  { id: 'croupier', name: '크루피어', emoji: '🎲', hp: 38, act: 2, tier: 'normal', pattern: [{ k: 'attack', n: 10 }, { k: 'flip' }], desc: '판 뒤집기: 다음 첫 굴림 후 주사위 전부 7-눈' },
  {
    id: 'oddhater', name: '짝수 광신도', emoji: '⚪', hp: 42, act: 2, tier: 'normal', pattern: [{ k: 'attack', n: 9 }], desc: '홀수 눈 피해 무효',
    modIncoming: (_c, _e, a, info) => (info.pip !== undefined && info.pip % 2 === 1 ? 0 : a),
  },
  {
    id: 'evenhater', name: '홀수 광신도', emoji: '⚫', hp: 42, act: 2, tier: 'normal', pattern: [{ k: 'attack', n: 9 }], desc: '짝수 눈 피해 무효',
    modIncoming: (_c, _e, a, info) => (info.pip !== undefined && info.pip % 2 === 0 ? 0 : a),
  },
  { id: 'loanshark', name: '사채업자', emoji: '💸', hp: 50, act: 2, tier: 'normal', pattern: [{ k: 'attack', n: 6 }, { k: 'attack', n: 6 }, { k: 'interest', n: 4 }], desc: '이자: 이후 공격 +4 누적' },
  { id: 'mime', name: '마임', emoji: '🤡', hp: 35, act: 2, tier: 'normal', pattern: [{ k: 'copy' }], desc: '플레이어 직전 스킬 피해의 50%로 반격' },
  {
    id: 'twins', name: '쌍둥이 딜러', emoji: '👯', hp: 55, act: 2, tier: 'elite', count: 2, pattern: [{ k: 'attack', n: 12 }, { k: 'block', n: 8 }], desc: '교대로 공격. 한쪽 처치 시 다른 쪽 피해 +50%',
    onDeath: (ctx, e) => {
      for (const o of ctx.run.combat!.enemies) if (o.id === e.id && o.hp > 0) { o.enraged = true; toast(ctx, '남은 쌍둥이가 분노했다! (피해 +50%)', 'bad'); }
    },
  },
  {
    id: 'auditor', name: '감사관', emoji: '🕵️', hp: 80, act: 2, tier: 'elite', pattern: [{ k: 'block', n: 15 }, { k: 'attack', n: 18 }], desc: '족보가 투 페어 이하면 받는 피해 절반',
    modIncoming: (ctx, _e, a) => { const h = ctx.run.combat?.handResult; return h && HAND_BY_ID[h.id].rank <= 2 ? a / 2 : a; },
  },
  {
    id: 'roulettequeen', name: '룰렛 퀸', emoji: '👸', hp: 200, act: 2, tier: 'boss', pattern: [{ k: 'attack', n: 14 }, { k: 'attack', n: 18 }, { k: 'block', n: 15 }],
    desc: '매 턴 룰렛으로 홀/짝 지정: 그 눈으로 준 피해만 유효. 0이면 퀸이 피해 30',
    onTurnStart: (ctx, e) => {
      const cb = ctx.run.combat!;
      const n = rng(ctx, 'combat').int(0, 36);
      if (n === 0) {
        cb.queenParity = null;
        toast(ctx, '룰렛 0! 퀸이 스스로 피해 30', 'gold');
        damageEnemy(ctx, e, 30, { source: '룰렛 0' });
      } else {
        cb.queenParity = n % 2 === 1 ? 'odd' : 'even';
        toast(ctx, `룰렛 ${n}: 이번 턴 ${cb.queenParity === 'odd' ? '홀수' : '짝수'} 눈 피해만 유효`, 'info');
      }
    },
    modIncoming: (ctx, _e, a, info) => {
      const p = ctx.run.combat?.queenParity;
      if (!p || info.pip === undefined) return a;
      return (info.pip % 2 === 1) === (p === 'odd') ? a : 0;
    },
  },
  // ── 3막 하우스 금고 ──
  { id: 'golem', name: '칩 골렘', emoji: '🗿', hp: 70, act: 3, tier: 'normal', pattern: [{ k: 'block', n: 12 }, { k: 'attack', n: 16 }], desc: '' },
  { id: 'oddsmaker', name: '확률 설계자', emoji: '🧮', hp: 55, act: 3, tier: 'normal', pattern: [{ k: 'attack', n: 12 }, { k: 'rig' }], desc: '조작: 다음 굴림 1개 강제 1' },
  {
    id: 'goldslime', name: '황금 슬라임', emoji: '🟡', hp: 60, act: 3, tier: 'normal', pattern: [{ k: 'attack', n: 10 }], desc: '피격 시 플레이어 골드 +2. 체력 절반 이하에서 1회 분열',
    onDamaged: (ctx, e) => {
      gainGold(ctx, 2);
      const cb = ctx.run.combat!;
      if (!e.splitDone && e.hp > 0 && e.hp <= e.maxHp / 2) {
        e.splitDone = true;
        const half = Math.ceil(e.hp / 2);
        e.hp = half;
        e.maxHp = Math.ceil(e.maxHp / 2);
        cb.enemies.push({ ...e, uid: ctx.run.nextUid++, hp: half, block: 0, intent: { ...e.intent } });
        toast(ctx, '황금 슬라임이 분열했다!', 'info');
      }
    },
  },
  {
    id: 'enforcer', name: '집행자', emoji: '🔨', hp: 75, act: 3, tier: 'normal', pattern: [{ k: 'charge' }, { k: 'attack', n: 20 }],
    desc: '충전 후 공격 20. 충전 중 한 번에 10 이상 피해 받으면 충전 취소',
    onDamaged: (ctx, e, dealt) => {
      if (e.charge > 0 && dealt >= 10) { e.charge = 0; e.patternIdx = 0; toast(ctx, '집행자의 충전이 취소됐다!', 'good'); }
    },
  },
  {
    id: 'jester', name: '광대', emoji: '🃏', hp: 50, act: 3, tier: 'normal', pattern: [{ k: 'random' }], desc: '무작위 인텐트. 처치 시 무작위 소모품',
    onDeath: (ctx) => addConsumable(ctx, rng(ctx, 'loot').pick(CONSUMABLES.filter((c) => c.rarity !== 'legendary')).id),
  },
  { id: 'debtcollector', name: '추심원', emoji: '📜', hp: 65, act: 3, tier: 'normal', pattern: [{ k: 'attack', n: 14 }, { k: 'seize' }], desc: '압류: 소모품 1개 파괴' },
  { id: 'highroller', name: '하이롤러', emoji: '🤵', hp: 110, act: 3, tier: 'elite', pattern: [{ k: 'bet', n: 4 }, { k: 'attack', n: 16 }], desc: '베팅: 주사위 1개 굴려 그 눈×4 피해' },
  { id: 'vaultkeeper', name: '금고지기', emoji: '🔐', hp: 120, act: 3, tier: 'elite', frozePiggy: true, pattern: [{ k: 'block', n: 20 }, { k: 'attack', n: 15 }], desc: '방어도가 있으면 저금통 동결' },
  {
    id: 'thehouse', name: '더 하우스', emoji: '🏛️', hp: 320, act: 3, tier: 'boss', pattern: [{ k: 'houseCopy', n: 10 }, { k: 'block', n: 20 }, { k: 'houseCopy', n: 14 }],
    desc: '하우스는 항상 이긴다: 플레이어 족보 배율로 반격. 2페이즈(50%↓): 노 핸드면 체력 30 회복',
    onTurnStart: (ctx, e) => { if (e.phase === 1 && e.hp <= e.maxHp / 2) { e.phase = 2; toast(ctx, '더 하우스 2페이즈: 노 핸드를 노린다!', 'bad'); } },
    onHandScored: (ctx, e, hand) => {
      if (e.phase >= 2 && hand.id === 'none') {
        const h = Math.round(30 * (1 + getMods(ctx.run).bossPhase2 * 0.5));
        e.hp = Math.min(e.maxHp, e.hp + h);
        toast(ctx, `하우스가 체력 ${h} 회복`, 'bad');
      }
    },
  },
];

export const ENEMY_BY_ID = Object.fromEntries(ENEMIES.map((e) => [e.id, e])) as Record<string, EnemyDef>;

export const JESTER_POOL: IntentSpec[] = [
  { k: 'attack', n: 15 }, { k: 'block', n: 12 }, { k: 'debuff' }, { k: 'multi', n: 5, hits: 3 }, { k: 'buff' },
];
