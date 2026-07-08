/**
 * Fetches user data from the API.
 * @param id The user id.
 * @returns The user's display name.
 */
export function fetchUser(id: string): string {
  return `user-${id}`;
}

/**
 * Represents an authenticated user session.
 */
export interface Session {
  /**
   * The unique token issued at login.
   */
  token: string;
}

// ↓ fetchUser にホバーすると、JSDoc が日本語で表示されます
export const displayName = fetchUser("42");
