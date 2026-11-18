import type { DatabaseSync } from 'node:sqlite';

export interface GitHubCacheInvalidation {
  generation(): number;
  canWrite(userId: string, owner: string, since: number): boolean;
  requireRefresh(userId: string, owner?: string): void;
  forget(userId: string): void;
}

/** A read that began before a denial must not restore the affected cache as fresh. */
export function createGitHubCacheInvalidation(database: DatabaseSync): GitHubCacheInvalidation {
  let generation = 0;
  const invalidatedAt = new Map<string, number>();
  return {
    generation: () => generation,
    canWrite(userId, owner, since) {
      return (invalidatedAt.get(userId) ?? 0) <= since
        && (invalidatedAt.get(`${userId}:${owner.toLowerCase()}`) ?? 0) <= since;
    },
    requireRefresh(userId, owner) {
      // Installation catalogue errors may not identify the affected organization.
      if (owner === undefined) {
        database.prepare('UPDATE github_cache SET needs_refresh=1 WHERE user_id=? AND needs_refresh=0').run(userId);
      } else {
        database.prepare(`WITH refs AS (SELECT id FROM item_references WHERE user_id=? AND owner=? COLLATE NOCASE)
          UPDATE github_cache SET needs_refresh=1 WHERE user_id=? AND needs_refresh=0 AND (
            cache_key GLOB ? OR cache_key IN (SELECT 'reference:' || id FROM refs UNION ALL SELECT 'context:' || id FROM refs)
          )`).run(userId, owner, userId, `items:${owner.toLowerCase()}/*`);
      }
      invalidatedAt.set(owner === undefined ? userId : `${userId}:${owner.toLowerCase()}`, ++generation);
    },
    forget(userId) {
      database.prepare('DELETE FROM github_cache WHERE user_id=?').run(userId);
      invalidatedAt.set(userId, ++generation);
    },
  };
}
