// 지속 버프/디버프 정의. 카드의 [N턴] 효과는 모두 여기 버프로 표현된다.
// 규칙 코드는 버프 id를 직접 검사하지 않고, 버프가 내는 수치(fx)와 훅만 읽는다.
import type { Buff } from '../core/state';
import type { Tag } from './tags';

/** 버프가 규칙에 주는 수치. 같은 주인의 버프끼리 더해진다 */
export interface BuffFx {
  str: number; // 💪 공격 피해 +N
  atkPct: number; // 공격 카드 피해 +%
  gambleOdds: number; // 도박 카드 성공 확률 +%p
  counter: number; // 공격받을 때마다 공격자에게 N 피해
  reflect: number; // 반사 (가시)
  poisonMult: number; // (적) 받는 독 피해 배율 가산 (1 → ×2)
  immune: number; // 받는 피해 0
  halveHits: number; // 다음 N번 공격 피해 절반
  hedgePct: number; // 받는 피해의 %만큼 저금통
  keepBlock: number; // 방어도가 턴이 바뀌어도 사라지지 않음
  freeTags: Tag[]; // 이 태그 카드 비용 0
  gambleWinDraw: number; // 도박 성공 시 N장 뽑기
  gambleWinChips: number; // 도박 성공 시 족보 칩 +N
  cardPlayDmg: number; // 카드를 쓸 때마다 무작위 적에게 N(+힘) 피해
  riposte: number; // 이번 턴 막은 피해만큼 다음 공격 카드 피해 + (배율)
}

export const ZERO_FX = (): BuffFx => ({
  str: 0, atkPct: 0, gambleOdds: 0, counter: 0, reflect: 0, poisonMult: 0, immune: 0, halveHits: 0, hedgePct: 0,
  keepBlock: 0, freeTags: [], gambleWinDraw: 0, gambleWinChips: 0, cardPlayDmg: 0, riposte: 0,
});

export interface BuffDef {
  id: string;
  name: string;
  icon: string;
  /** 표시용 설명 */
  desc: (b: Buff) => string;
  /** 'start': 내 턴 시작에 효과가 나고 그때 1턴 줄어듦 / 'end': 내 턴이 끝날 때 1턴 줄어듦 */
  tick: 'start' | 'end';
  /** 지속 중 규칙 수치 */
  fx?: (b: Buff) => Partial<BuffFx>;
  /** 내 턴 시작 효과 (주사위를 굴리기 전) */
  onTurnStart?: string; // 효과 키 (rules/buffs.ts의 TURN_START 표에서 실행)
  /** 같은 버프가 다시 걸릴 때 값 처리 (기본: 합산) */
  stack?: 'sum' | 'max';
}

const T = (b: Buff) => (b.turns === Infinity ? '전투 끝까지' : `${b.turns}턴`);

