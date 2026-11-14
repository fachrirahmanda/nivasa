import type { RouteContext } from '../context';
import { HttpError, json, readJson } from '../http';
import { isAdmin } from '../admin';
import { createUserWithPassword } from '../users';

/** POST /api/members { username, email, name, password }: the admin creates an account for a member.
 *  The member then signs in with that username and password, and the owner invites them by email. */
export async function createMember({ request, env, actorId }: RouteContext) {
  if (!(await isAdmin(env, actorId))) throw new HttpError(403, 'Hanya admin yang bisa membuat akun member');
  const body = await readJson(request);
  const username = typeof body.username === 'string' ? body.username.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!username || !email || !name || !password) throw new HttpError(400, 'Semua field wajib diisi');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'Email tidak valid');
  if (password.length < 6) throw new HttpError(400, 'Password minimal 6 karakter');

  try {
    const user = await createUserWithPassword(env.DB, username, email, name, password);
    return json({ user: { id: user.id, username, email, name } }, 201);
  } catch (error) {
    if (error instanceof Error && error.message === 'Username already taken') {
      throw new HttpError(400, 'Username sudah digunakan');
    }
    throw error;
  }
}
