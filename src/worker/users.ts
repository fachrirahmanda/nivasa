import { DEFAULT_CATEGORIES, type User } from '../shared/types';

/** The account details Google gives back at sign-in. */
export interface GoogleProfile {
  sub: string;
  email: string;
  name: string;
  picture?: string;
}

interface UserRow {
  id: string;
  email: string;
  name: string;
  username: string | null;
  password_hash: string | null;
  password_salt: string | null;
  avatar_url: string | null;
  avatar_v: number | null;
  name_edited: number;
  google_sub: string;
}

const SELECT_USER = 'SELECT id, email, name, username, password_hash, password_salt, avatar_url, avatar_v, name_edited, google_sub FROM users';

/** The photo to show: the person's own upload if they made one, else their Google picture. */
const avatarUrlOf = (row: Pick<UserRow, 'id' | 'avatar_url' | 'avatar_v'>) => (row.avatar_v ? `/api/avatar/${row.id}?v=${row.avatar_v}` : row.avatar_url);

const toUser = (row: UserRow): User => ({
  id: row.id,
  username: row.username ?? undefined,
  email: row.email,
  name: row.name,
  avatarUrl: avatarUrlOf(row),
});

export async function getUser(db: D1Database, id: string): Promise<User | null> {
  const row = await db.prepare(`${SELECT_USER} WHERE id = ?`).bind(id).first<UserRow>();
  return row ? toUser(row) : null;
}

/** Finds the user for this Google account, or creates it with the default categories. Records the sign-in. */
export async function upsertUser(db: D1Database, profile: GoogleProfile): Promise<User> {
  const picture = profile.picture || null;
  const existing = await db.prepare(`${SELECT_USER} WHERE google_sub = ?`).bind(profile.sub).first<UserRow>();

  if (existing) {
    const name = existing.name_edited ? existing.name : profile.name;
    if (existing.email !== profile.email || existing.name !== name || existing.avatar_url !== picture) {
      await db.prepare('UPDATE users SET email = ?, name = ?, avatar_url = ? WHERE id = ?').bind(profile.email, name, picture, existing.id).run();
    }
    await db.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").bind(existing.id).run();
    return toUser({ ...existing, email: profile.email, name, avatar_url: picture });
  }

  const id = crypto.randomUUID();
  await db.batch([
    db
      .prepare("INSERT INTO users (id, google_sub, email, name, avatar_url, last_login_at) VALUES (?, ?, ?, ?, ?, datetime('now'))")
      .bind(id, profile.sub, profile.email, profile.name, picture),
    db.prepare("INSERT INTO workspace_members (user_id, owner_id, role) VALUES (?, ?, 'owner')").bind(id, id),
    ...DEFAULT_CATEGORIES.map((category) =>
      db.prepare('INSERT INTO categories (id, user_id, name, color, icon) VALUES (?, ?, ?, ?, ?)').bind(crypto.randomUUID(), id, category.name, category.color, category.icon),
    ),
  ]);
  return { id, email: profile.email, name: profile.name, avatarUrl: picture };
}

/** Finds a user by username. */
export async function getUserByUsername(db: D1Database, username: string): Promise<UserRow | null> {
  const row = await db.prepare(`${SELECT_USER} WHERE username = ?`).bind(username).first<UserRow>();
  return row ?? null;
}

/** SHA-256 hash of (salt + password), returned as hex. */
async function hashPassword(salt: string, password: string): Promise<string> {
  const data = new TextEncoder().encode(salt + password);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Verifies username/password and returns the user id, or null when invalid. */
export async function verifyPassword(db: D1Database, username: string, password: string): Promise<string | null> {
  const row = await getUserByUsername(db, username);
  if (!row || !row.password_hash || !row.password_salt) return null;
  const hash = await hashPassword(row.password_salt, password);
  if (hash !== row.password_hash) return null;
  return row.id;
}

/** Creates a new account that signs in with username + password (no Google). */
export async function createUserWithPassword(
  db: D1Database,
  username: string,
  email: string,
  name: string,
  password: string,
): Promise<User> {
  const salt = crypto.randomUUID();
  const password_hash = await hashPassword(salt, password);
  const id = crypto.randomUUID();
  // google_sub is NOT NULL UNIQUE, so give password accounts a unique placeholder.
  const google_sub = `pwd:${id}`;

  const existing = await db.prepare(`${SELECT_USER} WHERE username = ?`).bind(username).first<UserRow>();
  if (existing) throw new Error('Username already taken');

  await db.batch([
    db
      .prepare(
        'INSERT INTO users (id, google_sub, email, name, username, password_hash, password_salt, last_login_at) VALUES (?, ?, ?, ?, ?, ?, ?, datetime(\'now\'))',
      )
      .bind(id, google_sub, email, name, username, password_hash, salt),
    db.prepare("INSERT INTO workspace_members (user_id, owner_id, role) VALUES (?, ?, 'owner')").bind(id, id),
    ...DEFAULT_CATEGORIES.map((category) =>
      db.prepare('INSERT INTO categories (id, user_id, name, color, icon) VALUES (?, ?, ?, ?, ?)').bind(crypto.randomUUID(), id, category.name, category.color, category.icon),
    ),
  ]);
  return { id, username, email, name, avatarUrl: null };
}
