import type { RewardOption } from '../core/state';
import { fire, rng, type Ctx } from '../rules/ctx';
import { addCurse, deckChanged, giveRelic, relicOfRarity, rollItemId } from '../rules/economy';
import { BALANCE } from './balance';
import { addJackpot, gainChips, gainGold, healPlayer, maxHpChange } from '../rules/ops';
import { RELIC_BY_ID } from './relics';
import { CARD_BY_ID } from './cards';

export interface EventChoice {
  label: string;
  odds?: string; // 확률 표시 (R2)
  can?: (ctx: Ctx) => boolean;
  run: (ctx: Ctx) => string; // 결과 텍스트
}

export interface EventDef {
  id: string;
  name: string;
  emoji: string;
  text: string;
  minAct?: number;
  maxAct?: number;
  choices: EventChoice[];
}

const gambleDone = (ctx: Ctx, win: boolean) => {
  ctx.run.stats.gambles++;
  fire(ctx, 'onGamble', { gamble: 'event' });
  fire(ctx, 'onGambleResult', { win, gamble: 'event' });
};

const offer = (ctx: Ctx, title: string, options: RewardOption[]) => {
  ctx.run.offer = { title, options, then: 'event' };
};

export const EVENTS: EventDef[] = [
  {
    id: 'shellgame', name: '야바위', emoji: '🥤', text: '"10G 걸면 30G!"',
    choices: [
      {
        label: '10G를 건다', odds: '컵 3개 중 정답 1개 → 30G · 틀리면 10G 잃음', can: (c) => c.run.gold >= 10,
        run: (c) => { gainGold(c, -10); const win = rng(c, 'casino').int(1, 3) === 1; gambleDone(c, win); if (win) { gainGold(c, 30); return '정답! 30G를 받았다.'; } addCurse(c, 'badluck'); return '빈 컵이다. 10G를 잃고 🐈‍⬛ 불운 카드가 덱에 들어왔다.'; },
      },
      { label: '지나간다', run: () => '야바위꾼이 혀를 찬다.' },
    ],
  },
  {
    id: 'devil', name: '악마의 거래', emoji: '😈', text: '계약서를 내미는 붉은 정장의 사내.',
    choices: [
      { label: '최대 체력 -15 → 전설 유물 (+🥴 금단 증상 카드)', can: (c) => c.run.maxHp > 25, run: (c) => { maxHpChange(c.run, -15); const id = relicOfRarity(c, 'legendary'); if (id) giveRelic(c, id); addCurse(c, 'withdrawal'); return '계약이 성립했다. 대가로 금단 증상 카드가 덱에 들어왔다.'; } },
      { label: '거절한다', run: () => '사내는 웃으며 사라졌다.' },
    ],
  },
  {
    id: 'drunkdealer', name: '취한 딜러', emoji: '🍺', text: '"주사위 한 판, 높으면 두 배!"',
    choices: [
      {
        label: '칩 3을 걸고 대결', odds: '내 눈이 더 크면 칩 6 · 같으면 반환 · 작으면 꽝', can: (c) => c.run.chips >= 3,
        run: (c) => {
          gainChips(c, -3);
          const r = rng(c, 'casino');
          const me = r.die(); const him = r.die();
          gambleDone(c, me > him);
          if (me > him) { gainChips(c, 6); return `나 ${me} vs 딜러 ${him} — 승리! 칩 6`; }
          if (me === him) { gainChips(c, 3); return `나 ${me} vs 딜러 ${him} — 무승부, 반환`; }
          return `나 ${me} vs 딜러 ${him} — 패배`;
        },
      },
      { label: '사양한다', run: () => '딜러가 술잔을 비운다.' },
    ],
  },
  {
    id: 'fountain', name: '소원의 우물', emoji: '⛲', text: '동전이 반짝이는 우물.',
    choices: [
      {
        label: '10G 던지기', odds: '50.0%: 체력 전부 회복 / 50.0%: 아무 일 없음', can: (c) => c.run.gold >= 10,
        run: (c) => { gainGold(c, -10); const win = rng(c, 'casino').chance(0.5); gambleDone(c, win); if (win) { healPlayer(c, c.run.maxHp); return '물이 빛난다. 체력 전부 회복!'; } return '아무 일도 없었다.'; },
      },
      { label: '그냥 마신다', run: (c) => { healPlayer(c, 10); return '시원하다. 체력 10 회복.'; } },
    ],
  },
  {
    id: 'forge', name: '주사위 대장간', emoji: '⚒️', text: '"15G에 재질을 바꿔주지."',
    choices: [
      {
        label: '15G: 재질 변경 (3중 택1)', can: (c) => c.run.gold >= 15,
        run: (c) => {
          gainGold(c, -15);
          const opts: RewardOption[] = [];
          for (let i = 0; i < 3; i++) { const id = rollItemId(c, 'material', rng(c, 'loot').pick(['common', 'rare', 'rare', 'epic'] as const), 'loot', opts.map((o) => o.id)); if (id) opts.push({ kind: 'material', id }); }
          offer(c, '재질 선택', opts);
          return '대장장이가 망치를 든다.';
        },
      },
      { label: '지나간다', run: () => '불꽃이 튄다.' },
    ],
  },
  {
    id: 'tattoo', name: '문신 가게', emoji: '🖋️', text: '"공짜로 새겨주지. 💀 서명 하나 포함."',
    choices: [
      {
        label: '면 스티커 무료 + 해골 면 1개',
        run: (c) => {
          const r = rng(c, 'loot');
          const free = c.run.dice.flatMap((d) => d.faces.filter((f) => !f.sticker));
          if (free.length) r.pick(free).sticker = 'skull';
          const opts: RewardOption[] = [];
          for (let i = 0; i < 3; i++) { const id = rollItemId(c, 'face', r.pick(['common', 'rare', 'epic'] as const), 'loot', [...opts.map((o) => o.id), 'skull']); if (id) opts.push({ kind: 'face', id }); }
          offer(c, '면 스티커 선택', opts);
          return '해골 면이 어딘가에 새겨졌다...';
        },
      },
      { label: '거절', run: () => '문신사가 바늘을 내려놓는다.' },
    ],
  },
  {
    id: 'loan', name: '사채', emoji: '🦈', text: '지금 50G → 다음 막에 80G 상환 (못 갚으면 최대❤-20)', maxAct: 2,
    choices: [
      { label: '50G 빌린다', can: (c) => !c.run.flags.loan, run: (c) => { gainGold(c, 50); c.run.flags.loan = 80; return '두툼한 봉투를 받았다.'; } },
      { label: '거절', run: () => '사채업자가 명함을 남기고 간다.' },
    ],
  },
  {
    id: 'oldgambler', name: '늙은 도박꾼', emoji: '👴', text: '"유물 걸고 홀짝 한 판?"',
    choices: [
      {
        label: '가장 최근 유물을 걸고 홀짝', odds: '홀짝을 맞히면 같은 등급 유물 2개 · 틀리면 잃음', can: (c) => c.run.relics.length > 0,
        run: (c) => {
          const id = c.run.relics[c.run.relics.length - 1];
          const rar = RELIC_BY_ID[id].rarity;
          const win = rng(c, 'casino').chance(0.5);
          gambleDone(c, win);
          if (win) {
            for (let i = 0; i < 2; i++) { const n = relicOfRarity(c, rar); if (n) giveRelic(c, n); }
            return '맞혔다! 유물 두 개를 받았다.';
          }
          c.run.relics = c.run.relics.filter((r) => r !== id);
          return `틀렸다. 「${RELIC_BY_ID[id].name}」을(를) 잃었다.`;
        },
      },
      { label: '사양한다', run: () => '노인은 허허 웃는다.' },
    ],
  },
  {
    id: 'luckycat', name: '행운의 고양이', emoji: '🐈', text: '황금 방울 고양이.',
    choices: [
      { label: '쓰다듬기', run: (c) => { addJackpot(c, 25); return '골골송. 잭팟 게이지 +25%'; } },
      { label: '5G로 먹이 주기', can: (c) => c.run.gold >= 5, run: (c) => { gainGold(c, -5); c.run.flags.luckycat = 3; return '다음 3전투 저금통 정산 +20%'; } },
    ],
  },
  {
    id: 'mirror', name: '거울의 방', emoji: '🪞', text: '무언가를 복제할 수 있는 방.',
    choices: [
      {
        label: '주사위 1개 복제 (이번 막 동안)',
        run: (c) => {
          const src = [...c.run.dice].sort((a, b) => b.faces.filter((f) => f.sticker).length - a.faces.filter((f) => f.sticker).length || (b.material !== 'wood' ? 1 : 0) - (a.material !== 'wood' ? 1 : 0))[0];
          const uid = c.run.nextUid++;
          c.run.dice.push({ uid, material: src.material, faces: src.faces.map((f) => ({ ...f })) });
          c.run.flags['tempdie_' + uid] = c.run.act;
          return '주사위가 하나 늘었다 (이번 막 한정).';
        },
      },
      {
        label: '카드 1장 강화 (A/B 중 택1)',
        run: (c) => { c.run.pending = { kind: 'upgradeCard', then: 'event' }; return '강화할 카드를 고른다.'; },
      },
    ],
  },
  {
    id: 'vipcard', name: 'VIP 초대장', emoji: '💌', text: '금박 초대장.',
    choices: [
      { label: '다음 카지노에서 칩 ×2', run: (c) => { c.run.flags.vip = 1; return '초대장을 챙겼다.'; } },
      { label: '즉시 칩 4', run: (c) => { gainChips(c, 4); return '칩 4개를 받았다.'; } },
    ],
  },
  {
    id: 'rigged', name: '조작된 슬롯', emoji: '🎰', text: '"7 확률 20%" (진짜다)',
    choices: [
      {
        label: '칩 2로 1회', odds: '7: 20.0% → 영웅 유물 · 꽝 80.0%', can: (c) => c.run.chips >= 2,
        run: (c) => {
          gainChips(c, -2);
          const win = rng(c, 'casino').chance(0.2);
          gambleDone(c, win);
          if (win) { const id = relicOfRarity(c, 'epic'); if (id) giveRelic(c, id); return '7-7-7! 영웅 유물 획득.'; }
          return '꽝. 안내문은 정직했다.';
        },
      },
      { label: '지나간다', run: () => '슬롯이 깜빡인다.' },
    ],
  },
  // ── 카드 삭제 이벤트 ──
  {
    id: 'trainer', name: '지하 체육관', emoji: '🏋️', text: '"몸이 밑천이지. 단련하고 가."',
    choices: [
      { label: '골드 25: 단련 (최대 체력 +6, 그만큼 회복)', can: (c) => c.run.gold >= 25, run: (c) => { gainGold(c, -25); maxHpChange(c.run, 6); healPlayer(c, 6); return '땀을 흘렸다. 최대 체력 +6.'; } },
      { label: '혹독한 단련: 체력 -10 → 최대 체력 +10', can: (c) => c.run.hp > 10, run: (c) => { c.run.hp -= 10; maxHpChange(c.run, 10); return '쓰러지기 직전까지 버텼다. 최대 체력 +10.'; } },
      { label: '지나간다', run: () => '역기 소리가 멀어진다.' },
    ],
  },
  {
    id: 'incinerator', name: '소각로', emoji: '🔥', text: '"필요 없는 건 태워 버려."',
    choices: [
      { label: '카드 1장 삭제', can: (c) => c.run.deck.length > BALANCE.minDeck, run: (c) => { c.run.pending = { kind: 'removeCard', then: 'event', count: 1 }; return '태울 카드를 고른다.'; } },
      { label: '카드 2장 삭제, 체력 -8', can: (c) => c.run.deck.length > BALANCE.minDeck + 1 && c.run.hp > 8, run: (c) => { c.run.pending = { kind: 'removeCard', then: 'event', count: 2, hpCost: 8 }; return '태울 카드 2장을 고른다.'; } },
      { label: '지나간다', run: () => '불길이 사그라든다.' },
    ],
  },
  {
    id: 'confession', name: '고해성사', emoji: '⛪', text: '"죄를 고하면 짐을 덜어 주리라."',
    choices: [
      { label: '골드 15: 카드 1장 삭제', can: (c) => c.run.gold >= 15 && c.run.deck.length > BALANCE.minDeck, run: (c) => { c.run.pending = { kind: 'removeCard', then: 'event', count: 1, cost: 15 }; return '고백할 카드를 고른다.'; } },
      {
        label: '골드 30: 저주 카드 전부 삭제', can: (c) => c.run.gold >= 30 && c.run.deck.some((x) => CARD_BY_ID[x.id]?.rarity === 'curse'),
        run: (c) => { gainGold(c, -30); const n = c.run.deck.length; c.run.deck = c.run.deck.filter((x) => CARD_BY_ID[x.id]?.rarity !== 'curse'); c.run.stats.removals += n - c.run.deck.length; deckChanged(c); return `저주 카드 ${n - c.run.deck.length}장이 사라졌다.`; },
      },
      { label: '지나간다', run: () => '종소리가 울린다.' },
    ],
  },
  {
    id: 'lethe', name: '망각의 샘', emoji: '🌫️', text: '마시면 무언가를 잊는다. 무엇을 잊을지는 모른다.',
    choices: [
      {
        label: '마신다', odds: '무작위 카드 2장 삭제 (어떤 카드인지 모름, 50%는 기본 카드)', can: (c) => c.run.deck.length > BALANCE.minDeck + 1,
        run: (c) => {
          const r = rng(c, 'map');
          const gone: string[] = [];
          for (let i = 0; i < 2 && c.run.deck.length > BALANCE.minDeck; i++) {
            const basics = c.run.deck.filter((x) => CARD_BY_ID[x.id]?.rarity === 'basic');
            const others = c.run.deck.filter((x) => CARD_BY_ID[x.id]?.rarity !== 'basic');
            const pool = (r.chance(0.5) && basics.length) || !others.length ? basics : others;
            const pick = r.pick(pool);
            c.run.deck = c.run.deck.filter((x) => x !== pick);
            c.run.stats.removals++;
            gone.push(CARD_BY_ID[pick.id]?.name ?? pick.id);
          }
          deckChanged(c);
          return `머리가 맑아졌다. 잊은 카드: ${gone.join(', ')}`;
        },
      },
      { label: '지나간다', run: () => '물빛이 흔들린다.' },
    ],
  },
];

export const EVENT_BY_ID = Object.fromEntries(EVENTS.map((e) => [e.id, e])) as Record<string, EventDef>;

