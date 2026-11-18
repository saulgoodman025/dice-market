import type { Stream } from './rng';

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';
export const RARITIES: Rarity[] = ['common', 'rare', 'epic', 'legendary'];
export const RARITY_LABEL: Record<Rarity, string> = { common: 'C', rare: 'R', epic: 'E', legendary: 'L' };

export type HandId =
  | 'none' | 'pair' | 'twopair' | 'flush' | 'triple'
  | 'small' | 'full' | 'large' | 'four' | 'yahtzee';

export interface Face {
  pip: number;
  sticker?: string;
}

export interface Die {
  uid: number;
  material: string;
  faces: Face[]; // 6면
}

export interface SkillInst {
  id: string;
  up: number; // 강화 누적 비율 (0.3 = +30%)
}

/** 전투 중 손에 있는 주사위 */
export interface HandDie {
  key: number;
  dieIdx: number; // run.dice 인덱스, 임시 주사위는 -1
  temp: boolean;
  face: number; // 굴린 면 인덱스
  pip: number; // 현재 눈 (조작 반영)
  sticker?: string;
  material: string;
  locked: boolean;
  used: boolean;
  rolledFx: boolean; // 이번 턴 "나오면" 효과 발동 여부
  golden: boolean; // 잭팟 턴
  gone: boolean; // 도둑맞음/깨짐 (족보 판정 제외)
}

export type IntentKind =
  | 'attack' | 'attackRange' | 'multi' | 'block' | 'buff' | 'debuff'
  | 'steal' | 'stealDie' | 'tax' | 'flip' | 'interest' | 'copy' | 'charge'
  | 'rig' | 'seize' | 'bet' | 'random' | 'houseCopy' | 'queen'
  | 'enrage' | 'curseWeak' | 'curseVuln';

export interface IntentSpec {
  k: IntentKind;
  n?: number;
  n2?: number;
  hits?: number;
}

export interface Intent extends IntentSpec {
  label: string; // 표시용 텍스트
  icon: string;
}

export interface Enemy {
  uid: number;
  id: string;
  name: string;
  emoji: string;
  hp: number;
  maxHp: number;
  block: number;
  patternIdx: number;
  intent: Intent;
  poison: number;
  weak: number; // 다음 공격 감소
  nextMult: number; // 다음 공격 배율 (버프)
  stacks: number; // 이자 등 누적
  charge: number; // 충전 턴
  phase: number;
  splitDone: boolean;
  enraged: boolean;
  weakPip: number; // 공개된 약점 눈 (이 눈으로 공격하면 피해 1.5배)
  str: number; // 💪 힘: 공격 피해 +N (전투 동안)
  vuln: number; // 💔 취약: 받는 피해 +50% (남은 턴)
  frail: number; // 🥀 약화: 주는 피해 -25% (남은 턴)
}

export interface HandResult {
  id: HandId;
  name: string;
  mult: number;
  heat: number;
  jackpot: number;
}

export interface CombatState {
  kind: 'normal' | 'elite' | 'boss';
  enemies: Enemy[];
  hand: HandDie[];
  phase: 'roll' | 'place' | 'over';
  turn: number;
  rerollsLeft: number;
  block: number;
  keepBlock: number; // 다음 턴까지 유지되는 방어
  thorns: number;
  piggy: number;
  piggyMult: number;
  handResult: HandResult | null;
  usedSlots: boolean[];
  target: number; // enemy uid
  diceUsedThisTurn: number;
  lastSkill: { slot: number } | null;
  doubledown: number; // 대기 중인 더블다운 눈 (0=없음)
  counters: Record<string, number>; // 전투 단위 카운터
  turnCounters: Record<string, number>; // 턴 단위 카운터
  handChips: number; // 🔶 족보 칩 (카드 비용)
  pStr: number; // 내 💪 힘
  pVuln: number; // 내 💔 취약
  pWeak: number; // 내 🥀 약화
  next: { six: number; one: number; rerollPenalty: number; flip: boolean; stealDie: boolean; preview: number[] };
  jackpotTurn: boolean;
  houseRule: string | null;
  queenParity: 'odd' | 'even' | null;
  lastSkillDamage: number;
  dmgTaken: number;
  result: 'win' | 'lose' | 'fled' | null;
  nextKey: number;
  rewardMult: number;
  brokenDice: number[]; // dieIdx (유리 깨짐/폭탄)
  log: string[];
}

export type Screen =
  | 'title' | 'charselect' | 'map' | 'combat' | 'reward' | 'shop' | 'casino'
  | 'event' | 'rest' | 'edit' | 'gameover' | 'victory';

