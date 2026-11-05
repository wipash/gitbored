import type { NativeDocument } from '../../shared/nativeDocument';
import type { BoardSave } from '../../shared/boards';
import type { IncomingState } from '../../shared/incoming';

export interface SaveState { status: 'saved' | 'saving' | 'unsaved' | 'conflict'; message: string; retryable?: true }
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
  constructor(private revision: number, private readonly send: (save: BoardSave) => Promise<number>, initial: { document: NativeDocument; incoming: IncomingState }) { this.pending = initial; }
  getSnapshot = (): SaveState => this.state;
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(state: SaveState): void { if (this.stopped) return; this.state = state; for (const listener of this.listeners) listener(); }
  get dirty(): boolean { return !this.stopped && this.generation !== this.acknowledged; }
  change = (document: NativeDocument, incoming = this.pending.incoming): void => {
    if (this.stopped) return;
    this.pending = { document, incoming };
    this.generation += 1;
    if (this.state.status === 'conflict' || this.state.retryable) return;
    this.publish({ status: this.flight ? 'saving' : 'unsaved', message: this.flight ? 'Saving… Newer changes are waiting.' : 'Unsaved changes' });
    this.schedule();
  };
  private schedule(): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { void this.save(); }, 300);
  }
  retry = async (): Promise<void> => { if (this.state.status !== 'conflict') await this.save(true); };
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
      this.revision = revision;
      this.acknowledged = generation;
      this.publish(this.dirty ? { status: 'unsaved', message: 'Unsaved changes' } : { status: 'saved', message: 'Saved' });
      if (this.dirty) this.schedule();
    } catch (error) {
      clearTimeout(this.timer);
      this.publish(error instanceof BoardSaveError && error.kind === 'conflict'
        ? { status: 'conflict', message: 'Conflict — another tab saved a newer version. Your current work is still here. Keep this tab open; reloading discards these local changes.' }
        : error instanceof BoardSaveError && error.kind === 'blocked'
          ? { status: 'unsaved', retryable: true, message: 'Unsaved — saving is paused after an account check. Your current work is still here. Check account above if needed, then explicitly Retry save. Keep this tab open.' }
          : { status: 'unsaved', retryable: true, message: 'Unsaved — saving failed. Your current work is still here. Check your connection, then Retry save. If your session ended, sign in in another tab first.' });
    } finally { this.flight = false; }
  }
  dispose(): void { this.stopped = true; clearTimeout(this.timer); this.listeners.clear(); }
}
