import type { GameEvent } from './state';

type Listener = (e: GameEvent) => void;

/** 규칙 → UI 단방향 이벤트 버스 */
export class EventBus {
  private listeners: Listener[] = [];
  on(fn: Listener): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }
  emit = (e: GameEvent): void => {
    for (const l of this.listeners) l(e);
  };
}