export type NodeType = 'combat' | 'elite' | 'shop' | 'casino' | 'event' | 'rest' | 'boss';

export interface MapNode {
  type: NodeType;
  x: number; // 가로 위치 0~1
  next: number[]; // 다음 층에서 갈 수 있는 노드 인덱스
}

export type RewardOption =
  | { kind: 'skill'; id: string }
  | { kind: 'face'; id: string }
  | { kind: 'relic'; id: string }
  | { kind: 'consumable'; id: string }
  | { kind: 'material'; id: string };

export interface RewardState {
  base: number;
  piggy: number;
  heatMult: number;
  gold: number; // 정산 금액 (더블 오어 낫싱 대상)
  donStreak: number;
  donDone: boolean;
  donLastRoll: number | null;
  options: RewardOption[];
  picked: boolean;
  chips: number;
  heal: number;
  insuranceUsed: boolean;
}

export interface ShopItem {
  opt: RewardOption;
  price: number;
  basePrice: number;
  haggles: number;
  lastHaggle: number | null;
  sold: boolean;
}

export interface ShopState {
  items: ShopItem[];
  rerollCost: number;
  rerollFree: boolean;
  rerolls: number;
  bought: boolean;
  lastRerollDie: number | null;
  discountNext: boolean; // 할인 스티커
}

export interface EventState {
  id: string;
  done: boolean;
  resultText: string | null;
  data: Record<string, number | string>;
}

export interface CasinoState {
  entered: boolean;
}

/** 대기 중인 선택(면 스티커 붙이기, 재질, 스킬 교체 등) */
export type PendingApply =
  | { kind: 'face'; id: string; then: Screen }
  | { kind: 'material'; id: string; then: Screen }
  | { kind: 'skillReplace'; id: string; then: Screen }
  | { kind: 'upgrade'; amount: number; then: Screen }
  | { kind: 'cleanse'; then: Screen }
  | { kind: 'cloneDie'; then: Screen };

export interface RunStats {
  yahtzees: number;
  jackpotTurns: number;
  gambles: number;
  megaJackpots: number;
  kills: number;
  deathBy: string | null;
  combatsWon: number;
  goldEarned: number;
}

export interface DdaState {
  flow: number;
  recentScores: number[]; // 최근 전투 점수
  shopsSinceEpic: number;
  forceEpic: boolean;
  combatsTurns: number[];
}

export interface RunState {
  version: number;
  seed: number;
  rng: Record<Stream, number>;
  charId: string;
  stake: number;
  table: string; // 시작 테이블
  dailyKey?: string; // 일일 도전 날짜
  dailyRule?: string; // 일일 도전 규칙 id
  hp: number;
  maxHp: number;
  gold: number;
  chips: number;
  dice: Die[];
  skills: SkillInst[];
  maxSlots: number;
  relics: string[];
  consumables: string[];
  act: number; // 1..3
  floor: number; // 0..4 (4 = 보스)
  map: MapNode[][]; // 현재 막의 전체 지도 (층별 노드)
  path: number[]; // 이번 막에서 고른 노드 인덱스 (층별)
  nodesReached: number;
  bossesKilled: number;
  heat: number;
  jackpot: number;
  screen: Screen;
  combat: CombatState | null;
  reward: RewardState | null;
  shop: ShopState | null;
  event: EventState | null;
  pending: PendingApply | null;
  offer: { title: string; options: RewardOption[]; then: Screen } | null;
  flags: Record<string, number>;
  stats: RunStats;
  dda: DdaState;
  nextUid: number;
  pendingFreeSpins: number;
  pendingEliteFromSlot: boolean;
  log: string[];
}

export type GameEvent =
  | { t: 'roll'; keys: number[] }
  | { t: 'dmgEnemy'; uid: number; amount: number; crit?: boolean; blocked?: number; src?: string; weakHit?: boolean }
  | { t: 'dmgPlayer'; amount: number; blocked: number; src?: string }
  | { t: 'block'; amount: number }
  | { t: 'heal'; amount: number }
  | { t: 'gold'; amount: number }
  | { t: 'chips'; amount: number }
  | { t: 'hand'; hand: HandResult }
  | { t: 'yahtzee' }
  | { t: 'heat'; heat: number }
  | { t: 'jackpotFull' }
  | { t: 'enemyDie'; uid: number }
  | { t: 'toast'; text: string; tone?: 'good' | 'bad' | 'info' | 'gold' }
  | { t: 'sfx'; name: string }
  | { t: 'megaJackpot' }
  | { t: 'enemyAct'; uid: number }
  | { t: 'chanceRoll'; kind: 'die' | 'roulette'; result: number; win: boolean; label: string };
