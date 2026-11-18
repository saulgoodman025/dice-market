// 카드 정의 (공용 60 + 캐릭터 전용 60 + 기본 2 + 저주 3).
// 수치는 v에만 두고 설명은 {키} 템플릿으로 채운다. 강화는 A/B 분기: 적힌 부분만 덮어쓴다.
import type { CardInst, Enemy, HandDie, HandId } from '../core/state';
import type { Ctx } from '../rules/ctx';
import type { Cond } from './cond';
import type { Tag } from './tags';

export type CardRarity = 'basic' | 'common' | 'rare' | 'epic' | 'legendary' | 'curse';
export type CardOwner = 'common' | 'gambler' | 'merchant' | 'knight' | 'sharp';

/** 카드 효과 실행 도구 (rules/cards.ts가 만든다) */
export interface CardUse {
  ctx: Ctx;
  inst: CardInst;
  n: Record<string, number>; // 강화 반영 수치
  dice: HandDie[];
  vals: number[]; // 효과 계산용 값 (재질·면 반영)
  pips: number[]; // 원래 눈
  v: number; // 첫 주사위 값
  sum: number;
  power: number;
  dmg: (base: number, opts?: { aoe?: boolean; random?: boolean; hits?: number; flat?: boolean; target?: Enemy; strMult?: number }) => number;
  block: (base: number, opts?: { keep?: boolean; flat?: boolean }) => void;
  gold: (base: number, opts?: { flat?: boolean }) => void;
  heal: (base: number) => void;
  piggy: (base: number, opts?: { flat?: boolean }) => void;
  pay: (gold: number) => boolean;
  draw: (k: number) => CardInst[];
  tgt: () => Enemy | undefined;
  foes: () => Enemy[];
  poison: (e: Enemy | 'all', k: number) => void;
  frail: (e: Enemy | 'all', t: number) => void;
  vuln: (e: Enemy | 'all', t: number) => void;
  buff: (id: string, turns: number, value: number, owner?: 'player' | Enemy) => void;
  /** 성공 확률 p(%)로 도박. 확률 보정·판돈 올리기·끝내주는 날이 자동 반영된다. 성공하면 효과 배율을 돌려준다(0 = 실패) */
  gamble: (p: number, label: string) => number;
  jackpot: (pct: number) => void;
  handRank: () => number;
  rand: (lo: number, hi: number) => number; // 전투 RNG 스트림
  str: () => number; // 내 힘
  persist: () => boolean; // 방어도 유지(철벽) 중인가
  ret: number[] | null; // 손으로 돌려보낼 주사위 눈
  choice?: { key?: number; value?: number; cardUid?: number };
}

export interface CardUpgrade {
  label: string;
  v?: Record<string, number>;
  cost?: number;
  cond?: Cond;
  exhaust?: boolean;
  desc?: string;
  needHand?: HandId;
  perCombat?: number;
  target?: 'enemy' | undefined;
}

export interface CardDef {
  id: string;
  name: string;
  icon: string;
  rarity: CardRarity;
  owner: CardOwner;
  tag?: Tag;
  cost: number;
  cond: Cond;
  exhaust?: boolean;
  starter?: boolean;
  desc: string;
  v: Record<string, number>;
  upgrades?: { A: CardUpgrade; B: CardUpgrade };
  role: 'atk' | 'def' | 'eco' | 'util';
  target?: 'enemy';
  odds?: string; // 도박 카드: 확률이 든 v 키 (표시·보정 대상)
  chance?: boolean; // 결과가 운에 달려 미리보기 불가
  perTurn?: number;
  perCombat?: number;
  noEcho?: boolean;
  echo?: boolean;
  primesDouble?: boolean;
  keepDie?: boolean;
  retDie?: boolean; // 주사위를 돌려받는 카드
  rollOnly?: boolean; // 족보 확정 전(리롤 단계)에만
  needHand?: HandId; // 이번 턴 족보가 이 이상
  choose?: 'otherDie' | 'otherDieOnly' | 'value' | 'pile';
  chooseValues?: (u: { pip: number; n: Record<string, number> }) => number[];
  needGold?: string; // v 키: 이만큼 골드가 있어야 사용 가능
  unplayable?: boolean;
  /** 저주: 턴이 끝날 때 손에 있으면 */
  inHandEnd?: (ctx: Ctx) => void;
  /** 저주: 손에 있는 동안 리롤 보정 */
  inHandRerolls?: number;
  run: (u: CardUse) => void;
}

const tgtOr = (u: CardUse) => u.tgt();
const C = (d: CardDef) => d;

