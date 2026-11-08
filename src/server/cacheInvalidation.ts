import type { DatabaseSync } from 'node:sqlite';

export interface GitHubCacheInvalidation {
  generation(userId: string): number;
  forget(userId: string): void;
}

/** Auth and source denials must also stop earlier requests from restoring deleted data. */
export function createGitHubCacheInvalidation(database: DatabaseSync): GitHubCacheInvalidation {
  const generations = new Map<string, number>();
  return {
    generation: (userId) => generations.get(userId) ?? 0,
    forget(userId) {
      database.prepare('DELETE FROM github_cache WHERE user_id=?').run(userId);
      generations.set(userId, (generations.get(userId) ?? 0) + 1);
    },
  };
}
