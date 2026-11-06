import type { NativeDocument } from '../../shared/nativeDocument';
import type { BoardSave } from '../../shared/boards';
import type { IncomingState } from '../../shared/incoming';
import type { RecoveryStore } from './recovery';

export interface SaveState { status: 'saved' | 'saving' | 'unsaved' | 'conflict'; message: string; retryable?: true; recoveryUnavailable?: true }
export class BoardSaveError extends Error {
  constructor(public readonly kind: 'conflict' | 'failed' | 'blocked') { super(kind); }
}
/** A single flight owns its captured generation. Acknowledging it cannot acknowledge later edits. */
export class SaveCoordinator {
  private generation = 0;
  private acknowledged = 0;
  private pending: { document: NativeDocument; incoming: IncomingState };
  private flight = false;
  private stopped = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private listeners = new Set<() => void>();
  private state: SaveState = { status: 'saved', message: 'Saved' };
  private captureLatest: (() => void) | undefined;
  setCheckpoint(capture: () => void): () => void {
    this.captureLatest = capture;
    return () => { if (this.captureLatest === capture) this.captureLatest = undefined; };
  }
  checkpoint = (): void => { if (!this.stopped) this.captureLatest?.(); };
  constructor(private revision: number, private readonly send: (save: BoardSave) => Promise<number>, initial: { document: NativeDocument; incoming: IncomingState }, private readonly recovery?: RecoveryStore, restored = false) {
    this.pending = { document: initial.document, incoming: initial.incoming };
    if (restored) {
      this.generation = 1;
      this.state = { status: 'unsaved', retryable: true, message: 'Recovered local work — review the canvas, then Retry save. The server version has not been changed.' };
      this.persist();
    }
  }
  getOperation = (): BoardSave => ({ expectedRevision: this.revision, ...this.pending });
  private persist(): void {
    if (this.recovery) this.recoveryAvailability(this.recovery.write(this.getOperation()));
  }
  private recoveryAvailability(available: boolean): void {
    const unavailable = !available;
    if (Boolean(this.state.recoveryUnavailable) === unavailable) return;
    const state = { ...this.state };
    if (unavailable) state.recoveryUnavailable = true;
    else delete state.recoveryUnavailable;
    // Only a real write/acknowledged cleanup can change this warning. Paused
    // failures publish immediately without scheduling or replaying a save.
    this.state = state;
    this.publish(state);
  }
  /** Copy acknowledges only the captured pair, never edits made while it was sent. */
  completeCopy(operation: BoardSave): boolean {
    this.checkpoint();
    if (operation.document !== this.pending.document || operation.incoming !== this.pending.incoming) return false;
    this.discard();
    return true;
  }
  discard(): void { this.checkpoint(); this.recovery?.clear(); this.captureLatest = undefined; this.dispose(); }
  getSnapshot = (): SaveState => this.state;
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(state: SaveState): void {
    if (this.stopped) return;
    this.state = { ...state, ...(this.state.recoveryUnavailable ? { recoveryUnavailable: true } : {}) };
    for (const listener of this.listeners) listener();
  }
  get dirty(): boolean { return !this.stopped && this.generation !== this.acknowledged; }
  change = (document: NativeDocument, incoming = this.pending.incoming): void => {
    if (this.stopped) return;
    this.pending = { document, incoming };
    this.generation += 1;
    this.persist();
    if (this.state.status === 'conflict' || this.state.retryable) return;
    this.publish({ status: this.flight ? 'saving' : 'unsaved', message: this.flight ? 'Saving… Newer changes are waiting.' : 'Unsaved changes' });
    this.schedule();
  };
  private schedule(): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { void this.save(); }, 300);
  }
  retry = async (): Promise<void> => { this.checkpoint(); if (this.state.status !== 'conflict') await this.save(true); };
  private async save(explicitRetry = false): Promise<void> {
    clearTimeout(this.timer);
    if (this.stopped || this.flight || !this.pending || !this.dirty || this.state.status === 'conflict' || (!explicitRetry && this.state.retryable)) return;
    const generation = this.generation;
    const operation = this.pending;
    this.flight = true;
    this.publish({ status: 'saving', message: 'Saving…' });
    try {
      const revision = await this.send({ expectedRevision: this.revision, ...operation });
      if (this.stopped) return;
      // SDK store listeners are deferred; reconcile real native edits before
      // deciding that this older acknowledgement covers the current canvas.
      this.checkpoint();
      this.revision = revision;
      this.acknowledged = generation;
      if (this.dirty) this.persist();
      else if (this.recovery) this.recoveryAvailability(this.recovery.clear(true));
      this.publish(this.dirty ? { status: 'unsaved', message: 'Unsaved changes' } : { status: 'saved', message: 'Saved' });
      if (this.dirty) this.schedule();
    } catch (error) {
      clearTimeout(this.timer);
      this.publish(error instanceof BoardSaveError && error.kind === 'conflict'
        ? { status: 'conflict', message: 'Conflict — another tab saved a newer version. Your local work is retained. Save it as a new private copy, or reload the server version and discard this tab’s changes.' }
        : error instanceof BoardSaveError && error.kind === 'blocked'
          ? { status: 'unsaved', retryable: true, message: 'Unsaved — saving is paused after an account check. Your current work is still here. Check account above if needed, then explicitly Retry save.' }
          : { status: 'unsaved', retryable: true, message: 'Unsaved — saving failed. Your current work is still here. Check your connection, then Retry save, or save a private copy. If your session ended, sign in in another tab first.' });
    } finally { this.flight = false; }
  }
  /** Drain the latest native checkpoint before a client-side board switch. */
  async flush(): Promise<boolean> {
    this.checkpoint();
    if (!this.dirty) return true;
    if (this.state.retryable || this.state.status === 'conflict') return false;
    return await new Promise<boolean>((resolve) => {
      const stop = this.subscribe(() => {
        if (!this.dirty || this.state.retryable || this.state.status === 'conflict') {
          stop(); resolve(!this.dirty);
        }
      });
      void this.save();
    });
  }
  dispose(): void { this.checkpoint(); this.stopped = true; this.captureLatest = undefined; clearTimeout(this.timer); this.listeners.clear(); }
}