export const CARDS: CardDef[] = [
  // ═════════ 기본 ═════════
  C({ id: 'slash', name: '베기', icon: '🗡️', rarity: 'basic', owner: 'common', cost: 1, cond: { k: 'any' }, role: 'atk', target: 'enemy',
    desc: '적에게 눈만큼 피해.', v: { a: 0, dr: 0 },
    upgrades: { A: { label: '피해 +3', v: { a: 3 }, desc: '적에게 눈+{a} 피해.' }, B: { label: '1장 뽑기', v: { dr: 1 }, desc: '적에게 눈만큼 피해. 카드 1장 뽑기.' } },
    run: (u) => { u.dmg(u.v + u.n.a); u.draw(u.n.dr); } }),
  C({ id: 'guard', name: '방패', icon: '🛡️', rarity: 'basic', owner: 'common', cost: 1, cond: { k: 'any' }, role: 'def',
    desc: '눈만큼 방어도.', v: { a: 0, keep: 0 },
    upgrades: { A: { label: '방어 +3', v: { a: 3 }, desc: '눈+{a} 방어도.' }, B: { label: '다음 턴까지 유지', v: { keep: 1 }, desc: '눈만큼 방어도. 다음 턴까지 유지.' } },
    run: (u) => u.block(u.v + u.n.a, { keep: !!u.n.keep }) }),

  // ═════════ 무색 ═════════
  C({ id: 'breather', name: '숨 고르기', icon: '😮‍💨', rarity: 'common', owner: 'common', cost: 0, cond: { k: 'instant' }, role: 'util',
    desc: '카드 {d}장 뽑기.', v: { d: 2, r: 0 },
    upgrades: { A: { label: '3장 뽑기', v: { d: 3 } }, B: { label: '리롤 +1', v: { r: 1 }, desc: '카드 {d}장 뽑기. 리롤 +{r}.' } },
    run: (u) => { u.draw(u.n.d); if (u.n.r) u.ctx.run.combat!.rerollsLeft += u.n.r; } }),
  C({ id: 'firstaid', name: '응급처치', icon: '🩹', rarity: 'common', owner: 'common', cost: 1, cond: { k: 'any' }, role: 'def', exhaust: true,
    desc: '눈의 절반(올림)만큼 회복. 소멸.', v: { div: 2 },
    upgrades: { A: { label: '회복 = 눈', v: { div: 1 }, desc: '눈만큼 회복. 소멸.' }, B: { label: '소멸 없음', exhaust: false, desc: '눈의 절반(올림)만큼 회복.' } },
    run: (u) => u.heal(Math.ceil(u.v / u.n.div)) }),
  C({ id: 'sixblessing', name: '육의 축복', icon: '✨', rarity: 'rare', owner: 'common', cost: 0, cond: { k: 'instant' }, role: 'util',
    desc: '남은 주사위 중 6의 개수만큼 뽑기 (최소 1).', v: { x: 0, five: 0 },
    upgrades: { A: { label: '+1장', v: { x: 1 }, desc: '남은 주사위 중 6의 개수+1만큼 뽑기.' }, B: { label: '5도 셈', v: { five: 1 }, desc: '남은 주사위 중 5와 6의 개수만큼 뽑기 (최소 1).' } },
    run: (u) => { const cb = u.ctx.run.combat!; const c = cb.hand.filter((h) => !h.used && (h.pip === 6 || (u.n.five && h.pip === 5))).length; u.draw(Math.max(1, c + u.n.x)); } }),
  C({ id: 'warcry', name: '전투 함성', icon: '📣', rarity: 'epic', owner: 'common', cost: 1, cond: { k: 'instant' }, role: 'util', noEcho: true,
    desc: '모든 적 취약·약화 {t}턴. 내 약화·취약 해제.', v: { t: 1 },
    upgrades: { A: { label: '2턴', v: { t: 2 } }, B: { label: '비용 0, 소멸', cost: 0, exhaust: true, desc: '모든 적 취약·약화 {t}턴. 내 약화·취약 해제. 소멸.' } },
    run: (u) => { u.vuln('all', u.n.t); u.frail('all', u.n.t); const cb = u.ctx.run.combat!; cb.pWeak = 0; cb.pVuln = 0; } }),

  // ═════════ ⚔ 칼날 ═════════
  C({ id: 'jab', name: '잽', icon: '👊', rarity: 'common', owner: 'common', tag: 'blade', cost: 1, cond: { k: 'range', lo: 1, hi: 3 }, role: 'atk', target: 'enemy',
    desc: '눈×{m} 피해.', v: { m: 2, h: 1 },
    upgrades: { A: { label: '눈×3', v: { m: 3 } }, B: { label: '2회', v: { h: 2 }, desc: '눈×{m} 피해를 {h}번.' } },
    run: (u) => { u.dmg(u.v * u.n.m, { hits: u.n.h }); } }),
  C({ id: 'heavy', name: '강타', icon: '🔨', rarity: 'common', owner: 'common', tag: 'blade', cost: 1, cond: { k: 'range', lo: 4, hi: 6 }, role: 'atk', target: 'enemy',
    desc: '눈×2 피해.', v: { a: 0, vu: 0 },
    upgrades: { A: { label: '+4', v: { a: 4 }, desc: '눈×2+{a} 피해.' }, B: { label: '취약 1턴', v: { vu: 1 }, desc: '눈×2 피해. 대상 취약 1턴.' } },
    run: (u) => { u.dmg(u.v * 2 + u.n.a); const t = u.tgt(); if (u.n.vu && t) u.vuln(t, u.n.vu); } }),
  C({ id: 'twin', name: '쌍검', icon: '⚔️', rarity: 'common', owner: 'common', tag: 'blade', cost: 1, cond: { k: 'same', n: 2 }, role: 'atk', target: 'enemy',
    desc: '두 눈의 합×{m} 피해.', v: { m: 2, dr: 0, h: 1 },
    upgrades: { A: { label: '합×2.5', v: { m: 2.5 } }, B: { label: '1장 뽑기', v: { dr: 1 }, desc: '두 눈의 합×{m} 피해. 1장 뽑기.' } },
    run: (u) => { u.dmg(u.sum * u.n.m, { hits: u.n.h }); u.draw(u.n.dr); } }),
  C({ id: 'vampire', name: '흡혈', icon: '🧛', rarity: 'rare', owner: 'common', tag: 'blade', cost: 1, cond: { k: 'any' }, role: 'atk', target: 'enemy',
    desc: '눈만큼 피해, 준 피해의 {p}% 회복.', v: { m: 1, p: 50, hs: 0 },
    upgrades: { A: { label: '회복 100%', v: { p: 100 } }, B: { label: '피해 ×1.5', v: { m: 1.5 }, desc: '눈×1.5 피해, 준 피해의 {p}% 회복.' } },
    run: (u) => { const d = u.dmg(u.v * u.n.m); u.heal(d * u.n.p / 100 + u.n.hs * u.str()); } }),
  C({ id: 'rally', name: '기합', icon: '💪', rarity: 'rare', owner: 'common', tag: 'blade', cost: 1, cond: { k: 'instant' }, role: 'util', noEcho: true,
    desc: '힘 +{s} (전투 끝까지).', v: { s: 2 },
    upgrades: { A: { label: '힘 +3', v: { s: 3 } }, B: { label: '비용 0', cost: 0 } },
    run: (u) => u.buff('str', Infinity, u.n.s) }),
  C({ id: 'execute', name: '처형', icon: '🪓', rarity: 'rare', owner: 'common', tag: 'blade', cost: 2, cond: { k: 'exact', v: 6 }, role: 'atk', target: 'enemy',
    desc: '{d} 피해.', v: { d: 18 },
    upgrades: { A: { label: '피해 24', v: { d: 24 } }, B: { label: '조건 5~6', cond: { k: 'range', lo: 5, hi: 6 } } },
    run: (u) => { u.dmg(u.n.d * (u.vals[0] / Math.max(1, u.pips[0]))); } }),
  C({ id: 'triple', name: '삼연격', icon: '🐾', rarity: 'epic', owner: 'common', tag: 'blade', cost: 2, cond: { k: 'same', n: 3 }, role: 'atk', target: 'enemy',
    desc: '눈×3 피해를 {h}번.', v: { h: 3 },
    upgrades: { A: { label: '4번', v: { h: 4 } }, B: { label: '비용 1', cost: 1 } },
    run: (u) => { u.dmg(u.v * 3, { hits: u.n.h }); } }),

  // ═════════ ☠ 저주 ═════════
  C({ id: 'intimidate', name: '위협', icon: '😠', rarity: 'common', owner: 'common', tag: 'curse', cost: 0, cond: { k: 'any' }, role: 'util', target: 'enemy', noEcho: true,
    desc: '대상 약화 {t}턴 (주는 피해 -25%).', v: { t: 2, all: 0 },
    upgrades: { A: { label: '3턴', v: { t: 3 } }, B: { label: '모든 적', v: { all: 1 }, desc: '모든 적 약화 {t}턴.' } },
    run: (u) => { const t = u.tgt(); u.frail(u.n.all ? 'all' : t ?? 'all', u.n.t); } }),
  C({ id: 'poison', name: '독침', icon: '🦂', rarity: 'common', owner: 'common', tag: 'curse', cost: 1, cond: { k: 'any' }, role: 'atk', target: 'enemy',
    desc: '대상에게 독 눈. (매 턴 독만큼 피해, 1씩 줄어듦)', v: { a: 0, fr: 0 },
    upgrades: { A: { label: '독 +3', v: { a: 3 }, desc: '대상에게 독 눈+{a}.' }, B: { label: '약화 1턴', v: { fr: 1 }, desc: '대상에게 독 눈, 약화 1턴.' } },
    run: (u) => { const t = u.tgt(); if (!t) return; u.poison(t, u.v + u.n.a); if (u.n.fr) u.frail(t, u.n.fr); } }),
  C({ id: 'acid', name: '산성 침', icon: '🧪', rarity: 'common', owner: 'common', tag: 'curse', cost: 1, cond: { k: 'any' }, role: 'atk', target: 'enemy',
    desc: '눈만큼 피해, 독 {p}.', v: { p: 2, all: 0 },
    upgrades: { A: { label: '독 4', v: { p: 4 } }, B: { label: '모든 적에게 독', v: { all: 1 }, desc: '눈만큼 피해, 모든 적에게 독 {p}.' } },
    run: (u) => { u.dmg(u.v); const t = u.tgt(); u.poison(u.n.all ? 'all' : t ?? 'all', u.n.p); } }),
  C({ id: 'expose', name: '약점 노출', icon: '🔍', rarity: 'rare', owner: 'common', tag: 'curse', cost: 1, cond: { k: 'any' }, role: 'util', target: 'enemy', noEcho: true,
    desc: '대상 취약 {t}턴 (받는 피해 +50%).', v: { t: 2, dr: 0 },
    upgrades: { A: { label: '3턴', v: { t: 3 } }, B: { label: '1장 뽑기', v: { dr: 1 }, desc: '대상 취약 {t}턴. 1장 뽑기.' } },
    run: (u) => { const t = u.tgt(); if (t) u.vuln(t, u.n.t); u.draw(u.n.dr); } }),
  C({ id: 'contagion', name: '전염', icon: '🦠', rarity: 'rare', owner: 'common', tag: 'curse', cost: 1, cond: { k: 'instant' }, role: 'atk', target: 'enemy',
    desc: '대상의 독을 다른 모든 적에게 복사.', v: { a: 0 },
    upgrades: { A: { label: '복사량 +3', v: { a: 3 }, desc: '대상의 독+{a}을 다른 모든 적에게.' }, B: { label: '비용 0', cost: 0 } },
    run: (u) => { const t = u.tgt(); if (!t) return; const k = t.poison + u.n.a; for (const e of u.foes()) if (e !== t) u.poison(e, k); } }),
  C({ id: 'catalyst', name: '기폭제', icon: '⚗️', rarity: 'epic', owner: 'common', tag: 'curse', cost: 1, cond: { k: 'instant' }, role: 'atk', target: 'enemy', exhaust: true,
    desc: '대상의 독 ×{m}. 소멸.', v: { m: 2 },
    upgrades: { A: { label: '독 ×3', v: { m: 3 } }, B: { label: '소멸 없음', exhaust: false, desc: '대상의 독 ×{m}.' } },
    run: (u) => { const t = u.tgt(); if (t) u.poison(t, t.poison * (u.n.m - 1)); } }),
  C({ id: 'deathmark', name: '죽음의 표식', icon: '💀', rarity: 'legendary', owner: 'common', tag: 'curse', cost: 2, cond: { k: 'any' }, role: 'atk', target: 'enemy',
    desc: '대상에게 독 눈. {t}턴간 받는 독 피해 2배.', v: { t: 3, all: 0 },
    upgrades: { A: { label: '5턴', v: { t: 5 } }, B: { label: '모든 적', v: { all: 1 }, desc: '모든 적에게 독 눈. {t}턴간 받는 독 피해 2배.' } },
    run: (u) => { const ts = u.n.all ? u.foes() : [u.tgt()].filter((e): e is Enemy => !!e); for (const t of ts) { u.poison(t, u.v); u.buff('deathmark', u.n.t, 1, t); } } }),

  // ═════════ 🛡 방패 ═════════
  C({ id: 'thorns', name: '가시방패', icon: '🌵', rarity: 'common', owner: 'common', tag: 'shield', cost: 1, cond: { k: 'any' }, role: 'def',
    desc: '눈만큼 방어. 이번 턴 공격받으면 {r} 반사.', v: { r: 3, t: 0 },
    upgrades: { A: { label: '반사 6', v: { r: 6 } }, B: { label: '2턴 지속', v: { t: 2 }, desc: '눈만큼 방어. {t}턴간 공격받으면 {r} 반사.' } },
    run: (u) => { u.block(u.v); if (u.n.t) u.buff('thorns', u.n.t, u.n.r); else u.ctx.run.combat!.thorns += u.n.r; } }),
  C({ id: 'brace', name: '굳건함', icon: '🪵', rarity: 'common', owner: 'common', tag: 'shield', cost: 1, cond: { k: 'any' }, role: 'def',
    desc: '눈×{m} 방어.', v: { m: 1.5, keep: 0 },
    upgrades: { A: { label: '눈×2', v: { m: 2 } }, B: { label: '다음 턴까지 유지', v: { keep: 1 }, desc: '눈×{m} 방어. 다음 턴까지 유지.' } },
    run: (u) => u.block(u.v * u.n.m * (u.n.bwx && u.persist() ? u.n.bwx : 1), { keep: !!u.n.keep }) }),
  C({ id: 'raise', name: '방패 올리기', icon: '🙌', rarity: 'common', owner: 'common', tag: 'shield', cost: 1, cond: { k: 'any' }, role: 'def',
    desc: '눈+{a} 방어. {d}장 뽑기.', v: { a: 2, d: 1 },
    upgrades: { A: { label: '2장 뽑기', v: { d: 2 } }, B: { label: '방어 +5', v: { a: 5 } } },
    run: (u) => { u.block(u.v + u.n.a); u.draw(u.n.d); } }),
  C({ id: 'bash', name: '방패치기', icon: '🧱', rarity: 'rare', owner: 'common', tag: 'shield', cost: 1, cond: { k: 'any' }, role: 'atk', target: 'enemy',
    desc: '현재 방어도만큼 피해.', v: { m: 1, pv: 0 },
    upgrades: { A: { label: '방어도×1.5', v: { m: 1.5 }, desc: '현재 방어도×1.5만큼 피해.' }, B: { label: '+눈', v: { pv: 1 }, desc: '현재 방어도+눈만큼 피해.' } },
    run: (u) => { const cb = u.ctx.run.combat!; u.dmg((cb.block + cb.keepBlock) * u.n.m + u.v * u.n.pv); } }),
  C({ id: 'counter', name: '반격 태세', icon: '🤺', rarity: 'rare', owner: 'common', tag: 'shield', cost: 1, cond: { k: 'any' }, role: 'def',
    desc: '{t}턴간 공격받을 때마다 눈만큼 반격.', v: { t: 2, m: 1 },
    upgrades: { A: { label: '3턴', v: { t: 3 } }, B: { label: '반격 눈×2', v: { m: 2 }, desc: '{t}턴간 공격받을 때마다 눈×2 반격.' } },
    run: (u) => u.buff('counter', u.n.t, Math.round(u.v * u.n.m * u.power)) }),
  C({ id: 'fortress', name: '요새', icon: '🏰', rarity: 'epic', owner: 'common', tag: 'shield', cost: 2, cond: { k: 'sumMin', n: 3, min: 15 }, role: 'def',
    desc: '방어 {b}. 다음 턴까지 유지.', v: { b: 25 },
    upgrades: { A: { label: '방어 35', v: { b: 35 } }, B: { label: '조건 합 12+', cond: { k: 'sumMin', n: 3, min: 12 } } },
    run: (u) => u.block(u.n.b, { keep: true }) }),
  C({ id: 'bulwark', name: '철벽', icon: '🧱', rarity: 'legendary', owner: 'common', tag: 'shield', cost: 2, cond: { k: 'instant' }, role: 'def', exhaust: true,
    desc: '이번 전투 동안 방어도가 턴이 바뀌어도 사라지지 않음. 소멸.', v: { b: 0 },
    upgrades: { A: { label: '비용 1', cost: 1 }, B: { label: '방어 10 추가', v: { b: 10 }, desc: '방어 {b}. 이번 전투 동안 방어도가 사라지지 않음. 소멸.' } },
    run: (u) => { u.buff('bulwark', Infinity, 1); if (u.n.b) u.block(u.n.b, { flat: true }); } }),

  // ═════════ 🎰 도박 ═════════
  C({ id: 'dicebet', name: '주사위 내기', icon: '🎲', rarity: 'common', owner: 'common', tag: 'gamble', cost: 1, cond: { k: 'any' }, role: 'atk', target: 'enemy', odds: 'p', chance: true,
    desc: '{p}%: 눈×3 피해. 실패하면 0.', v: { p: 50, dr: 0 },
    upgrades: { A: { label: '성공 67%', v: { p: 67 } }, B: { label: '성공 시 1장 뽑기', v: { dr: 1 }, desc: '{p}%: 눈×3 피해, 1장 뽑기. 실패하면 0.' } },
    run: (u) => { const w = u.gamble(u.n.p, '눈×3 피해'); if (w) { u.dmg(u.v * 3 * w); u.draw(u.n.dr); } } }),
  C({ id: 'luckydraw', name: '럭키 드로우', icon: '🎟️', rarity: 'common', owner: 'common', tag: 'gamble', cost: 0, cond: { k: 'instant' }, role: 'util',
    desc: '{d}장 뽑고, 그중 1장은 이번 턴 비용 0.', v: { d: 2, bo: 0 },
    upgrades: { A: { label: '3장', v: { d: 3 } }, B: { label: '그 카드 효과 +50%', v: { bo: 1 }, desc: '{d}장 뽑고, 그중 1장은 이번 턴 비용 0, 효과 +50%.' } },
    run: (u) => { const got = u.draw(u.n.d); if (!got.length) return; const cb = u.ctx.run.combat!; const pick = got[u.rand(0, got.length - 1)]; cb.costFree.push(pick.uid); if (u.n.bo) cb.boosted.push(pick.uid); } }),
  C({ id: 'jackpotshot', name: '잭팟 노리기', icon: '🎯', rarity: 'common', owner: 'common', tag: 'gamble', cost: 1, cond: { k: 'any' }, role: 'atk', target: 'enemy',
    desc: '눈×{m} 피해. 잭팟 게이지 +눈×{j}%.', v: { m: 1, j: 2 },
    upgrades: { A: { label: '잭팟 +눈×3%', v: { j: 3 } }, B: { label: '피해 눈×2', v: { m: 2 } } },
    run: (u) => { u.dmg(u.v * u.n.m * (u.n.jt && u.ctx.run.combat!.jackpotTurn ? u.n.jt : 1)); u.jackpot(u.pips[0] * u.n.j); } }),
  C({ id: 'gamble', name: '도박사', icon: '🎲', rarity: 'rare', owner: 'common', tag: 'gamble', cost: 0, cond: { k: 'range', lo: 1, hi: 2 }, role: 'atk', target: 'enemy', odds: 'p', chance: true,
    desc: '다시 굴려 {p}%로 {d} 피해.', v: { p: 17, d: 30, fd: 0 },
    upgrades: { A: { label: '성공 33%', v: { p: 33 } }, B: { label: '피해 45, 실패 시 1장', v: { d: 45, fd: 1 }, desc: '다시 굴려 {p}%로 {d} 피해. 실패하면 1장 뽑기.' } },
    run: (u) => { const w = u.gamble(u.n.p, `${u.n.d} 피해!`); if (w) u.dmg(u.n.d * w); else u.draw(u.n.fd); } }),
  C({ id: 'roulette', name: '룰렛 베팅', icon: '🎡', rarity: 'rare', owner: 'common', tag: 'gamble', cost: 1, cond: { k: 'any' }, role: 'atk', target: 'enemy', odds: 'p', chance: true,
    desc: '{p}%: 눈×{m} 피해. 0이 나오면 잭팟 가득.', v: { p: 49, m: 5, fb: 0 },
    upgrades: { A: { label: '눈×7', v: { m: 7 } }, B: { label: '실패 시 방어 눈', v: { fb: 1 }, desc: '{p}%: 눈×{m} 피해. 실패하면 방어 눈. 0이면 잭팟 가득.' } },
    run: (u) => {
      const w = u.gamble(u.n.p, `눈×${u.n.m} 피해`);
      if (w) u.dmg(u.v * u.n.m * w);
      else { if (u.n.fb) u.block(u.v); if (u.rand(1, 19) === 1) u.jackpot(100); }
    } }),
  C({ id: 'doubledown', name: '더블다운', icon: '✖️', rarity: 'epic', owner: 'common', tag: 'gamble', cost: 1, cond: { k: 'any' }, role: 'util', noEcho: true, primesDouble: true,
    desc: '이번 턴 다음 카드 효과 ×2. 안 쓰면 체력 -눈.', v: { fr: 0, safe: 0 },
    upgrades: { A: { label: '다음 카드 비용 0', v: { fr: 1 }, desc: '이번 턴 다음 카드 효과 ×2, 비용 0. 안 쓰면 체력 -눈.' }, B: { label: '페널티 없음', v: { safe: 1 }, desc: '이번 턴 다음 카드 효과 ×2.' } },
    run: (u) => { const cb = u.ctx.run.combat!; cb.doubledown = u.n.safe ? -1 : u.pips[0]; if (u.n.fr) cb.turnCounters.nextFree = (cb.turnCounters.nextFree ?? 0) + 1; } }),
  C({ id: 'allin', name: '올인', icon: '💥', rarity: 'epic', owner: 'common', tag: 'gamble', cost: 2, cond: { k: 'all' }, role: 'atk', target: 'enemy',
    desc: '남은 주사위 전부: 합×{m} 피해. 합 {t} 미만이면 저금통 절반 몰수.', v: { m: 3, t: 15 },
    upgrades: { A: { label: '합×4', v: { m: 4 } }, B: { label: '기준 12', v: { t: 12 } } },
    run: (u) => {
      u.dmg(u.sum * u.n.m);
      const cb = u.ctx.run.combat!;
      if (u.pips.reduce((s, p) => s + p, 0) < u.n.t && !cb.turnCounters.allinSafe) { cb.piggy = Math.floor(cb.piggy / 2); u.ctx.emit({ t: 'toast', text: '올인 실패: 저금통 절반 몰수', tone: 'bad' }); }
    } }),

  // ═════════ 💰 경제 ═════════
  C({ id: 'coinflip', name: '동전 던지기', icon: '🪙', rarity: 'common', owner: 'common', tag: 'eco', cost: 0, cond: { k: 'any' }, role: 'eco', target: 'enemy',
    desc: '골드 +눈+{g}, 눈÷{dv} 피해.', v: { g: 0, dv: 2 },
    upgrades: { A: { label: '골드 +2', v: { g: 2 } }, B: { label: '피해 = 눈', v: { dv: 1 }, desc: '골드 +눈+{g}, 눈만큼 피해.' } },
    run: (u) => { u.gold(u.v + u.n.g); u.dmg(Math.ceil(u.v / u.n.dv)); } }),
  C({ id: 'invest', name: '투자', icon: '📈', rarity: 'common', owner: 'common', tag: 'eco', cost: 0, cond: { k: 'any' }, role: 'eco',
    desc: '저금통 +눈×{m}.', v: { m: 2, dr: 0 },
    upgrades: { A: { label: '눈×3', v: { m: 3 } }, B: { label: '1장 뽑기', v: { dr: 1 }, desc: '저금통 +눈×{m}. 1장 뽑기.' } },
    run: (u) => { u.piggy(u.v * u.n.m); u.draw(u.n.dr); } }),
  C({ id: 'tip', name: '팁', icon: '💵', rarity: 'common', owner: 'common', tag: 'eco', cost: 0, cond: { k: 'instant' }, role: 'eco', exhaust: true,
    desc: '골드 +{g}, 1장 뽑기. 소멸.', v: { g: 3 },
    upgrades: { A: { label: '골드 +6', v: { g: 6 } }, B: { label: '소멸 없음', exhaust: false, desc: '골드 +{g}, 1장 뽑기.' } },
    run: (u) => { u.gold(u.n.g, { flat: true }); u.draw(1); } }),
  C({ id: 'lucky7', name: '럭키 세븐', icon: '🍀', rarity: 'rare', owner: 'common', tag: 'eco', cost: 1, cond: { k: 'sumPair', v: 7 }, role: 'atk', target: 'enemy',
    desc: '{d} 피해, 골드 +{g}.', v: { d: 21, g: 7 },
    upgrades: { A: { label: '피해 28', v: { d: 28 } }, B: { label: '골드 +14', v: { g: 14 } } },
    run: (u) => { u.dmg(u.n.d); u.gold(u.n.g); } }),
  C({ id: 'compound', name: '복리', icon: '🏦', rarity: 'rare', owner: 'common', tag: 'eco', cost: 1, cond: { k: 'any' }, role: 'eco',
    desc: '저금통 +{p}% (최소 +눈).', v: { p: 10, t: 0 },
    upgrades: { A: { label: '+20%', v: { p: 20 } }, B: { label: '3턴간 매 턴', v: { t: 3 }, desc: '저금통 +{p}% (최소 +눈). 3턴간 매 턴 +{p}%.' } },
    run: (u) => { const cb = u.ctx.run.combat!; u.piggy(Math.max(u.v, cb.piggy * u.n.p / 100), { flat: true }); if (u.n.t) u.buff('compound', u.n.t, u.n.p); } }),
  C({ id: 'bond', name: '채권', icon: '📃', rarity: 'epic', owner: 'common', tag: 'eco', cost: 1, cond: { k: 'instant' }, role: 'eco',
    desc: '{t}턴간 매 턴 시작 저금통 +{g}.', v: { t: 3, g: 5 },
    upgrades: { A: { label: '5턴', v: { t: 5 } }, B: { label: '매 턴 +8', v: { g: 8 } } },
    run: (u) => u.buff('bond', u.n.t, u.n.g) }),
  C({ id: 'midas', name: '미다스의 손', icon: '👑', rarity: 'legendary', owner: 'common', tag: 'eco', cost: 1, cond: { k: 'any' }, role: 'eco', perCombat: 1,
    desc: '저금통 ×{m} (전투당 1번).', v: { m: 1.5, aoe: 0 },
    upgrades: { A: { label: '×2', v: { m: 2 } }, B: { label: '저금통 25% 전체 피해', v: { aoe: 25 }, desc: '저금통 ×{m}, 저금통의 {aoe}%만큼 모든 적에게 피해 (전투당 1번).' } },
    run: (u) => { const cb = u.ctx.run.combat!; cb.piggy = Math.round(cb.piggy * u.n.m + u.v); if (u.n.aoe) u.dmg(cb.piggy * u.n.aoe / 100, { aoe: true, flat: true }); } }),

  // ═════════ 🔗 연쇄 ═════════
  C({ id: 'combo', name: '연타', icon: '👐', rarity: 'common', owner: 'common', tag: 'chain', cost: 1, cond: { k: 'any' }, role: 'atk', target: 'enemy',
    desc: '눈 + 이번 턴 쓴 카드 수×{m} 피해.', v: { m: 2 },
    upgrades: { A: { label: '카드 수×3', v: { m: 3 } }, B: { label: '비용 0', cost: 0 } },
    run: (u) => { u.dmg(u.v + u.ctx.run.combat!.cardsPlayed * u.n.m); } }),
  C({ id: 'quickstrike', name: '속공', icon: '💨', rarity: 'common', owner: 'common', tag: 'chain', cost: 0, cond: { k: 'range', lo: 1, hi: 3 }, role: 'atk', target: 'enemy',
    desc: '눈×{m} 피해. {d}장 뽑기.', v: { m: 1, d: 1 },
    upgrades: { A: { label: '2장 뽑기', v: { d: 2 } }, B: { label: '피해 눈×2', v: { m: 2 } } },
    run: (u) => { u.dmg(u.v * u.n.m); u.draw(u.n.d); } }),
  C({ id: 'link', name: '연결', icon: '🔗', rarity: 'common', owner: 'common', tag: 'chain', cost: 0, cond: { k: 'instant' }, role: 'util',
    desc: '이번 턴 다음 카드 {c}장 비용 -1. {d}장 뽑기.', v: { c: 1, d: 1 },
    upgrades: { A: { label: '다음 2장', v: { c: 2 } }, B: { label: '2장 뽑기', v: { d: 2 } } },
    run: (u) => { const cb = u.ctx.run.combat!; cb.turnCounters.discount = (cb.turnCounters.discount ?? 0) + u.n.c; u.draw(u.n.d); } }),
  C({ id: 'echo', name: '메아리', icon: '🔁', rarity: 'rare', owner: 'common', tag: 'chain', cost: 1, cond: { k: 'any' }, role: 'util', noEcho: true, echo: true,
    desc: '직전에 쓴 카드를 이 주사위로 한 번 더.', v: { bo: 0 },
    upgrades: { A: { label: '비용 0', cost: 0 }, B: { label: '효과 +50%', v: { bo: 1 }, desc: '직전에 쓴 카드를 이 주사위로 한 번 더 (효과 +50%).' } },
    run: () => { /* rules/cards.ts에서 처리 */ } }),
  C({ id: 'rush', name: '질주', icon: '🏃', rarity: 'rare', owner: 'common', tag: 'chain', cost: 1, cond: { k: 'instant' }, role: 'util',
    desc: '{d}장 뽑기.', v: { d: 3 },
    upgrades: { A: { label: '4장', v: { d: 4 } }, B: { label: '비용 0, 소멸', cost: 0, exhaust: true, desc: '{d}장 뽑기. 소멸.' } },
    run: (u) => { u.draw(u.n.d); } }),
  C({ id: 'chain', name: '연쇄 번개', icon: '⚡', rarity: 'epic', owner: 'common', tag: 'chain', cost: 2, cond: { k: 'any' }, role: 'atk',
    desc: '모든 적에게 눈 + 이번 턴 쓴 주사위 수×{m} 피해.', v: { m: 2 },
    upgrades: { A: { label: '주사위 수×3', v: { m: 3 } }, B: { label: '비용 1', cost: 1 } },
    run: (u) => { u.dmg(u.v + u.ctx.run.combat!.diceUsedThisTurn * u.n.m, { aoe: true }); } }),
  C({ id: 'infinitechain', name: '무한 연쇄', icon: '♾️', rarity: 'legendary', owner: 'common', tag: 'chain', cost: 2, cond: { k: 'instant' }, role: 'util', exhaust: true,
    desc: '이번 턴 남은 카드 비용 0. 소멸.', v: { d: 0 },
    upgrades: { A: { label: '비용 1', cost: 1 }, B: { label: '2장 뽑기', v: { d: 2 }, desc: '이번 턴 남은 카드 비용 0, {d}장 뽑기. 소멸.' } },
    run: (u) => { const cb = u.ctx.run.combat!; cb.turnCounters.allFree = 1; u.draw(u.n.d); } }),

  // ═════════ 🔧 조작 ═════════
  C({ id: 'bump', name: '올리기', icon: '⬆️', rarity: 'common', owner: 'common', tag: 'rig', cost: 0, cond: { k: 'range', lo: 1, hi: 5 }, retDie: true, role: 'util', noEcho: true,
    desc: '눈 +{a}로 돌려받음.', v: { a: 1, dr: 0 },
    upgrades: { A: { label: '+2', v: { a: 2 } }, B: { label: '1장 뽑기', v: { dr: 1 }, desc: '눈 +{a}로 돌려받음. 1장 뽑기.' } },
    run: (u) => { u.ret = [Math.min(6, u.pips[0] + u.n.a)]; u.draw(u.n.dr); } }),
  C({ id: 'flip', name: '뒤집기', icon: '🔄', rarity: 'common', owner: 'common', tag: 'rig', cost: 0, cond: { k: 'any' }, retDie: true, role: 'util', noEcho: true,
    desc: '눈을 뒤집어 돌려받음 (1↔6, 2↔5, 3↔4).', v: { dr: 0, two: 0 },
    upgrades: { A: { label: '1장 뽑기', v: { dr: 1 }, desc: '눈을 뒤집어 돌려받음. 1장 뽑기.' }, B: { label: '가장 낮은 주사위도', v: { two: 1 }, desc: '눈을 뒤집어 돌려받고, 가장 낮은 다른 주사위도 뒤집음.' } },
    run: (u) => {
      u.ret = [Math.max(1, Math.min(6, 7 - u.pips[0]))]; u.draw(u.n.dr);
      if (u.n.two) { const cb = u.ctx.run.combat!; const o = cb.hand.filter((h) => !h.used && !u.dice.includes(h)).sort((a, b) => a.pip - b.pip)[0]; if (o) { o.pip = 7 - o.pip; o.sticker = undefined; } }
    } }),
  C({ id: 'split', name: '분할', icon: '✂️', rarity: 'common', owner: 'common', tag: 'rig', cost: 0, cond: { k: 'range', lo: 4, hi: 6 }, retDie: true, role: 'util', noEcho: true,
    desc: '주사위를 둘로 쪼개 돌려받음 (6→3+3).', v: { up: 0 },
    upgrades: { A: { label: '조건 3~6', cond: { k: 'range', lo: 3, hi: 6 } }, B: { label: '하나 +1', v: { up: 1 }, desc: '주사위를 둘로 쪼개 돌려받고, 하나는 +1.' } },
    run: (u) => { const p = u.pips[0]; const a = Math.ceil(p / 2); u.ret = [Math.min(6, a + u.n.up), p - a]; } }),
  C({ id: 'reload', name: '재장전', icon: '🔃', rarity: 'rare', owner: 'common', tag: 'rig', cost: 0, cond: { k: 'any' }, retDie: true, role: 'util', noEcho: true, perTurn: 1,
    desc: '리롤 +{r}, 주사위를 돌려받음 (턴당 1번).', v: { r: 1, dr: 0 },
    upgrades: { A: { label: '리롤 +2', v: { r: 2 } }, B: { label: '1장 뽑기', v: { dr: 1 }, desc: '리롤 +{r}, 주사위를 돌려받음. 1장 뽑기 (턴당 1번).' } },
    run: (u) => { const cb = u.ctx.run.combat!; cb.rerollsLeft += u.n.r; cb.phase = 'roll'; u.ret = [u.pips[0]]; u.draw(u.n.dr); } }),
  C({ id: 'pin', name: '고정', icon: '📌', rarity: 'rare', owner: 'common', tag: 'rig', cost: 1, cond: { k: 'any' }, role: 'util', noEcho: true,
    desc: '이 주사위를 다음 턴까지 이 눈으로 보관 (다음 턴 굴림에서 제외).', v: {},
    upgrades: { A: { label: '2개 보관', cond: { k: 'anyN', n: 2 }, desc: '주사위 2개를 다음 턴까지 이 눈으로 보관.' }, B: { label: '비용 0', cost: 0 } },
    run: (u) => { const cb = u.ctx.run.combat!; for (const d of u.dice) if (d.dieIdx >= 0) cb.next.pinned.push({ dieIdx: d.dieIdx, pip: d.pip }); } }),
  C({ id: 'duplicate', name: '복제', icon: '🧬', rarity: 'epic', owner: 'common', tag: 'rig', cost: 1, cond: { k: 'any' }, retDie: true, role: 'util', noEcho: true, exhaust: true,
    desc: '이 주사위 복사본 {c}개를 이번 턴 손으로. 소멸.', v: { c: 2 },
    upgrades: { A: { label: '소멸 없음', exhaust: false, desc: '이 주사위 복사본 {c}개를 이번 턴 손으로.' }, B: { label: '복사본 3개', v: { c: 3 } } },
    run: (u) => { u.ret = Array(u.n.c).fill(u.choice?.value ?? u.pips[0]); } }),
  C({ id: 'fate', name: '운명 조작', icon: '🔮', rarity: 'legendary', owner: 'common', tag: 'rig', cost: 1, cond: { k: 'any' }, retDie: true, role: 'util', noEcho: true, keepDie: true, choose: 'otherDie',
    desc: '다른 주사위 하나를 원하는 눈으로. 이 주사위는 돌려받음.', v: { two: 0 },
    upgrades: { A: { label: '2개 변경', v: { two: 1 }, desc: '다른 주사위 하나(+가장 낮은 주사위 하나)를 원하는 눈으로. 이 주사위는 돌려받음.' }, B: { label: '비용 0', cost: 0 } },
    run: () => { /* rules/cards.ts에서 choice 처리 */ } }),

  // ═════════ 🃏 족보 ═════════
  C({ id: 'evenstab', name: '짝수 찌르기', icon: '🔱', rarity: 'common', owner: 'common', tag: 'hand', cost: 1, cond: { k: 'even' }, role: 'atk', target: 'enemy',
    desc: '눈+{a} 피해.', v: { a: 4, fl: 0 },
    upgrades: { A: { label: '+7', v: { a: 7 } }, B: { label: '플러시면 ×2', v: { fl: 1 }, desc: '눈+{a} 피해. 이번 턴 족보가 플러시 이상이면 ×2.' } },
    run: (u) => { u.dmg((u.v + u.n.a) * (u.n.fl && u.handRank() >= 3 ? 2 : 1)); } }),
  C({ id: 'oddcut', name: '홀수 베기', icon: '🌀', rarity: 'common', owner: 'common', tag: 'hand', cost: 1, cond: { k: 'odd' }, role: 'atk',
    desc: '무작위 적에게 눈+{a} 피해.', v: { a: 3, h: 1, aim: 0 },
    upgrades: { A: { label: '대상 지정', v: { aim: 1 }, target: 'enemy', desc: '적에게 눈+{a} 피해.' }, B: { label: '2회', v: { h: 2 }, desc: '무작위 적에게 눈+{a} 피해를 {h}번.' } },
    run: (u) => { u.dmg(u.v + u.n.a, { random: !u.n.aim, hits: u.n.h }); } }),
  C({ id: 'pairstrike', name: '페어 스트라이크', icon: '👯', rarity: 'common', owner: 'common', tag: 'hand', cost: 1, cond: { k: 'same', n: 2 }, role: 'atk', target: 'enemy',
    desc: '두 눈의 합×{m} 피해. 족보가 원 페어 이상이면 족보 칩 +{c}.', v: { m: 1.5, c: 1 },
    upgrades: { A: { label: '합×2', v: { m: 2 } }, B: { label: '칩 +2', v: { c: 2 } } },
    run: (u) => { u.dmg(u.sum * u.n.m); if (u.handRank() >= 1) u.ctx.run.combat!.handChips += u.n.c; } }),
  C({ id: 'straight', name: '스트레이트', icon: '🎳', rarity: 'rare', owner: 'common', tag: 'hand', cost: 2, cond: { k: 'seq', n: 4 }, role: 'atk',
    desc: '모든 적에게 {d} 피해.', v: { d: 25 },
    upgrades: { A: { label: '피해 35', v: { d: 35 } }, B: { label: '연속 3개', cond: { k: 'seq', n: 3 } } },
    run: (u) => { u.dmg(u.n.d, { aoe: true }); } }),
  C({ id: 'fullblow', name: '풀하우스 블로', icon: '🏠', rarity: 'rare', owner: 'common', tag: 'hand', cost: 1, cond: { k: 'instant' }, role: 'atk', target: 'enemy', needHand: 'full',
    desc: '이번 턴 족보가 풀하우스 이상이면: {d} 피해.', v: { d: 30 },
    upgrades: { A: { label: '피해 40', v: { d: 40 } }, B: { label: '트리플 이상', needHand: 'triple', desc: '이번 턴 족보가 트리플 이상이면: {d} 피해.' } },
    run: (u) => { u.dmg(u.n.d); } }),
  C({ id: 'countcards', name: '카드 카운팅', icon: '🧮', rarity: 'epic', owner: 'common', tag: 'hand', cost: 0, cond: { k: 'instant' }, role: 'util',
    desc: '다음 턴 첫 굴림 주사위 {k}개를 미리 봄. {d}장 뽑기.', v: { k: 2, d: 1 },
    upgrades: { A: { label: '3개 미리보기', v: { k: 3 } }, B: { label: '2장 뽑기', v: { d: 2 } } },
    run: (u) => { const cb = u.ctx.run.combat!; cb.next.previewN = Math.max(cb.next.previewN, u.n.k); u.draw(u.n.d); } }),
  C({ id: 'yahtzeehammer', name: '야찌 해머', icon: '🌟', rarity: 'legendary', owner: 'common', tag: 'hand', cost: 1, cond: { k: 'same', n: 5 }, role: 'atk', target: 'enemy',
    desc: '{d} 피해, 잭팟 가득.', v: { d: 100, d4: 60 },
    upgrades: { A: { label: '피해 150', v: { d: 150 } }, B: { label: '4개로도 (60)', cond: { k: 'sameMin', n: 4 }, desc: '같은 눈 5개: {d} 피해, 4개: {d4} 피해. 잭팟 가득.' } },
    run: (u) => { u.dmg(u.dice.length >= 5 ? u.n.d : u.n.d4); u.jackpot(100); } }),

  // ═════════ 🎰 도박사 전용 ═════════
  C({ id: 'fatedie', name: '운명의 주사위', icon: '🎲', rarity: 'common', owner: 'gambler', tag: 'gamble', starter: true, cost: 1, cond: { k: 'any' }, role: 'atk', target: 'enemy',
    desc: '다시 굴려 새 눈×{m} 피해. 6이면 1장 뽑기.', v: { m: 2, best: 0 },
    upgrades: { A: { label: '새 눈×3', v: { m: 3 } }, B: { label: '높은 쪽 사용', v: { best: 1 }, desc: '다시 굴려 원래 눈과 새 눈 중 높은 쪽×{m} 피해. 6이면 1장 뽑기.' } },
    run: (u) => {
      const r = u.rand(1, 6);
      u.ctx.emit({ t: 'chanceRoll', kind: 'die', result: r, win: r === 6, label: `새 눈 ${r}` });
      const nv = u.n.best ? Math.max(r, u.pips[0]) : r;
      u.dmg(nv * u.n.m * (u.vals[0] / Math.max(1, u.pips[0])));
      if (r === 6) u.draw(1);
    } }),
  C({ id: 'anteup', name: '판돈 올리기', icon: '🪙', rarity: 'common', owner: 'gambler', tag: 'gamble', starter: true, cost: 0, cond: { k: 'instant' }, role: 'util', noEcho: true,
    desc: '이번 턴 다음 도박 카드 {c}장이 성공하면 효과 ×2. {dr}장 뽑기.', v: { c: 1, dr: 1 },
    upgrades: { A: { label: '2장', v: { c: 2 } }, B: { label: '2장 뽑기', v: { dr: 2 } } },
    run: (u) => { const cb = u.ctx.run.combat!; cb.turnCounters.anteup = (cb.turnCounters.anteup ?? 0) + u.n.c; u.draw(u.n.dr); } }),
  C({ id: 'parlay', name: '연속 베팅', icon: '📶', rarity: 'common', owner: 'gambler', tag: 'gamble', cost: 1, cond: { k: 'any' }, role: 'atk', target: 'enemy', odds: 'p', chance: true,
    desc: '{p}%: 눈×2+누적 피해, 이 카드가 비용 0으로 돌아옴 (최대 3연속). 실패하면 누적 0.', v: { p: 50, half: 0 },
    upgrades: { A: { label: '성공 60%', v: { p: 60 } }, B: { label: '실패 시 누적 절반', v: { half: 1 }, desc: '{p}%: 눈×2+누적 피해, 비용 0으로 돌아옴 (최대 3연속). 실패하면 누적의 절반 피해.' } },
    run: (u) => {
      const acc = u.inst.data?.acc ?? 0;
      const chain = u.inst.data?.chain ?? 0;
      const w = u.gamble(u.n.p, '연속 베팅 성공!');
      if (w) {
        const base = u.v * 2;
        u.dmg((base + acc) * w);
        if (chain + 1 < 3) {
          const cb = u.ctx.run.combat!;
          const c = { uid: u.ctx.run.nextUid++, id: u.inst.id, up: u.inst.up, temp: true, data: { acc: acc + base, chain: chain + 1 } };
          cb.cards.push(c);
          cb.costFree.push(c.uid);
        }
      } else if (u.n.half && acc) u.dmg(acc / 2);
    } }),
  C({ id: 'shuffle', name: '셔플', icon: '🔀', rarity: 'common', owner: 'gambler', tag: 'chain', cost: 0, cond: { k: 'instant' }, role: 'util',
    desc: '손패를 모두 버리고 버린 수+{a}장 뽑기.', v: { a: 1, r: 0 },
    upgrades: { A: { label: '+2장', v: { a: 2 } }, B: { label: '리롤 +1', v: { r: 1 }, desc: '손패를 모두 버리고 버린 수+{a}장 뽑기. 리롤 +1.' } },
    run: (u) => { const cb = u.ctx.run.combat!; const k = cb.cards.length; cb.discard.push(...cb.cards.filter((c) => !c.temp)); cb.cards = []; u.draw(k + u.n.a); cb.rerollsLeft += u.n.r; } }),
  C({ id: 'cardsharp', name: '카드 날리기', icon: '🃏', rarity: 'common', owner: 'gambler', tag: 'chain', cost: 0, cond: { k: 'range', lo: 1, hi: 3 }, role: 'atk', target: 'enemy',
    desc: '눈×{m} 피해. 손패 {k}장 버리고 {k}장 뽑기.', v: { m: 1, k: 1 },
    upgrades: { A: { label: '2장', v: { k: 2 } }, B: { label: '피해 눈×2', v: { m: 2 } } },
    run: (u) => {
      u.dmg(u.v * u.n.m);
      const cb = u.ctx.run.combat!;
      for (let i = 0; i < u.n.k && cb.cards.length; i++) {
        // 저주 카드부터, 없으면 비용이 가장 높은 카드를 버린다
        const idx = cb.cards.reduce((bi, c, j, a) => (score(c) > score(a[bi]) ? j : bi), 0);
        cb.discard.push(...cb.cards.splice(idx, 1).filter((c) => !c.temp));
      }
      u.draw(u.n.k);
    } }),
  C({ id: 'hotstreak', name: '끝내주는 날', icon: '🔥', rarity: 'rare', owner: 'gambler', tag: 'chain', cost: 1, cond: { k: 'instant' }, role: 'util',
    desc: '{t}턴간 도박이 성공할 때마다 1장 뽑기.', v: { t: 3, c: 1 },
    upgrades: { A: { label: '5턴', v: { t: 5 } }, B: { label: '칩 +1도', v: { c: 2 }, desc: '{t}턴간 도박이 성공할 때마다 1장 뽑기, 족보 칩 +1.' } },
    run: (u) => u.buff('hotstreak', u.n.t, u.n.c) }),
  C({ id: 'blackjack', name: '블랙잭', icon: '🂡', rarity: 'rare', owner: 'gambler', tag: 'gamble', cost: 1, cond: { k: 'dice', min: 2, max: 4 }, role: 'atk', target: 'enemy',
    desc: '합 21: {bj} 피해 / 17~20: 합만큼 / 22 이상: 0.', v: { bj: 42, bust: 0 },
    upgrades: { A: { label: '21이면 63', v: { bj: 63 } }, B: { label: '버스트도 절반', v: { bust: 1 }, desc: '합 21: {bj} 피해 / 17~20: 합만큼 / 22 이상: 합÷2.' } },
    run: (u) => { const s = u.pips.reduce((a, b) => a + b, 0); if (s === 21) u.dmg(u.n.bj); else if (s >= 17 && s <= 20) u.dmg(s); else if (s >= 22 && u.n.bust) u.dmg(s / 2); else if (s < 17) u.dmg(s); } }),
  C({ id: 'slotspin', name: '슬롯 스핀', icon: '🎰', rarity: 'rare', owner: 'gambler', tag: 'gamble', cost: 1, cond: { k: 'instant' }, role: 'atk', chance: true,
    desc: '릴 3개: 🍒 회복 {h} · 🪙 골드 {g} · ⚔ 무작위 적 {d} 피해. 3개 일치(11%) ×3.', v: { h: 8, g: 8, d: 15, fix: 0 },
    upgrades: { A: { label: '효과 +50%', v: { h: 12, g: 12, d: 22 } }, B: { label: '릴 하나 ⚔ 고정', v: { fix: 1 }, desc: '릴 3개 (하나는 ⚔ 고정): 🍒 회복 {h} · 🪙 골드 {g} · ⚔ {d} 피해. 3개 일치(33%) ×3.' } },
    run: (u) => {
      const reels = [0, 1, 2].map((i) => (u.n.fix && i === 0 ? 2 : u.rand(0, 2)));
      const m = reels.every((x) => x === reels[0]) ? 3 : 1;
      u.ctx.emit({ t: 'toast', text: `🎰 ${reels.map((x) => ['🍒', '🪙', '⚔'][x]).join(' ')}${m > 1 ? ' 잭팟 ×3!' : ''}`, tone: m > 1 ? 'gold' : 'info' });
      for (const x of reels) { if (x === 0) u.heal(u.n.h * m); else if (x === 1) u.gold(u.n.g * m, { flat: true }); else u.dmg(u.n.d * m, { random: true }); }
    } }),
  C({ id: 'lastcard', name: '마지막 패', icon: '🎴', rarity: 'rare', owner: 'gambler', tag: 'chain', cost: 1, cond: { k: 'any' }, role: 'atk', target: 'enemy',
    desc: '눈 × (이번 턴 쓴 카드 수+{a}) 피해.', v: { a: 0 },
    upgrades: { A: { label: '배수 +1', v: { a: 1 } }, B: { label: '비용 0', cost: 0 } },
    run: (u) => { u.dmg(u.v * Math.max(1, u.ctx.run.combat!.cardsPlayed + u.n.a)); } }),
  C({ id: 'luckycharm', name: '행운의 부적', icon: '🧿', rarity: 'rare', owner: 'gambler', tag: 'gamble', cost: 1, cond: { k: 'instant' }, role: 'util',
    desc: '{t}턴간 도박 카드 성공 확률 +{p}%p.', v: { t: 3, p: 10 },
    upgrades: { A: { label: '5턴', v: { t: 5 } }, B: { label: '+15%p', v: { p: 15 } } },
    run: (u) => u.buff('luck', u.n.t, u.n.p) }),
  C({ id: 'snakeeyes', name: '스네이크 아이즈', icon: '🐍', rarity: 'rare', owner: 'gambler', tag: 'gamble', cost: 0, cond: { k: 'exactN', v: 1, n: 2 }, role: 'atk', target: 'enemy',
    desc: '1 두 개: {d} 피해, 잭팟 +30%.', v: { d: 22 },
    upgrades: { A: { label: '피해 33', v: { d: 33 } }, B: { label: '1 하나로도 (11)', cond: { k: 'exact', v: 1 }, v: { d: 11 }, desc: '1 하나: {d} 피해, 잭팟 +30%.' } },
    run: (u) => { u.dmg(u.n.d); u.jackpot(30); } }),
  C({ id: 'multiplier', name: '배수 베팅', icon: '✖️', rarity: 'epic', owner: 'gambler', tag: 'gamble', cost: 1, cond: { k: 'instant' }, role: 'util', exhaust: true, odds: 'p', chance: true,
    desc: '{p}%: 다음 턴 족보 칩 ×2 / 실패: -2. 소멸.', v: { p: 50, safe: 0 },
    upgrades: { A: { label: '성공 60%', v: { p: 60 } }, B: { label: '실패 페널티 없음', v: { safe: 1 }, desc: '{p}%: 다음 턴 족보 칩 ×2. 소멸.' } },
    run: (u) => { const cb = u.ctx.run.combat!; const w = u.gamble(u.n.p, '다음 턴 족보 칩 ×2'); cb.next.chipMult = w ? 2 : u.n.safe ? 1 : -2; } }),
  C({ id: 'rollingthunder', name: '굴러가는 번개', icon: '🌩️', rarity: 'epic', owner: 'gambler', tag: 'chain', cost: 2, cond: { k: 'any' }, role: 'atk',
    desc: '모든 적에게 눈+{a} 피해. 이번 턴 쓴 카드 1장당 1번 더.', v: { a: 0 },
    upgrades: { A: { label: '피해 +2', v: { a: 2 } }, B: { label: '비용 1', cost: 1 } },
    run: (u) => { u.dmg(u.v + u.n.a, { aoe: true, hits: 1 + u.ctx.run.combat!.cardsPlayed }); } }),
  C({ id: 'bigspender', name: '큰손', icon: '💸', rarity: 'epic', owner: 'gambler', tag: 'gamble', cost: 1, cond: { k: 'instant' }, role: 'eco', odds: 'p', chance: true, needGold: 'bet',
    desc: '골드 {bet}을 걸고 {p}%: 골드 {win} + 1장 뽑기.', v: { bet: 10, win: 30, p: 50 },
    upgrades: { A: { label: '성공 67%', v: { p: 67 } }, B: { label: '판돈 20 → 70', v: { bet: 20, win: 70 } } },
    run: (u) => { if (!u.pay(u.n.bet)) return; const w = u.gamble(u.n.p, `골드 ${u.n.win}!`); if (w) { u.gold(u.n.win * w, { flat: true }); u.draw(1); } } }),
  C({ id: 'jackpotrush', name: '잭팟 러시', icon: '💰', rarity: 'legendary', owner: 'gambler', tag: 'gamble', cost: 2, cond: { k: 'instant' }, role: 'util', exhaust: true, noEcho: true,
    desc: '지금 바로 잭팟 턴: 남은 주사위 효과 ×2. 소멸.', v: {},
    upgrades: { A: { label: '비용 1', cost: 1 }, B: { label: '소멸 없음 (전투당 1번)', exhaust: false, perCombat: 1, desc: '지금 바로 잭팟 턴: 남은 주사위 효과 ×2 (전투당 1번).' } },
    run: (u) => { const cb = u.ctx.run.combat!; cb.jackpotTurn = true; u.ctx.run.jackpot = 0; for (const h of cb.hand) if (!h.used) h.golden = true; u.ctx.emit({ t: 'toast', text: '💰 잭팟 턴!', tone: 'gold' }); } }),

  // ═════════ 💼 상인 전용 ═════════
  C({ id: 'collect', name: '수금', icon: '🧾', rarity: 'common', owner: 'merchant', tag: 'eco', starter: true, cost: 1, cond: { k: 'any' }, role: 'atk', target: 'enemy',
    desc: '눈+{a} 피해, 골드 +{g}.', v: { a: 0, g: 1 },
    upgrades: { A: { label: '골드 +2', v: { g: 2 } }, B: { label: '피해 +2', v: { a: 2 } } },
    run: (u) => { u.dmg(u.v + u.n.a); u.gold(u.n.g, { flat: true }); } }),
  C({ id: 'ledger', name: '장부', icon: '📒', rarity: 'common', owner: 'merchant', tag: 'eco', starter: true, cost: 1, cond: { k: 'any' }, role: 'def',
    desc: '눈+{a} 방어, 저금통 +{p}.', v: { a: 0, p: 2 },
    upgrades: { A: { label: '저금통 +4', v: { p: 4 } }, B: { label: '방어 +3', v: { a: 3 } } },
    run: (u) => { u.block(u.v + u.n.a); u.piggy(u.n.p, { flat: true }); } }),
  C({ id: 'bribe', name: '뇌물', icon: '🤝', rarity: 'common', owner: 'merchant', tag: 'curse', cost: 0, cond: { k: 'instant' }, role: 'util', target: 'enemy', needGold: 'g',
    desc: '골드 {g} 내고 대상 약화 {t}턴.', v: { g: 3, t: 2, all: 0 },
    upgrades: { A: { label: '3턴', v: { t: 3 } }, B: { label: '모든 적', v: { all: 1 }, desc: '골드 {g} 내고 모든 적 약화 {t}턴.' } },
    run: (u) => { if (!u.pay(u.n.g)) return; u.frail(u.n.all ? 'all' : u.tgt() ?? 'all', u.n.t); } }),
  C({ id: 'dun', name: '빚 독촉', icon: '📢', rarity: 'common', owner: 'merchant', tag: 'curse', cost: 1, cond: { k: 'any' }, role: 'atk', target: 'enemy',
    desc: '눈+{a} 피해. 대상이 약화 상태면 독 눈.', v: { a: 0, vu: 0 },
    upgrades: { A: { label: '취약이어도', v: { vu: 1 }, desc: '눈+{a} 피해. 대상이 약화나 취약 상태면 독 눈.' }, B: { label: '피해 +3', v: { a: 3 } } },
    run: (u) => { const t = u.tgt(); const cond = !!t && (t.frail > 0 || (u.n.vu > 0 && t.vuln > 0)); u.dmg(u.v + u.n.a); if (t && cond && t.hp > 0) u.poison(t, u.v); } }),
  C({ id: 'appraisal', name: '감정', icon: '🔎', rarity: 'common', owner: 'merchant', tag: 'eco', cost: 0, cond: { k: 'instant' }, role: 'util',
    desc: '{d}장 뽑기. 💰 카드면 1장 더.', v: { d: 1, g: 0 },
    upgrades: { A: { label: '2장 뽑기', v: { d: 2 } }, B: { label: '골드 +2', v: { g: 2 }, desc: '{d}장 뽑기. 💰 카드면 1장 더. 골드 +{g}.' } },
    run: (u) => { const got = u.draw(u.n.d); if (got.some((c) => CARD_BY_ID[c.id]?.tag === 'eco')) u.draw(1); if (u.n.g) u.gold(u.n.g, { flat: true }); } }),
  C({ id: 'goldenshield', name: '황금 방패', icon: '🥇', rarity: 'common', owner: 'merchant', tag: 'eco', cost: 1, cond: { k: 'any' }, role: 'def',
    desc: '눈 + 보유 골드÷{dv} 방어.', v: { dv: 20, dr: 0 },
    upgrades: { A: { label: '골드÷10', v: { dv: 10 } }, B: { label: '1장 뽑기', v: { dr: 1 }, desc: '눈 + 보유 골드÷{dv} 방어. 1장 뽑기.' } },
    run: (u) => { u.block(u.v + Math.floor(u.ctx.run.gold / u.n.dv)); u.draw(u.n.dr); } }),
  C({ id: 'interestbomb', name: '이자 폭탄', icon: '💣', rarity: 'rare', owner: 'merchant', tag: 'curse', cost: 1, cond: { k: 'any' }, role: 'atk', target: 'enemy',
    desc: '대상에게 독 = 보유 골드÷{dv} (최소 2).', v: { dv: 10, all: 0 },
    upgrades: { A: { label: '골드÷7', v: { dv: 7 } }, B: { label: '모든 적', v: { all: 1 }, desc: '모든 적에게 독 = 보유 골드÷{dv} (최소 2).' } },
    run: (u) => { const k = Math.max(2, Math.floor(u.ctx.run.gold / u.n.dv)); u.poison(u.n.all ? 'all' : u.tgt() ?? 'all', k); } }),
  C({ id: 'dividend', name: '배당금', icon: '💹', rarity: 'rare', owner: 'merchant', tag: 'eco', cost: 0, cond: { k: 'instant' }, role: 'eco',
    desc: '저금통의 {p}%를 바로 골드로 (저금통은 그대로).', v: { p: 10, dr: 0 },
    upgrades: { A: { label: '15%', v: { p: 15 } }, B: { label: '1장 뽑기', v: { dr: 1 }, desc: '저금통의 {p}%를 바로 골드로. 1장 뽑기.' } },
    run: (u) => { u.gold(u.ctx.run.combat!.piggy * u.n.p / 100, { flat: true }); u.draw(u.n.dr); } }),
  C({ id: 'seize', name: '압류', icon: '📜', rarity: 'rare', owner: 'merchant', tag: 'curse', cost: 1, cond: { k: 'any' }, role: 'atk', target: 'enemy',
    desc: '대상 방어도를 전부 없애고 그만큼 골드 (최대 10).', v: { hit: 0 },
    upgrades: { A: { label: '그만큼 피해도', v: { hit: 1 }, desc: '대상 방어도를 전부 없애고 그만큼 골드(최대 10)와 피해.' }, B: { label: '비용 0', cost: 0 } },
    run: (u) => { const t = u.tgt(); if (!t) return; const b = t.block; t.block = 0; u.gold(Math.min(10, b), { flat: true }); if (u.n.hit && b) u.dmg(b, { target: t }); } }),
  C({ id: 'cashstrike', name: '현금 일격', icon: '💴', rarity: 'rare', owner: 'merchant', tag: 'eco', cost: 1, cond: { k: 'any' }, role: 'atk', target: 'enemy', needGold: 'g',
    desc: '골드 {g} 내고 눈×{m} 피해.', v: { g: 5, m: 4 },
    upgrades: { A: { label: '눈×5', v: { m: 5 } }, B: { label: '지불 없음, 눈×3', v: { g: 0, m: 3 }, desc: '눈×{m} 피해.' } },
    run: (u) => { if (!u.pay(u.n.g)) return; u.dmg(u.v * u.n.m); } }),
  C({ id: 'marketcrash', name: '시장 붕괴', icon: '📉', rarity: 'epic', owner: 'merchant', tag: 'curse', cost: 2, cond: { k: 'instant' }, role: 'atk',
    desc: '모든 적 취약 {t}턴 + 독 {p}.', v: { t: 2, p: 5 },
    upgrades: { A: { label: '취약 3턴', v: { t: 3 } }, B: { label: '독 8', v: { p: 8 } } },
    run: (u) => { u.vuln('all', u.n.t); u.poison('all', u.n.p); } }),
  C({ id: 'usury', name: '고리대', icon: '🩸', rarity: 'epic', owner: 'merchant', tag: 'curse', cost: 1, cond: { k: 'any' }, role: 'atk', target: 'enemy',
    desc: '대상에게 독 눈. {t}턴간 매 턴 독 +{p}.', v: { t: 3, p: 3 },
    upgrades: { A: { label: '5턴', v: { t: 5 } }, B: { label: '매 턴 +5', v: { p: 5 } } },
    run: (u) => { const t = u.tgt(); if (!t) return; u.poison(t, u.v); u.buff('usury', u.n.t, u.n.p + (u.n.gp ? Math.floor(u.ctx.run.gold / u.n.gp) : 0), t); } }),
  C({ id: 'hedgefund', name: '헤지 펀드', icon: '📊', rarity: 'epic', owner: 'merchant', tag: 'eco', cost: 1, cond: { k: 'instant' }, role: 'def',
    desc: '{t}턴간 받는 피해의 {p}%만큼 저금통 +.', v: { t: 3, p: 50 },
    upgrades: { A: { label: '100%', v: { p: 100 } }, B: { label: '5턴', v: { t: 5 } } },
    run: (u) => u.buff('hedge', u.n.t, u.n.p) }),
  C({ id: 'bankrupt', name: '파산 선고', icon: '⚖️', rarity: 'legendary', owner: 'merchant', tag: 'curse', cost: 2, cond: { k: 'any' }, role: 'atk', target: 'enemy', exhaust: true,
    desc: '대상의 독×{m} 피해. 소멸.', v: { m: 3 },
    upgrades: { A: { label: '독×4', v: { m: 4 } }, B: { label: '소멸 없음', exhaust: false, desc: '대상의 독×{m} 피해.' } },
    run: (u) => { const t = u.tgt(); if (t) u.dmg(t.poison * u.n.m, { target: t }); } }),
  C({ id: 'monopoly', name: '독점', icon: '🏛️', rarity: 'legendary', owner: 'merchant', tag: 'eco', cost: 1, cond: { k: 'instant' }, role: 'util', exhaust: true,
    desc: '이번 전투 동안 💰 카드 비용 0. 소멸.', v: { k: 1 },
    upgrades: { A: { label: '비용 0', cost: 0 }, B: { label: '☠ 카드도', v: { k: 2 }, desc: '이번 전투 동안 💰와 ☠ 카드 비용 0. 소멸.' } },
    run: (u) => u.buff('monopoly', Infinity, u.n.k) }),

  // ═════════ 🛡️ 기사 전용 ═════════
  C({ id: 'shieldcharge', name: '방패 돌진', icon: '🐗', rarity: 'common', owner: 'knight', tag: 'shield', starter: true, cost: 1, cond: { k: 'any' }, role: 'atk', target: 'enemy',
    desc: '눈÷2+{a} 방어, 눈÷{dv} 피해 (올림).', v: { a: 0, dv: 2, bm: 2 },
    upgrades: { A: { label: '방어 = 눈', v: { bm: 1 }, desc: '눈+{a} 방어, 눈÷{dv} 피해 (올림).' }, B: { label: '방어 +3', v: { a: 3 } } },
    run: (u) => { u.block(Math.ceil(u.v / u.n.bm) + u.n.a); u.dmg(Math.ceil(u.v / u.n.dv)); } }),
  C({ id: 'resolve', name: '결의', icon: '🎖️', rarity: 'common', owner: 'knight', tag: 'blade', starter: true, cost: 1, cond: { k: 'instant' }, role: 'util', noEcho: true,
    desc: '{t}턴간 힘 +{s}.', v: { t: 2, s: 1 },
    upgrades: { A: { label: '4턴', v: { t: 4 } }, B: { label: '힘 +2', v: { s: 2 } } },
    run: (u) => u.buff('str', u.n.t, u.n.s) }),
  C({ id: 'parry', name: '받아넘기기', icon: '🗡️', rarity: 'common', owner: 'knight', tag: 'shield', cost: 1, cond: { k: 'any' }, role: 'def',
    desc: '눈+{a} 방어. 다음 적 공격 {h}번 피해 절반.', v: { a: 0, h: 1 },
    upgrades: { A: { label: '2번', v: { h: 2 } }, B: { label: '방어 +4', v: { a: 4 } } },
    run: (u) => { u.block(u.v + u.n.a); u.buff('parry', 2, u.n.h); } }),
  C({ id: 'armorup', name: '갑옷 정비', icon: '🔩', rarity: 'common', owner: 'knight', tag: 'shield', cost: 1, cond: { k: 'any' }, role: 'def',
    desc: '눈만큼 방어. 다음 {t}턴 시작에도 방어 눈.', v: { t: 1, dr: 0 },
    upgrades: { A: { label: '다음 2턴', v: { t: 2 } }, B: { label: '1장 뽑기', v: { dr: 1 }, desc: '눈만큼 방어. 다음 턴 시작에도 방어 눈. 1장 뽑기.' } },
    run: (u) => { u.block(u.v); u.buff('armorup', u.n.t, Math.round(u.v * u.power)); u.draw(u.n.dr); } }),
  C({ id: 'cleave', name: '휩쓸기', icon: '🌪️', rarity: 'common', owner: 'knight', tag: 'blade', cost: 1, cond: { k: 'range', lo: 4, hi: 6 }, role: 'atk',
    desc: '모든 적에게 눈×{m}+{a} 피해.', v: { m: 1, a: 0 },
    upgrades: { A: { label: '+3', v: { a: 3 } }, B: { label: '눈×1.5', v: { m: 1.5 } } },
    run: (u) => { u.dmg(u.v * u.n.m + u.n.a, { aoe: true }); } }),
  C({ id: 'shieldwall', name: '방패벽', icon: '🧱', rarity: 'common', owner: 'knight', tag: 'shield', cost: 2, cond: { k: 'any' }, role: 'def',
    desc: '눈×{m} 방어.', v: { m: 2.5 },
    upgrades: { A: { label: '눈×3', v: { m: 3 } }, B: { label: '비용 1', cost: 1 } },
    run: (u) => u.block(u.v * u.n.m) }),
  C({ id: 'justice', name: '정의의 일격', icon: '⚖️', rarity: 'rare', owner: 'knight', tag: 'blade', cost: 2, cond: { k: 'exact', v: 6 }, role: 'atk', target: 'enemy',
    desc: '눈×2 + 현재 방어도×{m} 피해.', v: { m: 1 },
    upgrades: { A: { label: '방어도×1.5', v: { m: 1.5 } }, B: { label: '조건 5~6', cond: { k: 'range', lo: 5, hi: 6 } } },
    run: (u) => { const cb = u.ctx.run.combat!; u.dmg(u.v * 2 + (cb.block + cb.keepBlock) * u.n.m); } }),
  C({ id: 'bloodoath', name: '피의 맹세', icon: '🩸', rarity: 'rare', owner: 'knight', tag: 'blade', cost: 0, cond: { k: 'instant' }, role: 'util', exhaust: true, noEcho: true,
    desc: '체력 {hp} 잃고 힘 +{s} (전투 끝까지). 소멸.', v: { hp: 4, s: 3 },
    upgrades: { A: { label: '힘 +4', v: { s: 4 } }, B: { label: '체력 2만', v: { hp: 2 } } },
    run: (u) => { const r = u.ctx.run; r.hp = Math.max(1, r.hp - u.n.hp); u.ctx.emit({ t: 'dmgPlayer', amount: u.n.hp, blocked: 0, src: '피의 맹세' }); u.buff('str', Infinity, u.n.s); } }),
  C({ id: 'ironskin', name: '강철 피부', icon: '🪨', rarity: 'rare', owner: 'knight', tag: 'shield', cost: 1, cond: { k: 'instant' }, role: 'def',
    desc: '{t}턴간 매 턴 시작 방어 {b}.', v: { t: 3, b: 5 },
    upgrades: { A: { label: '5턴', v: { t: 5 } }, B: { label: '방어 8', v: { b: 8 } } },
    run: (u) => u.buff('ironskin', u.n.t, u.n.b) }),
  C({ id: 'riposte', name: '응수', icon: '↩️', rarity: 'rare', owner: 'knight', tag: 'shield', cost: 1, cond: { k: 'any' }, role: 'def',
    desc: '눈만큼 방어. 이번 턴 막은 피해×{m}만큼 다음 공격 카드 피해 +.', v: { m: 1, t: 1 },
    upgrades: { A: { label: '×1.5', v: { m: 1.5 } }, B: { label: '2턴 유지', v: { t: 2 }, desc: '눈만큼 방어. {t}턴간 막은 피해×{m}만큼 다음 공격 카드 피해 +.' } },
    run: (u) => { u.block(u.v); u.buff('riposte', u.n.t, Math.round(u.n.m * 100)); } }),
  C({ id: 'crusade', name: '성전', icon: '⚜️', rarity: 'epic', owner: 'knight', tag: 'blade', cost: 1, cond: { k: 'instant' }, role: 'util', noEcho: true,
    desc: '{t}턴간 공격 카드 피해 +{p}%.', v: { t: 3, p: 30 },
    upgrades: { A: { label: '5턴', v: { t: 5 } }, B: { label: '+50%', v: { p: 50 } } },
    run: (u) => u.buff('crusade', u.n.t, u.n.p) }),
  C({ id: 'heavyblade', name: '대검', icon: '🗡️', rarity: 'epic', owner: 'knight', tag: 'blade', cost: 2, cond: { k: 'same', n: 2 }, role: 'atk', target: 'enemy',
    desc: '합×{m} 피해. 힘이 {sm}배로 적용.', v: { m: 3, sm: 3 },
    upgrades: { A: { label: '합×4', v: { m: 4 } }, B: { label: '힘 5배', v: { sm: 5 } } },
    run: (u) => { u.dmg(u.sum * u.n.m, { strMult: u.n.sm }); } }),
  C({ id: 'lastbastion', name: '최후의 보루', icon: '🏯', rarity: 'epic', owner: 'knight', tag: 'shield', cost: 1, cond: { k: 'instant' }, role: 'def',
    desc: '잃은 체력÷{dv}만큼 방어.', v: { dv: 2 },
    upgrades: { A: { label: '잃은 체력만큼', v: { dv: 1 }, desc: '잃은 체력만큼 방어.' }, B: { label: '비용 0, 소멸', cost: 0, exhaust: true, desc: '잃은 체력÷{dv}만큼 방어. 소멸.' } },
    run: (u) => u.block((u.ctx.run.maxHp - u.ctx.run.hp) / u.n.dv, { flat: true }) }),
  C({ id: 'thousandcuts', name: '천 개의 칼날', icon: '🗡️', rarity: 'legendary', owner: 'knight', tag: 'blade', cost: 2, cond: { k: 'instant' }, role: 'atk', exhaust: true, noEcho: true,
    desc: '이번 전투 동안 카드를 쓸 때마다 무작위 적에게 {d}+힘 피해. 소멸.', v: { d: 2 },
    upgrades: { A: { label: '비용 1', cost: 1 }, B: { label: '피해 3', v: { d: 3 } } },
    run: (u) => u.buff('cuts', Infinity, u.n.d) }),
  C({ id: 'aegis', name: '이지스', icon: '✨', rarity: 'legendary', owner: 'knight', tag: 'shield', cost: 2, cond: { k: 'instant' }, role: 'def', exhaust: true, noEcho: true,
    desc: '{t}턴간 받는 피해 0. 소멸.', v: { t: 2 },
    upgrades: { A: { label: '3턴', v: { t: 3 } }, B: { label: '비용 1', cost: 1 } },
    run: (u) => u.buff('aegis', u.n.t, 1) }),

  // ═════════ 🃏 사기꾼 전용 ═════════
  C({ id: 'sleight', name: '손재주', icon: '🤏', rarity: 'common', owner: 'sharp', tag: 'rig', starter: true, cost: 0, cond: { k: 'any' }, retDie: true, role: 'util', noEcho: true, choose: 'value',
    chooseValues: ({ pip, n }) => [-n.a, -1, 1, n.a].filter((d, i, a) => a.indexOf(d) === i).map((d) => pip + d).filter((x) => x >= 1 && x <= 6 && x !== pip),
    desc: '눈 ±{a} (선택)으로 돌려받음.', v: { a: 1, dr: 0 },
    upgrades: { A: { label: '±2', v: { a: 2 }, desc: '눈 ±1 또는 ±2 (선택)로 돌려받음.' }, B: { label: '1장 뽑기', v: { dr: 1 }, desc: '눈 ±{a} (선택)으로 돌려받음. 1장 뽑기.' } },
    run: (u) => { u.ret = [u.choice?.value ?? Math.min(6, u.pips[0] + 1)]; u.draw(u.n.dr); } }),
  C({ id: 'bottomdeal', name: '밑장 빼기', icon: '🂠', rarity: 'common', owner: 'sharp', tag: 'rig', starter: true, cost: 1, cond: { k: 'instant' }, role: 'util', noEcho: true, choose: 'value',
    chooseValues: () => [1, 2, 3, 4, 5, 6],
    desc: '다음 턴 첫 굴림의 주사위 {k}개를 원하는 눈으로.', v: { k: 1 },
    upgrades: { A: { label: '2개', v: { k: 2 } }, B: { label: '비용 0', cost: 0 } },
    run: (u) => { const cb = u.ctx.run.combat!; for (let i = 0; i < u.n.k; i++) cb.next.setFirst.push(u.choice?.value ?? 6); } }),
  C({ id: 'swap', name: '바꿔치기', icon: '🔁', rarity: 'common', owner: 'sharp', tag: 'rig', cost: 0, cond: { k: 'any' }, retDie: true, role: 'util', noEcho: true, choose: 'otherDieOnly',
    desc: '이 주사위와 다른 주사위 하나의 눈을 맞바꿈. 둘 다 손에 남음.', v: { dr: 0, up: 0 },
    upgrades: { A: { label: '1장 뽑기', v: { dr: 1 }, desc: '다른 주사위와 눈을 맞바꿈. 1장 뽑기.' }, B: { label: '둘 다 +1', v: { up: 1 }, desc: '다른 주사위와 눈을 맞바꾸고, 둘 다 +1.' } },
    run: (u) => {
      const cb = u.ctx.run.combat!; const o = cb.hand.find((h) => h.key === u.choice?.key && !h.used);
      const mine = u.pips[0];
      if (o) { const op = o.pip; o.pip = Math.min(6, mine + u.n.up); o.sticker = undefined; u.ret = [Math.min(6, op + u.n.up)]; } else u.ret = [mine];
      u.draw(u.n.dr);
    } }),
  C({ id: 'straightcon', name: '스트레이트 사기', icon: '📏', rarity: 'common', owner: 'sharp', tag: 'hand', cost: 1, cond: { k: 'seq', n: 3 }, role: 'atk', target: 'enemy',
    desc: '합×{m} 피해.', v: { m: 2, dr: 0 },
    upgrades: { A: { label: '합×2.5', v: { m: 2.5 } }, B: { label: '1장 뽑기', v: { dr: 1 }, desc: '합×{m} 피해. 1장 뽑기.' } },
    run: (u) => { u.dmg(u.sum * u.n.m); u.draw(u.n.dr); } }),
  C({ id: 'coldread', name: '콜드 리딩', icon: '👁️', rarity: 'common', owner: 'sharp', tag: 'hand', cost: 0, cond: { k: 'instant' }, role: 'util', target: 'enemy',
    desc: '모든 적의 다다음 행동까지 공개. {d}장 뽑기.', v: { d: 1, fr: 0 },
    upgrades: { A: { label: '2장 뽑기', v: { d: 2 } }, B: { label: '대상 약화 1턴', v: { fr: 1 }, desc: '모든 적의 다다음 행동까지 공개. {d}장 뽑기. 대상 약화 1턴.' } },
    run: (u) => { u.ctx.run.combat!.counters.coldread = 1; u.draw(u.n.d); const t = u.tgt(); if (u.n.fr && t) u.frail(t, 1); } }),
  C({ id: 'markedcard', name: '표식 카드', icon: '🏷️', rarity: 'rare', owner: 'sharp', tag: 'hand', cost: 1, cond: { k: 'instant' }, role: 'util', rollOnly: true, noEcho: true, choose: 'value',
    chooseValues: () => [1, 2, 3, 4, 5, 6],
    desc: '리롤 단계에서: 이번 턴 족보 판정에 원하는 눈 {k}개를 가상으로 더함.', v: { k: 1, dr: 0 },
    upgrades: { A: { label: '1장 뽑기', v: { dr: 1 }, desc: '리롤 단계에서: 족보 판정에 원하는 눈 {k}개를 더함. 1장 뽑기.' }, B: { label: '가상 눈 2개', v: { k: 2 } } },
    run: (u) => { const cb = u.ctx.run.combat!; for (let i = 0; i < u.n.k; i++) cb.virtualPips.push(u.choice?.value ?? 6); u.draw(u.n.dr); } }),
  C({ id: 'deckstack', name: '덱 쌓기', icon: '🗃️', rarity: 'rare', owner: 'sharp', tag: 'rig', cost: 0, cond: { k: 'instant' }, role: 'util', noEcho: true, choose: 'pile',
    desc: '뽑을 카드 위 {k}장을 보고 1장을 손으로{d}.', v: { k: 3, d: 0 },
    upgrades: { A: { label: '5장 보기', v: { k: 5 } }, B: { label: '1장 더 뽑기', v: { d: 1 }, desc: '뽑을 카드 위 {k}장을 보고 1장을 손으로, 1장 더 뽑기.' } },
    run: (u) => {
      const cb = u.ctx.run.combat!;
      const idx = cb.drawPile.findIndex((c) => c.uid === u.choice?.cardUid);
      if (idx >= 0) { const [c] = cb.drawPile.splice(idx, 1); cb.cards.push(c); u.ctx.emit({ t: 'draw', n: 1 }); } else u.draw(1);
      u.draw(u.n.d);
    } }),
  C({ id: 'loadeddice', name: '장전된 주사위', icon: '🎯', rarity: 'rare', owner: 'sharp', tag: 'rig', cost: 1, cond: { k: 'instant' }, role: 'util',
    desc: '{t}턴간 매 턴 첫 굴림 주사위 {k}개가 6.', v: { t: 3, k: 1 },
    upgrades: { A: { label: '5턴', v: { t: 5 } }, B: { label: '2개', v: { k: 2 } } },
    run: (u) => u.buff('loaded', u.n.t, u.n.k) }),
  C({ id: 'fullcon', name: '풀하우스 사기', icon: '🏘️', rarity: 'rare', owner: 'sharp', tag: 'hand', cost: 1, cond: { k: 'full' }, role: 'atk', target: 'enemy',
    desc: '{d} 피해.', v: { d: 45 },
    upgrades: { A: { label: '피해 60', v: { d: 60 } }, B: { label: '같은 눈 3개+아무 2개', cond: { k: 'tripPlus2' } } },
    run: (u) => { u.dmg(u.n.d); } }),
  C({ id: 'sevencard', name: '세븐 카드', icon: '7️⃣', rarity: 'rare', owner: 'sharp', tag: 'hand', cost: 1, cond: { k: 'sumPair', v: 7 }, role: 'atk', target: 'enemy',
    desc: '7×{m} 피해 (족보 배율 적용).', v: { m: 2 },
    upgrades: { A: { label: '×3', v: { m: 3 } }, B: { label: '합 7 또는 14', cond: { k: 'sumSet', sums: [7, 14], min: 2, max: 3 } } },
    run: (u) => { u.dmg(7 * u.n.m); } }),
  C({ id: 'repack', name: '패 섞기', icon: '♻️', rarity: 'epic', owner: 'sharp', tag: 'rig', cost: 1, cond: { k: 'instant' }, role: 'util', noEcho: true,
    desc: '남은 주사위를 전부 다시 굴림 (리롤 소모 없음).', v: { dr: 0, low: 0 },
    upgrades: { A: { label: '1장 뽑기', v: { dr: 1 }, desc: '남은 주사위를 전부 다시 굴림. 1장 뽑기.' }, B: { label: '3 이하만', v: { low: 1 }, desc: '남은 주사위 중 3 이하만 다시 굴림 (리롤 소모 없음).' } },
    run: (u) => { u.ctx.run.combat!.turnCounters.repack = u.n.low ? 2 : 1; u.draw(u.n.dr); } }),
  C({ id: 'fakeyahtzee', name: '가짜 야찌', icon: '🎭', rarity: 'epic', owner: 'sharp', tag: 'hand', cost: 1, cond: { k: 'instant' }, role: 'util', exhaust: true, noEcho: true,
    desc: '이번 턴 족보를 {k}단계 올림. 소멸.', v: { k: 1 },
    upgrades: { A: { label: '2단계', v: { k: 2 } }, B: { label: '소멸 없음 (전투당 1번)', exhaust: false, perCombat: 1, desc: '이번 턴 족보를 {k}단계 올림 (전투당 1번).' } },
    run: (u) => { u.ctx.run.combat!.handBoost += u.n.k; } }),
  C({ id: 'silvertongue', name: '사기꾼의 혀', icon: '👅', rarity: 'epic', owner: 'sharp', tag: 'hand', cost: 0, cond: { k: 'instant' }, role: 'util',
    desc: '{t}턴간 매 턴 족보 칩 +{c}.', v: { t: 3, c: 1 },
    upgrades: { A: { label: '5턴', v: { t: 5 } }, B: { label: '+2', v: { c: 2 } } },
    run: (u) => u.buff('silver', u.n.t, u.n.c) }),
  C({ id: 'jackpotrig', name: '잭팟 조작', icon: '🪄', rarity: 'legendary', owner: 'sharp', tag: 'rig', cost: 1, cond: { k: 'any' }, retDie: true, role: 'util', exhaust: true, noEcho: true,
    desc: '손에 남은 모든 주사위를 이 눈으로. 소멸.', v: {},
    upgrades: { A: { label: '소멸 없음 (전투당 1번)', exhaust: false, perCombat: 1, desc: '손에 남은 모든 주사위를 이 눈으로 (전투당 1번).' }, B: { label: '비용 0', cost: 0 } },
    run: (u) => { const cb = u.ctx.run.combat!; const p = u.pips[0]; for (const h of cb.hand) if (!h.used && !u.dice.includes(h)) { h.pip = p; h.sticker = undefined; } u.ret = [p]; } }),
  C({ id: 'royalflush', name: '로열 플러시', icon: '👑', rarity: 'legendary', owner: 'sharp', tag: 'hand', cost: 2, cond: { k: 'anyN', n: 5 }, role: 'atk', target: 'enemy', needHand: 'large',
    desc: '주사위 5개 + 이번 턴 족보 라지 스트레이트 이상: {d} 피해, 잭팟 가득.', v: { d: 99 },
    upgrades: { A: { label: '피해 150', v: { d: 150 } }, B: { label: '스몰 스트레이트 이상', needHand: 'small', desc: '주사위 5개 + 족보 스몰 스트레이트 이상: {d} 피해, 잭팟 가득.' } },
    run: (u) => { u.dmg(u.n.d); u.jackpot(100); } }),

  // ═════════ 저주 카드 ═════════
  C({ id: 'debtnote', name: '빚 문서', icon: '📄', rarity: 'curse', owner: 'common', cost: 0, cond: { k: 'instant' }, role: 'util', unplayable: true,
    desc: '사용 불가. 턴 끝에 손에 있으면 골드 -2.', v: {}, inHandEnd: (c) => { c.run.gold = Math.max(0, c.run.gold - 2); c.emit({ t: 'gold', amount: -2 }); },
    run: () => {} }),
  C({ id: 'badluck', name: '불운', icon: '🐈‍⬛', rarity: 'curse', owner: 'common', cost: 0, cond: { k: 'instant' }, role: 'util', unplayable: true,
    desc: '사용 불가. 손에 있는 동안 리롤 -1.', v: {}, inHandRerolls: -1, run: () => {} }),
  C({ id: 'withdrawal', name: '금단 증상', icon: '🥴', rarity: 'curse', owner: 'common', cost: 2, cond: { k: 'instant' }, role: 'util', exhaust: true, noEcho: true,
    desc: '턴 끝에 손에 있으면 체력 -2. 족보 칩 2를 내고 쓰면 소멸.', v: {},
    inHandEnd: (c) => { c.run.hp = Math.max(1, c.run.hp - 2); c.emit({ t: 'dmgPlayer', amount: 2, blocked: 0, src: '금단 증상' }); },
    run: () => {} }),
];

