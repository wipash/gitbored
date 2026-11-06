import { useSyncExternalStore } from 'react';

let guard: (() => Promise<boolean>) | undefined;
let navigating = false;
let committedPath: string | undefined;
let committedUrl: string | undefined;
const listeners = new Set<() => void>();
function publish() {
  committedPath = window.location.pathname;
  committedUrl = window.location.pathname + window.location.search;
  for (const listener of listeners) listener();
}
export function setNavigationGuard(value: () => Promise<boolean>): () => void {
  guard = value;
  return () => { if (guard === value) guard = undefined; };
}
export async function navigate(path: string, replace = false): Promise<void> {
  if (navigating) return;
  navigating = true;
  try {
    if (guard && !await guard()) return;
    window.history[replace ? 'replaceState' : 'pushState'](null, '', path);
    publish();
  } finally { navigating = false; }
}
async function pop() {
  if (guard && !await guard()) {
    // A failed save keeps the current editor and restores its address. Its recovery
    // draft and revision remain authoritative; Back never silently discards it.
    window.history.pushState(null, '', committedUrl ?? '/');
    return;
  }
  publish();
}
function subscribe(listener: () => void) {
  if (!listeners.size) {
    committedPath = window.location.pathname;
    committedUrl = window.location.pathname + window.location.search;
    window.addEventListener('popstate', onPop);
  }
  listeners.add(listener);
  return () => { listeners.delete(listener); if (!listeners.size) window.removeEventListener('popstate', onPop); };
}
function onPop() { void pop(); }
export function usePathname(): string {
  return useSyncExternalStore(subscribe, () => committedPath ?? window.location.pathname);
}
