import { useSyncExternalStore } from "react";

interface Subscribable<T> {
  get(): T;
  subscribe(listener: () => void): () => void;
}

/** Подписывает компонент на любой Store из repo.ts (реактивность без библиотек состояния). */
export function useStore<T>(store: Subscribable<T>): T {
  return useSyncExternalStore(
    (listener) => store.subscribe(listener),
    () => store.get(),
  );
}
