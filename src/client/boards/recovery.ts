import { T } from '@tldraw/validate';
import { boardSaveValidator, type BoardSave } from '../../shared/boards';
import { validateIncoming } from '../../shared/incoming';
import { getDocumentReferenceIds, validateNativeDocument } from '../../shared/nativeDocument';

export interface RecoveryDraft extends BoardSave { version: 1; accountId: string; boardId: string; writerId: string; updatedAt: number }
export interface StoredRecovery { key: string; draft: RecoveryDraft }
const prefix = 'gitbored:recovery:1:';
const timestamp = T.number.check((value) => { if (!Number.isSafeInteger(value) || value < 0 || value > 8.64e15) throw new Error('Invalid recovery timestamp'); });
const envelope = T.object({ version: T.literal(1), accountId: T.string, boardId: T.string, writerId: T.string, updatedAt: timestamp,
  expectedRevision: T.number, document: T.unknown, incoming: T.unknown });
function scope(accountId: string, boardId: string): string { return `${prefix}${encodeURIComponent(accountId)}:${encodeURIComponent(boardId)}:`; }
function validate(input: unknown): RecoveryDraft {
  const value = envelope.validate(input);
  const save = boardSaveValidator.validate({ expectedRevision: value.expectedRevision, document: value.document, incoming: value.incoming });
  const document = validateNativeDocument(save.document);
  const incoming = validateIncoming(save.incoming);
  const placed = new Set(getDocumentReferenceIds(document));
  if (incoming.queue.some((candidate) => placed.has(candidate.referenceId))) throw new Error('Inconsistent recovery pair');
  return { ...value, expectedRevision: save.expectedRevision, document, incoming };
}
/** Each editor writes and clears only its own key, including duplicated tabs. */
export class RecoveryStore {
  readonly writerId = crypto.randomUUID();
  readonly key: string;
  constructor(readonly accountId: string, readonly boardId: string, private readonly source?: StoredRecovery) { this.key = `${scope(accountId, boardId)}${this.writerId}`; }
  write(save: BoardSave): boolean {
    try {
      // Construct an allowlisted envelope: no Board title, session or metadata map.
      const draft: RecoveryDraft = { version: 1, accountId: this.accountId, boardId: this.boardId, writerId: this.writerId, updatedAt: Date.now(), ...save };
      localStorage.setItem(this.key, JSON.stringify(draft));
      return true;
    } catch { return false; }
  }
  clear(acknowledgedSource = false): boolean {
    const cleared = removeRecovery(this.key);
    // Only saving this exact pair to the original board makes a predecessor no
    // longer unsaved. Copying/reloading must not clear another writer's draft.
    return (acknowledgedSource && this.source ? removeStoredRecovery(this.source) : true) && cleared;
  }
}
function removeRecovery(key: string): boolean {
  try { localStorage.removeItem(key); return true; } catch { return false; }
}
export function readRecovery(accountId: string, boardId: string): { drafts: StoredRecovery[]; unavailable: boolean } {
  const drafts: StoredRecovery[] = [];
  try {
    const start = scope(accountId, boardId);
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key?.startsWith(start)) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      try {
        const draft = validate(JSON.parse(raw));
        if (draft.accountId === accountId && draft.boardId === boardId && key === `${start}${draft.writerId}`) drafts.push({ key, draft });
      } catch { /* Unsupported or damaged drafts never replace a server document. */ }
    }
    return { drafts: drafts.sort((a, b) => b.draft.updatedAt - a.draft.updatedAt), unavailable: false };
  } catch { return { drafts, unavailable: true }; }
}
/** A choice about a captured draft must not discard a live writer's newer work. */
function removeStoredRecovery(stored: StoredRecovery): boolean {
  try {
    if (localStorage.getItem(stored.key) === JSON.stringify(stored.draft)) localStorage.removeItem(stored.key);
    return true;
  } catch { return false; }
}
