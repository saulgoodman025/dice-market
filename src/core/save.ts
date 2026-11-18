import type { RunState } from './state';

const RUN_KEY = 'dicemarket_run';
const META_KEY = 'dicemarket_meta';
const SET_KEY = 'dicemarket_settings';

export interface Meta {
  points: number;
  spent: number;
  unlocked: string[]; // "kind:id"
  flags: Record<string, number>; // act1boss, act2, clear
  maxStake: number;
  codex: { relics: string[]; faces: string[]; enemies: string[]; hands: string[]; combos: string[]; cards: string[] };
  stats: { runs: number; wins: number; yahtzees: number; megaJackpots: number; bestNodes: number };
  tutorialDone: boolean;
  achievements: string[];
  mastery: Record<string, number>; // 캐릭터별 숙련도 경험치
  owned: string[]; // 'table:id' | 'skin:id' | 'felt:id'
  daily: Record<string, number>; // 날짜별 최고 점수
  bestEndless: number;
}

export interface Settings {
  sound: boolean;
  shake: boolean;
  vibrate: boolean;
  speed: 1 | 2;
  skin: string;
  felt: string;
}

export const defaultMeta = (): Meta => ({
  points: 0, spent: 0, unlocked: [], flags: {}, maxStake: 0,
  codex: { relics: [], faces: [], enemies: [], hands: [], combos: [], cards: [] },
  stats: { runs: 0, wins: 0, yahtzees: 0, megaJackpots: 0, bestNodes: 0 },
  tutorialDone: false,
  achievements: [], mastery: {}, owned: [], daily: {}, bestEndless: 0,
});

export const defaultSettings = (): Settings => ({ sound: true, shake: true, vibrate: true, speed: 1, skin: 'ivory', felt: 'green' });

function read<T>(k: string): T | null {
  try {
    const s = localStorage.getItem(k);
    return s ? (JSON.parse(s) as T) : null;
  } catch {
    return null;
  }
}
function write(k: string, v: unknown) {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* 저장 실패는 무시 */
  }
}

export const saveRun = (r: RunState) => write(RUN_KEY, r);
export const loadRun = (version: number): RunState | null => {
  const r = read<RunState>(RUN_KEY);
  return r && r.version === version ? r : null;
};
export const hasStaleRun = (version: number): boolean => {
  const r = read<RunState>(RUN_KEY);
  return !!r && r.version !== version;
};
export const clearRun = () => { try { localStorage.removeItem(RUN_KEY); } catch { /* */ } };
export const loadMeta = (): Meta => {
  const m = { ...defaultMeta(), ...(read<Meta>(META_KEY) ?? {}) };
  m.codex = { ...defaultMeta().codex, ...m.codex };
  // 스킬 → 카드 업데이트: 스킬 해금은 같은 id의 카드 해금으로 옮긴다
  m.unlocked = m.unlocked.map((u) => u.replace(/^skill:/, 'card:'));
  return m;
};
export const saveMeta = (m: Meta) => write(META_KEY, m);
export const loadSettings = (): Settings => ({ ...defaultSettings(), ...(read<Settings>(SET_KEY) ?? {}) });
export const saveSettings = (s: Settings) => write(SET_KEY, s);
