// 업적: 판이 끝날 때 기록을 보고 달성 여부를 판단한다. 보상으로 새 유물·스킬·면, 시작 테이블, 주사위 스킨을 해금.
import type { RunState } from '../core/state';

export interface AchCtx {
  run: RunState;
  won: boolean;
  totals: { runs: number; wins: number; dailies: number; winsByChar: Record<string, number> };
}

export interface AchievementDef {
  id: string;
  name: string;
  icon: string;
  desc: string;
  check: (c: AchCtx) => boolean;
  /** 'skill:id' | 'relic:id' | 'face:id' (상점 풀 해금) | 'table:id' | 'skin:id' | 'felt:id' */
  reward: string;
}

const f = (c: AchCtx, k: string) => c.run.flags[k] ?? 0;

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first_win', name: '하우스를 이겼다', icon: '🏆', desc: '처음으로 3막 보스를 쓰러뜨리세요.', check: (c) => c.won, reward: 'table:golden' },
  { id: 'act1', name: '로비 정복', icon: '🎩', desc: '1막 보스 피트 보스를 쓰러뜨리세요.', check: (c) => c.run.bossesKilled >= 1, reward: 'relic:tripletiara' },
  { id: 'yahtzee', name: '야찌!', icon: '🎲', desc: '야찌를 띄우세요.', check: (c) => c.run.stats.yahtzees > 0, reward: 'table:six' },
  { id: 'yahtzee_boss', name: '야찌로 끝내기', icon: '🔨', desc: '야찌가 나온 턴에 보스를 쓰러뜨리세요.', check: (c) => f(c, 'ach_yahtzee_boss') > 0, reward: 'card:yahtzeehammer' },
  { id: 'hit50', name: '묵직한 한 방', icon: '💥', desc: '한 번에 50 이상의 피해를 주세요.', check: (c) => f(c, 'ach_max_hit') >= 50, reward: 'table:glass' },
  { id: 'hit120', name: '초강타 장인', icon: '☄️', desc: '한 번에 120 이상의 피해를 주세요.', check: (c) => f(c, 'ach_max_hit') >= 120, reward: 'relic:berserker' },
  { id: 'rich', name: '큰손', icon: '💰', desc: '골드를 200 이상 모으세요.', check: (c) => f(c, 'ach_max_gold') >= 200, reward: 'relic:goose' },
  { id: 'mega', name: '메가 잭팟', icon: '7️⃣', desc: '슬롯머신에서 7-7-7을 띄우세요.', check: (c) => c.run.stats.megaJackpots > 0, reward: 'relic:sevenpin' },
  { id: 'gamble30', name: '타고난 도박꾼', icon: '🎰', desc: '한 판에 도박을 30번 하세요.', check: (c) => c.run.stats.gambles >= 30, reward: 'table:highroller' },
  { id: 'poison_kill', name: '독한 승부', icon: '🧪', desc: '독으로 적을 쓰러뜨리세요.', check: (c) => f(c, 'ach_poison_kill') > 0, reward: 'card:echo' },
  { id: 'weak20', name: '약점 사냥꾼', icon: '🎯', desc: '한 판에 약점 공격을 20번 하세요.', check: (c) => f(c, 'ach_weak_hits') >= 20, reward: 'relic:tumble' },
  { id: 'chips9', name: '칩 부자', icon: '🔶', desc: '족보 칩을 한 번에 9개 이상 가지세요.', check: (c) => f(c, 'ach_max_chips') >= 9, reward: 'table:chips' },
  { id: 'close', name: '아슬아슬', icon: '😰', desc: '체력 10% 이하로 보스를 쓰러뜨리세요.', check: (c) => f(c, 'ach_close_boss') > 0, reward: 'relic:lastchance' },
  { id: 'perfect', name: '무결점', icon: '🛡️', desc: '체력을 잃지 않고 엘리트를 쓰러뜨리세요.', check: (c) => f(c, 'ach_perfect_elite') > 0, reward: 'relic:immortal' },
  { id: 'win_merchant', name: '장사의 신', icon: '💼', desc: '상인으로 클리어하세요.', check: (c) => c.won && c.run.charId === 'merchant', reward: 'relic:compound' },
  { id: 'win_knight', name: '철벽', icon: '🛡', desc: '기사로 클리어하세요.', check: (c) => c.won && c.run.charId === 'knight', reward: 'card:midas' },
  { id: 'win_sharp', name: '손은 눈보다 빠르다', icon: '🃏', desc: '사기꾼으로 클리어하세요.', check: (c) => c.won && c.run.charId === 'sharp', reward: 'relic:godhand' },
  { id: 'stake3', name: '하이 스테이크', icon: '⚜', desc: '난이도 스테이지 3 이상으로 클리어하세요.', check: (c) => c.won && c.run.stake >= 3, reward: 'skin:sapphire' },
  { id: 'daily', name: '오늘의 손님', icon: '📅', desc: '일일 도전을 한 번 끝내세요.', check: (c) => f(c, 'daily') > 0, reward: 'felt:purple' },
  { id: 'endless5', name: '끝없는 밤', icon: '♾️', desc: '엔드리스에서 5막에 도달하세요.', check: (c) => c.run.act >= 5, reward: 'skin:gold' },
  { id: 'runs10', name: '단골손님', icon: '🍸', desc: '10판을 플레이하세요.', check: (c) => c.totals.runs >= 10, reward: 'skin:emerald' },
];

export const ACH_BY_ID = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a])) as Record<string, AchievementDef>;
