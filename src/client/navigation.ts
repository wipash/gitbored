import { useSyncExternalStore } from 'react';

let guard: (() => Promise<boolean>) | undefined;
let transition = 0;
let pendingTraversal = false;
let committedPath: string | undefined;
let committedUrl: string | undefined;
const listeners = new Set<() => void>();
function publish() {
  pendingTraversal = false;
  committedPath = window.location.pathname;
  committedUrl = window.location.pathname + window.location.search;
  for (const listener of listeners) listener();
}
function restoreCommittedLocation() {
  if (pendingTraversal && committedUrl && window.location.pathname + window.location.search !== committedUrl) {
    window.history.pushState(null, '', committedUrl);
  }
  pendingTraversal = false;
}
export function setNavigationGuard(value: () => Promise<boolean>): () => void {
  restoreCommittedLocation();
  transition += 1;
  guard = value;
  return () => {
    if (guard === value) {
      // Cancel the browser's provisional address together with its old board.
      // A completed transition already cleared pendingTraversal in publish().
      restoreCommittedLocation();
      guard = undefined; transition += 1;
    }
  };
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
    restoreCommittedLocation();
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
function onPop() { pendingTraversal = true; void changeLocation(); }
export function usePathname(): string {
  return useSyncExternalStore(subscribe, () => committedPath ?? window.location.pathname);
}
