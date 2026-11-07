import { useSyncExternalStore } from 'react';

let guard: (() => Promise<boolean>) | undefined;
let transition = 0;
let committedPath: string | undefined;
let committedUrl: string | undefined;
const listeners = new Set<() => void>();
function publish() {
  committedPath = window.location.pathname;
  committedUrl = window.location.pathname + window.location.search;
  for (const listener of listeners) listener();
}
export function setNavigationGuard(value: () => Promise<boolean>): () => void {
  transition += 1;
  guard = value;
  return () => { if (guard === value) { guard = undefined; transition += 1; } };
}
async function changeLocation(destination?: { path: string; replace: boolean }): Promise<void> {
  const attempt = ++transition;
  const owner = guard;
  const allowed = owner ? await owner() : true;
  // A later click, browser traversal or board lifetime owns the destination.
  // A slow save from the previous transition must never publish over it.
  if (attempt !== transition || owner !== guard) return;
  if (!allowed) {
    // Browser traversal changes the address before its save guard completes.
    // Restore the mounted editor's address if the latest transition is blocked.
    if (committedUrl && window.location.pathname + window.location.search !== committedUrl) {
      window.history.pushState(null, '', committedUrl);
    }
    return;
  }
  if (destination) window.history[destination.replace ? 'replaceState' : 'pushState'](null, '', destination.path);
  publish();
}
export async function navigate(path: string, replace = false): Promise<void> {
  await changeLocation({ path, replace });
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
function onPop() { void changeLocation(); }
export function usePathname(): string {
  return useSyncExternalStore(subscribe, () => committedPath ?? window.location.pathname);
}