export const BUFFS: BuffDef[] = [
  { id: 'str', name: '힘', icon: '💪', tick: 'end', desc: (b) => `공격 피해 +${b.value} (${T(b)})`, fx: (b) => ({ str: b.value }) },
  { id: 'crusade', name: '성전', icon: '⚜️', tick: 'end', desc: (b) => `공격 카드 피해 +${b.value}% (${T(b)})`, fx: (b) => ({ atkPct: b.value }) },
  { id: 'luck', name: '행운', icon: '🍀', tick: 'end', desc: (b) => `도박 카드 성공 확률 +${b.value}%p (${T(b)})`, fx: (b) => ({ gambleOdds: b.value }) },
  { id: 'counter', name: '반격', icon: '🤺', tick: 'end', desc: (b) => `공격받을 때마다 ${b.value} 반격 (${T(b)})`, fx: (b) => ({ counter: b.value }) },
  { id: 'thorns', name: '가시', icon: '🌵', tick: 'end', desc: (b) => `공격받으면 ${b.value} 반사 (${T(b)})`, fx: (b) => ({ reflect: b.value }) },
  { id: 'deathmark', name: '죽음의 표식', icon: '💀', tick: 'end', stack: 'max', desc: (b) => `받는 독 피해 ×${1 + b.value} (${T(b)})`, fx: (b) => ({ poisonMult: b.value }) },
  { id: 'usury', name: '고리대', icon: '📜', tick: 'start', onTurnStart: 'enemyPoison', desc: (b) => `매 턴 독 +${b.value} (${T(b)})` },
  { id: 'aegis', name: '이지스', icon: '✨', tick: 'end', stack: 'max', desc: (b) => `받는 피해 0 (${T(b)})`, fx: () => ({ immune: 1 }) },
  { id: 'parry', name: '받아넘기기', icon: '🗡️', tick: 'end', desc: (b) => `다음 공격 ${b.value}번 피해 절반`, fx: (b) => ({ halveHits: b.value }) },
  { id: 'hedge', name: '헤지 펀드', icon: '📊', tick: 'end', stack: 'max', desc: (b) => `받는 피해의 ${b.value}%만큼 저금통 (${T(b)})`, fx: (b) => ({ hedgePct: b.value }) },
  { id: 'bulwark', name: '철벽', icon: '🧱', tick: 'end', stack: 'max', desc: (b) => `방어도가 사라지지 않음 (${T(b)})`, fx: () => ({ keepBlock: 1 }) },
  { id: 'monopoly', name: '독점', icon: '🏛️', tick: 'end', stack: 'max', desc: (b) => `💰 카드 비용 0${b.value > 1 ? ', ☠ 카드도' : ''} (${T(b)})`, fx: (b) => ({ freeTags: b.value > 1 ? ['eco', 'curse'] : ['eco'] }) },
  { id: 'hotstreak', name: '끝내주는 날', icon: '🔥', tick: 'end', desc: (b) => `도박 성공마다 1장 뽑기${b.value > 1 ? ', 족보 칩 +1' : ''} (${T(b)})`, fx: (b) => ({ gambleWinDraw: 1, gambleWinChips: b.value > 1 ? 1 : 0 }), stack: 'max' },
  { id: 'cuts', name: '천 개의 칼날', icon: '🗡️', tick: 'end', desc: (b) => `카드를 쓸 때마다 무작위 적에게 ${b.value}+힘 피해 (${T(b)})`, fx: (b) => ({ cardPlayDmg: b.value }), stack: 'max' },
  { id: 'riposte', name: '응수', icon: '↩️', tick: 'end', stack: 'max', desc: (b) => `막은 피해 ×${b.value / 100}만큼 다음 공격 카드 피해 + (${T(b)})`, fx: (b) => ({ riposte: b.value }) },
  { id: 'ironskin', name: '강철 피부', icon: '🪨', tick: 'start', onTurnStart: 'block', desc: (b) => `매 턴 시작 방어 ${b.value} (${T(b)})` },
  { id: 'armorup', name: '갑옷 정비', icon: '🔩', tick: 'start', onTurnStart: 'block', desc: (b) => `턴 시작 시 방어 ${b.value} (${T(b)})` },
  { id: 'bond', name: '채권', icon: '📃', tick: 'start', onTurnStart: 'piggy', desc: (b) => `매 턴 시작 저금통 +${b.value} (${T(b)})` },
  { id: 'compound', name: '복리', icon: '📈', tick: 'start', onTurnStart: 'piggyPct', desc: (b) => `매 턴 저금통 +${b.value}% (${T(b)})` },
  { id: 'loaded', name: '장전된 주사위', icon: '🎯', tick: 'start', onTurnStart: 'six', desc: (b) => `매 턴 첫 굴림 주사위 ${b.value}개가 6 (${T(b)})` },
  { id: 'silver', name: '사기꾼의 혀', icon: '👅', tick: 'start', onTurnStart: 'chips', desc: (b) => `매 턴 족보 칩 +${b.value} (${T(b)})` },
];

export const BUFF_BY_ID = Object.fromEntries(BUFFS.map((b) => [b.id, b])) as Record<string, BuffDef>;
