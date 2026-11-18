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
  immuneRotate?: boolean; // 매 턴 무작위 눈 하나의 피해를 받지 않는다
  splitOnDeath?: { count: number; hpPct: number }; // 쓰러지면 작은 적 여럿으로 갈라져 되살아남
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
  { id: 'bouncer', name: '문지기', emoji: '🕴️', hp: 26, act: 1, tier: 'normal', pattern: [{ k: 'attack', n: 7 }, { k: 'block', n: 6 }, { k: 'enrage', n: 2 }], desc: '가끔 힘을 길러 공격이 세집니다.' },
  { id: 'pickpocket', name: '소매치기', emoji: '🥷', hp: 18, act: 1, tier: 'normal', pattern: [{ k: 'steal', n: 5 }, { k: 'attack', n: 5 }], desc: '저금통에서 5를 훔쳐 갑니다.' },
  {
    id: 'chiprat', name: '칩 쥐', emoji: '🐀', hp: 12, act: 1, tier: 'normal', count: 2, pattern: [{ k: 'attack', n: 4 }], desc: '쓰러뜨리면 카지노 칩을 1 줍니다.',
    onDeath: (ctx) => gainChips(ctx, 1),
  },
  { id: 'drunk', name: '취객', emoji: '🥴', hp: 30, act: 1, tier: 'normal', pattern: [{ k: 'attackRange', n: 3, n2: 12 }], desc: '3~12 사이의 무작위 피해로 공격합니다.' },
  { id: 'valet', name: '주차요원', emoji: '🅿️', hp: 22, act: 1, tier: 'normal', pattern: [{ k: 'attack', n: 6 }, { k: 'debuff' }], desc: '다음 턴 내 리롤을 1 줄입니다.' },
  { id: 'cardshark', name: '카드 샤크', emoji: '🦈', hp: 24, act: 1, tier: 'normal', pattern: [{ k: 'attack', n: 5 }, { k: 'buff' }], desc: '힘을 모아 다음 공격이 2배가 됩니다.' },
  {
    id: 'pitguard', name: '경비대장', emoji: '💂', hp: 60, act: 1, tier: 'elite', pattern: [{ k: 'block', n: 10 }, { k: 'curseVuln', n: 2 }, { k: 'attack', n: 14 }, { k: 'multi', n: 6, hits: 2 }],
    desc: '방어도가 있으면 홀수 눈 피해를 절반만 받습니다.',
    modIncoming: (_c, e, a, info) => (e.block > 0 && info.pip !== undefined && info.pip % 2 === 1 ? a / 2 : a),
  },
  { id: 'dicethief', name: '주사위 도둑', emoji: '🦝', hp: 45, act: 1, tier: 'elite', pattern: [{ k: 'stealDie' }, { k: 'attack', n: 9 }], desc: '다음 턴 가장 높은 주사위 하나를 빼앗습니다.' },
  {
    id: 'pitboss', name: '피트 보스', emoji: '🎩', hp: 140, act: 1, tier: 'boss', pattern: [{ k: 'attackRange', n: 10, n2: 14 }],
    desc: '체력이 절반 이하가 되면 매 턴 하우스 룰을 하나씩 겁니다.',
    onTurnStart: (ctx, e) => {
      const cb = ctx.run.combat!;
      if (e.phase === 1 && e.hp <= e.maxHp / 2) { e.phase = 2; toast(ctx, '피트 보스 2페이즈: 하우스 룰 발동!', 'bad'); }
      if (e.phase >= 2) {
        cb.houseRule = rng(ctx, 'combat').pick(Object.keys(HOUSE_RULES));
        toast(ctx, HOUSE_RULES[cb.houseRule], 'bad');
      }
    },
  },
  {
    id: 'mitosis', name: '분열 칩', emoji: '🫧', hp: 18, act: 1, tier: 'normal', pattern: [{ k: 'attack', n: 5 }, { k: 'attack', n: 4 }],
    desc: '쓰러지면 작은 칩 2개로 갈라져 되살아납니다.', splitOnDeath: { count: 2, hpPct: 0.5 },
  },
  // ── 2막 VIP 라운지 ──
  { id: 'taxman', name: '세금 징수원', emoji: '🧾', hp: 40, act: 2, tier: 'normal', pattern: [{ k: 'attack', n: 8 }, { k: 'tax' }], desc: '보유 골드의 10%를 세금으로 걷어 갑니다.' },
  { id: 'croupier', name: '크루피어', emoji: '🎲', hp: 38, act: 2, tier: 'normal', pattern: [{ k: 'attack', n: 10 }, { k: 'flip' }], desc: '다음 턴 내 주사위를 전부 뒤집습니다. (1↔6)' },
  {
    id: 'oddhater', name: '짝수 광신도', emoji: '⚪', hp: 42, act: 2, tier: 'normal', pattern: [{ k: 'attack', n: 9 }], desc: '홀수 눈으로 준 피해를 받지 않습니다.',
    modIncoming: (_c, _e, a, info) => (info.pip !== undefined && info.pip % 2 === 1 ? 0 : a),
  },
  {
    id: 'evenhater', name: '홀수 광신도', emoji: '⚫', hp: 42, act: 2, tier: 'normal', pattern: [{ k: 'attack', n: 9 }, { k: 'curseWeak', n: 2 }, { k: 'attack', n: 9 }], desc: '짝수 눈으로 준 피해를 받지 않습니다.',
    modIncoming: (_c, _e, a, info) => (info.pip !== undefined && info.pip % 2 === 0 ? 0 : a),
  },
  { id: 'loanshark', name: '사채업자', emoji: '💸', hp: 50, act: 2, tier: 'normal', pattern: [{ k: 'attack', n: 6 }, { k: 'attack', n: 6 }, { k: 'interest', n: 4 }], desc: '이자가 붙어 공격이 점점 4씩 세집니다.' },
  { id: 'mime', name: '마임', emoji: '🤡', hp: 35, act: 2, tier: 'normal', pattern: [{ k: 'copy' }], desc: '내가 방금 준 피해의 절반을 그대로 따라 합니다.' },
  {
    id: 'twins', name: '쌍둥이 딜러', emoji: '👯', hp: 55, act: 2, tier: 'elite', count: 2, pattern: [{ k: 'attack', n: 12 }, { k: 'block', n: 8 }], desc: '둘이 번갈아 공격합니다. 하나가 쓰러지면 남은 쪽이 분노해 피해가 50% 늘어납니다.',
    onDeath: (ctx, e) => {
      for (const o of ctx.run.combat!.enemies) if (o.id === e.id && o.hp > 0) { o.enraged = true; toast(ctx, '남은 쌍둥이가 분노했다! (피해 +50%)', 'bad'); }
    },
  },
  {
    id: 'auditor', name: '감사관', emoji: '🕵️', hp: 80, act: 2, tier: 'elite', pattern: [{ k: 'block', n: 15 }, { k: 'curseWeak', n: 2 }, { k: 'attack', n: 18 }], desc: '투 페어 이하의 족보로 준 피해는 절반만 받습니다.',
    modIncoming: (ctx, _e, a) => { const h = ctx.run.combat?.handResult; return h && HAND_BY_ID[h.id].rank <= 2 ? a / 2 : a; },
  },
  {
    id: 'roulettequeen', name: '룰렛 퀸', emoji: '👸', hp: 200, act: 2, tier: 'boss', pattern: [{ k: 'attack', n: 14 }, { k: 'attack', n: 18 }, { k: 'block', n: 15 }],
    desc: '매 턴 룰렛으로 홀/짝을 정합니다. 그 눈으로만 피해를 받습니다. 0이 나오면 스스로 30 피해를 입습니다.',
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
  {
    id: 'warden', name: '눈 검사관', emoji: '🧐', hp: 44, act: 2, tier: 'normal', immuneRotate: true, pattern: [{ k: 'attack', n: 10 }, { k: 'block', n: 8 }],
    desc: '매 턴 눈 하나(🚫)를 정해 그 눈으로 준 피해를 받지 않습니다.',
  },
  {
    id: 'medic', name: '카지노 의무관', emoji: '🩺', hp: 28, act: 2, tier: 'normal', pattern: [{ k: 'heal', n: 12 }, { k: 'attack', n: 6 }],
    desc: '체력이 가장 낮은 동료를 치료합니다. 먼저 쓰러뜨리세요.',
  },
  {
    id: 'sealer', name: '봉인사', emoji: '⛓️', hp: 40, act: 2, tier: 'normal', pattern: [{ k: 'seal', n: 1 }, { k: 'attack', n: 11 }],
    desc: '다음 턴 내 주사위 하나를 봉인해 쓰지 못하게 합니다.',
  },
  // ── 3막 하우스 금고 ──
  { id: 'golem', name: '칩 골렘', emoji: '🗿', hp: 70, act: 3, tier: 'normal', pattern: [{ k: 'block', n: 12 }, { k: 'attack', n: 16 }, { k: 'enrage', n: 3 }], desc: '단단하고, 점점 힘이 세집니다.' },
  { id: 'oddsmaker', name: '확률 설계자', emoji: '🧮', hp: 55, act: 3, tier: 'normal', pattern: [{ k: 'attack', n: 12 }, { k: 'rig' }], desc: '다음 굴림에서 내 주사위 하나를 1로 만듭니다.' },
  {
    id: 'goldslime', name: '황금 슬라임', emoji: '🟡', hp: 60, act: 3, tier: 'normal', pattern: [{ k: 'attack', n: 10 }], desc: '맞을 때마다 골드를 2 흘립니다. 체력이 절반이 되면 둘로 갈라집니다.',
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
    desc: '한 턴 힘을 모아 20 피해로 내려칩니다. 모으는 중에 한 번에 10 이상 맞으면 취소됩니다.',
    onDamaged: (ctx, e, dealt) => {
      if (e.charge > 0 && dealt >= 10) { e.charge = 0; e.patternIdx = 0; toast(ctx, '집행자의 충전이 취소됐다!', 'good'); }
    },
  },
  {
    id: 'jester', name: '광대', emoji: '🃏', hp: 50, act: 3, tier: 'normal', pattern: [{ k: 'random' }], desc: '무엇을 할지 아무도 모릅니다. 쓰러뜨리면 소모품을 줍니다.',
    onDeath: (ctx) => addConsumable(ctx, rng(ctx, 'loot').pick(CONSUMABLES.filter((c) => c.rarity !== 'legendary')).id),
  },
  { id: 'debtcollector', name: '추심원', emoji: '📜', hp: 65, act: 3, tier: 'normal', pattern: [{ k: 'attack', n: 14 }, { k: 'seize' }], desc: '내 소모품 하나를 압류해 갑니다.' },
  {
    id: 'hydra', name: '칩 히드라', emoji: '🐍', hp: 64, act: 3, tier: 'normal', pattern: [{ k: 'attack', n: 13 }, { k: 'enrage', n: 2 }],
    desc: '쓰러지면 머리 둘로 갈라져 되살아납니다.', splitOnDeath: { count: 2, hpPct: 0.45 },
  },
  {
    id: 'banker', name: '은행원', emoji: '🏦', hp: 56, act: 3, tier: 'normal', pattern: [{ k: 'chipTax', n: 2 }, { k: 'guardAll', n: 10 }, { k: 'attack', n: 12 }],
    desc: '내 족보 칩을 빼앗고, 동료 모두에게 방어도를 줍니다.',
  },
  {
    id: 'mirrorknight', name: '거울 기사', emoji: '🪞', hp: 70, act: 3, tier: 'normal', immuneRotate: true, pattern: [{ k: 'block', n: 14 }, { k: 'attack', n: 15 }, { k: 'curseVuln', n: 1 }],
    desc: '매 턴 눈 하나(🚫)의 피해를 받지 않고, 내게 취약을 겁니다.',
  },
  { id: 'highroller', name: '하이롤러', emoji: '🤵', hp: 110, act: 3, tier: 'elite', pattern: [{ k: 'bet', n: 4 }, { k: 'curseVuln', n: 2 }, { k: 'attack', n: 16 }], desc: '내게 취약을 건 뒤 주사위를 굴려 그 눈의 4배로 공격합니다.' },
  { id: 'vaultkeeper', name: '금고지기', emoji: '🔐', hp: 120, act: 3, tier: 'elite', frozePiggy: true, pattern: [{ k: 'block', n: 20 }, { k: 'attack', n: 15 }], desc: '방어도가 있는 동안 내 저금통이 쌓이지 않습니다.' },
  {
    id: 'thehouse', name: '더 하우스', emoji: '🏛️', hp: 320, act: 3, tier: 'boss', pattern: [{ k: 'houseCopy', n: 10 }, { k: 'curseWeak', n: 2 }, { k: 'block', n: 20 }, { k: 'houseCopy', n: 14 }],
    desc: '내 족보 배율만큼 세게 반격합니다. 체력이 절반 이하면, 내가 노 핸드일 때마다 30 회복합니다.',
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

/** 여럿이 함께 나오는 일반 전투 (층이 깊을수록 등장). 가중치는 단독 등장(각 1)과 비교 */
export const GROUPS: { act: number; minFloor: number; ids: string[]; weight: number }[] = [
  { act: 1, minFloor: 1, ids: ['chiprat', 'chiprat', 'chiprat'], weight: 1.2 },
  { act: 1, minFloor: 2, ids: ['mitosis', 'pickpocket'], weight: 1 },
  { act: 1, minFloor: 2, ids: ['cardshark', 'chiprat'], weight: 0.8 },
  { act: 2, minFloor: 0, ids: ['medic', 'croupier'], weight: 1.2 },
  { act: 2, minFloor: 1, ids: ['oddhater', 'evenhater'], weight: 1 },
  { act: 2, minFloor: 2, ids: ['medic', 'warden', 'sealer'], weight: 1 },
  { act: 2, minFloor: 2, ids: ['loanshark', 'medic'], weight: 0.8 },
  { act: 3, minFloor: 0, ids: ['banker', 'golem'], weight: 1.2 },
  { act: 3, minFloor: 1, ids: ['hydra', 'banker'], weight: 1 },
  { act: 3, minFloor: 2, ids: ['mirrorknight', 'oddsmaker', 'jester'], weight: 1 },
  { act: 3, minFloor: 2, ids: ['goldslime', 'enforcer'], weight: 0.8 },
];