function score(c: CardInst): number {
  const d = CARD_BY_ID[c.id];
  if (!d) return 0;
  return d.rarity === 'curse' ? 100 : d.cost;
}

export const CARD_BY_ID = Object.fromEntries(CARDS.map((c) => [c.id, c])) as Record<string, CardDef>;

/** 강화를 반영한 카드 정의 (UI와 규칙은 항상 이 결과만 쓴다) */
export interface ResolvedCard extends CardDef {
  n: Record<string, number>;
}

export function resolveCard(inst: { id: string; up: null | 'A' | 'B' }): ResolvedCard {
  const def = CARD_BY_ID[inst.id];
  const up = inst.up && def.upgrades ? def.upgrades[inst.up] : undefined;
  const n = { ...def.v, ...(up?.v ?? {}) };
  if (!up) return { ...def, n };
  return {
    ...def, n,
    cost: up.cost ?? def.cost,
    cond: up.cond ?? def.cond,
    exhaust: up.exhaust ?? def.exhaust,
    desc: up.desc ?? def.desc,
    needHand: up.needHand ?? def.needHand,
    perCombat: up.perCombat ?? def.perCombat,
    target: 'target' in up ? up.target : def.target,
  };
}

export function cardName(inst: { id: string; up: null | 'A' | 'B' }): string {
  const d = CARD_BY_ID[inst.id];
  return d ? `${d.name}${inst.up ? `+${inst.up}` : ''}` : inst.id;
}

/** 설명 문자열. oddsBonus는 도박 카드 확률 보정(%p) */
export function cardDesc(rc: ResolvedCard, oddsBonus = 0): string {
  return rc.desc.replace(/\{(\w+)\}/g, (_, k) => {
    let x = rc.n[k];
    if (x === undefined) return `{${k}}`;
    if (k === rc.odds) x = Math.max(0, Math.min(100, x + oddsBonus));
    return String(Math.round(x * 10) / 10);
  });
}

export const isPoolCard = (d: CardDef) => d.rarity !== 'basic' && d.rarity !== 'curse';
