import type { RewardOption } from '../core/state';
import { fire, rng, type Ctx } from '../rules/ctx';
import { giveRelic, relicOfRarity, rollItemId } from '../rules/economy';
import { addJackpot, gainChips, gainGold, healPlayer, maxHpChange } from '../rules/ops';
import { RELIC_BY_ID } from './relics';

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
    id: 'shellgame', name: '야바위', emoji: '🥤', text: '컵 세 개가 빠르게 섞인다. "10G 걸면 30G!"',
    choices: [
      {
        label: '10G를 건다', odds: '성공 33.3% · 기대 수익 ×1.00', can: (c) => c.run.gold >= 10,
        run: (c) => { gainGold(c, -10); const win = rng(c, 'casino').int(1, 3) === 1; gambleDone(c, win); if (win) { gainGold(c, 30); return '정답! 30G를 받았다.'; } return '빈 컵이다. 10G를 잃었다.'; },
      },
      { label: '지나간다', run: () => '야바위꾼이 혀를 찬다.' },
    ],
  },
  {
    id: 'devil', name: '악마의 거래', emoji: '😈', text: '붉은 정장의 사내가 계약서를 내민다.',
    choices: [
      { label: '최대 체력 -15 → 전설 유물', can: (c) => c.run.maxHp > 25, run: (c) => { maxHpChange(c.run, -15); const id = relicOfRarity(c, 'legendary'); if (id) giveRelic(c, id); return '계약이 성립했다.'; } },
      { label: '거절한다', run: () => '사내는 웃으며 사라졌다.' },
    ],
  },
  {
    id: 'drunkdealer', name: '취한 딜러', emoji: '🍺', text: '"주사위 한 판 어때? 칩 3개 걸고, 높으면 두 배!"',
    choices: [
      {
        label: '칩 3을 걸고 대결', odds: '승 41.7% (×2) · 무 16.7% (반환) · 기대 수익 ×1.00', can: (c) => c.run.chips >= 3,
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
    id: 'fountain', name: '소원의 우물', emoji: '⛲', text: '반짝이는 동전들이 바닥에 깔려 있다.',
    choices: [
      {
        label: '10G 던지기', odds: '50.0%: 체력 전부 회복 / 50.0%: 아무 일 없음', can: (c) => c.run.gold >= 10,
        run: (c) => { gainGold(c, -10); const win = rng(c, 'casino').chance(0.5); gambleDone(c, win); if (win) { healPlayer(c, c.run.maxHp); return '물이 빛난다. 체력 전부 회복!'; } return '아무 일도 없었다.'; },
      },
      { label: '그냥 마신다', run: (c) => { healPlayer(c, 10); return '시원하다. 체력 10 회복.'; } },
    ],
  },
  {
    id: 'forge', name: '주사위 대장간', emoji: '⚒️', text: '"15G면 주사위 재질을 바꿔주지."',
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
    id: 'tattoo', name: '문신 가게', emoji: '🖋️', text: '"공짜로 새겨주지. 대신 내 서명(해골)도 하나 넣어야 해."',
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
    id: 'loan', name: '사채', emoji: '🦈', text: '"지금 50G, 다음 막 시작할 때 80G. 못 갚으면… 최대 체력 20."', maxAct: 2,
    choices: [
      { label: '50G 빌린다', can: (c) => !c.run.flags.loan, run: (c) => { gainGold(c, 50); c.run.flags.loan = 80; return '두툼한 봉투를 받았다.'; } },
      { label: '거절', run: () => '사채업자가 명함을 남기고 간다.' },
    ],
  },
  {
    id: 'oldgambler', name: '늙은 도박꾼', emoji: '👴', text: '"자네 유물 하나 걸고 홀짝 어떤가? 이기면 같은 등급 두 개."',
    choices: [
      {
        label: '가장 최근 유물을 걸고 홀짝', odds: '성공 50.0% · 기대 수익 ×1.00', can: (c) => c.run.relics.length > 0,
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
    id: 'luckycat', name: '행운의 고양이', emoji: '🐈', text: '황금 방울을 단 고양이가 다가온다.',
    choices: [
      { label: '쓰다듬기', run: (c) => { addJackpot(c, 25); return '골골송. 잭팟 게이지 +25%'; } },
      { label: '5G로 먹이 주기', can: (c) => c.run.gold >= 5, run: (c) => { gainGold(c, -5); c.run.flags.luckycat = 3; return '다음 3전투 저금통 정산 +20%'; } },
    ],
  },
  {
    id: 'mirror', name: '거울의 방', emoji: '🪞', text: '끝없이 반사되는 방. 무언가를 복제할 수 있을 것 같다.',
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
        label: '스킬 1개 강화 (+50%)',
        run: (c) => { c.run.pending = { kind: 'upgrade', amount: 0.5, then: 'event' }; return '강화할 스킬을 고른다.'; },
      },
    ],
  },
  {
    id: 'vipcard', name: 'VIP 초대장', emoji: '💌', text: '금박 초대장이 바닥에 떨어져 있다.',
    choices: [
      { label: '다음 카지노에서 칩 ×2', run: (c) => { c.run.flags.vip = 1; return '초대장을 챙겼다.'; } },
      { label: '즉시 칩 4', run: (c) => { gainChips(c, 4); return '칩 4개를 받았다.'; } },
    ],
  },
  {
    id: 'rigged', name: '조작된 슬롯', emoji: '🎰', text: '"이 슬롯은 7 확률 20%입니다." — 정직한 안내문이 붙어 있다. (실제로 20%)',
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
];

export const EVENT_BY_ID = Object.fromEntries(EVENTS.map((e) => [e.id, e])) as Record<string, EventDef>;

