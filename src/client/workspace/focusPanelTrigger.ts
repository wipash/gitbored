/** Mobile actions collapse after opening a panel; return to the visible menu trigger. */
export function focusPanelTrigger(trigger: HTMLButtonElement | null): void {
  if (!trigger) return;
  const target = trigger.getClientRects().length ? trigger : trigger.closest('.desktop-app')?.querySelector<HTMLButtonElement>('.mobile-workspace-menu');
  target?.focus({ preventScroll: true });
}
