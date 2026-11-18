// 시작 테이블: 판마다 출발 조건이 다른 변형 (발라트로의 덱처럼). 업적으로 해금.
import type { RunState } from '../core/state';
import type { Mods } from '../rules/ctx';

export interface TableDef {
  id: string;
  name: string;
  icon: string;
  desc: string;
  unlock: string; // 해금 업적 id ('' = 기본)
  mods?: Partial<Mods>;
  /** 판 시작 시 한 번 */
  setup?: (run: RunState, newDie: (uid: number, material?: string) => RunState['dice'][number]) => void;
}

export const TABLES: TableDef[] = [
  { id: 'classic', name: '클래식 테이블', icon: '🟩', desc: '특별한 규칙이 없는 기본 테이블입니다.', unlock: '' },
  {
    id: 'golden', name: '황금 테이블', icon: '🟨', desc: '골드 50을 들고 시작합니다. 대신 적의 체력이 15% 늘어납니다.', unlock: 'first_win',
    mods: { enemyHpPct: 0.15 }, setup: (r) => { r.gold += 50; },
  },
  {
    id: 'six', name: '여섯 주사위 테이블', icon: '🎲', desc: '주사위 6개로 시작합니다. 대신 한 번에 1개만 잠글 수 있습니다.', unlock: 'yahtzee',
    mods: { lockLimit: -1 }, setup: (r, nd) => { r.dice.push(nd(r.nextUid++)); },
  },
  {
    id: 'glass', name: '유리 테이블', icon: '🧊', desc: '모든 주사위가 유리입니다. 효과는 2배지만 1이 나오면 깨집니다. 최대 체력 +10.', unlock: 'hit50',
    setup: (r) => { r.dice.forEach((d) => { d.material = 'glass'; }); r.maxHp += 10; r.hp += 10; },
  },
  {
    id: 'chips', name: '칩 테이블', icon: '🔶', desc: '족보 칩을 매 턴 1개 더 받습니다. 대신 매 턴 카드를 4장만 뽑습니다.', unlock: 'chips9',
    mods: { handChips: 1, drawPerTurn: -1 },
  },
  {
    id: 'highroller', name: '하이롤러 테이블', icon: '🎰', desc: '카지노 칩 6개와 도박 배당 +30%로 시작합니다. 대신 최대 체력이 절반입니다.', unlock: 'gamble30',
    mods: { payoutEv: 0.3 }, setup: (r) => { r.chips += 6; r.maxHp = Math.ceil(r.maxHp / 2); r.hp = r.maxHp; },
  },
];

export const TABLE_BY_ID = Object.fromEntries(TABLES.map((t) => [t.id, t])) as Record<string, TableDef>;
