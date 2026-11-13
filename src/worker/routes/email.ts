import { HttpError, json, readJson } from '../http';
import type { RouteContext } from '../context';

/** A call to Google. A dropped connection becomes a clear message, not an unhandled error. */
async function googleFetch(input: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch {
    throw new HttpError(502, 'Tidak bisa terhubung ke Google. Coba lagi sebentar.');
  }
}

function redirect(location: string): Response {
  return new Response(null, { status: 302, headers: { location } });
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

type GmailPart = {
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailPart[];
};

/** Cari body dengan mimeType tertentu, rekursif ke semua nested parts. */
function findBody(part: GmailPart, mime: string): string | null {
  if (part.mimeType === mime && part.body?.data) return part.body.data;
  for (const p of part.parts ?? []) {
    const found = findBody(p, mime);
    if (found) return found;
  }
  return null;
}

/** Decode base64url ke UTF-8 (tanpa Buffer, aman untuk Cloudflare Workers). */
function decodeBase64Url(data: string): string {
  const b64 = data.replace(/-/g, '+').replace(/_/g, '/');
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return new TextDecoder('utf-8').decode(bytes);
}

/** Ambil access token Gmail yang valid, refresh otomatis kalau sudah kedaluwarsa. */
async function getAccessToken(env: RouteContext['env']): Promise<string> {
  const row = await env.DB.prepare(
    'SELECT gmail_email, gmail_refresh_token, gmail_access_token, token_expires_at FROM gmail_config WHERE id = ?'
  )
    .bind('admin')
    .first<{
      gmail_email: string | null;
      gmail_refresh_token: string | null;
      gmail_access_token: string | null;
      token_expires_at: string | null;
    }>();

  if (!row?.gmail_refresh_token) throw new HttpError(400, 'Gmail belum terhubung');

  let token = row.gmail_access_token;
  const expired = !token || (row.token_expires_at && new Date(row.token_expires_at) < new Date());

  if (expired) {
    const refreshRes = await googleFetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: row.gmail_refresh_token,
        client_id: env.GOOGLE_CLIENT_ID!,
        client_secret: env.GOOGLE_CLIENT_SECRET!,
      }),
    });
    if (!refreshRes.ok) throw new HttpError(400, 'Gagal refresh token Gmail');
    const refreshed = (await refreshRes.json()) as { access_token: string; expires_in?: number };
    token = refreshed.access_token;
    const expiresAt = new Date(Date.now() + (refreshed.expires_in ?? 3600) * 1000).toISOString();
    await env.DB.prepare(
      "UPDATE gmail_config SET gmail_access_token = ?, token_expires_at = ?, updated_at = datetime('now') WHERE id = ?"
    )
      .bind(token, expiresAt, 'admin')
      .run();
  }

  return token as string;
}

/** Ambil header Subject / From / To dari payload Gmail. */
function readHeaders(headers: { name: string; value: string }[] | undefined) {
  let subject = '';
  let fromEmail = '';
  let toEmail = '';
  for (const h of headers ?? []) {
    const name = h.name.toLowerCase();
    if (name === 'subject') subject = h.value;
    if (name === 'from') fromEmail = h.value;
    if (name === 'to') toEmail = h.value;
  }
  return { subject, fromEmail, toEmail };
}

/* ------------------------------------------------------------------ */
/* Routes                                                              */
/* ------------------------------------------------------------------ */

/** GET /api/email/status — apakah Gmail sudah terhubung. */
export async function emailStatus({ env }: RouteContext) {
  const row = await env.DB.prepare(
    'SELECT gmail_email, connected_at FROM gmail_config WHERE id = ?'
  )
    .bind('admin')
    .first<{ gmail_email: string | null; connected_at: string | null }>();

  return json({
    connected: !!row?.gmail_email,
    email: row?.gmail_email ?? null,
    connectedAt: row?.connected_at ?? null,
  });
}

/** POST /api/email/disconnect — putuskan koneksi Gmail. */
export async function emailDisconnect({ env }: RouteContext) {
  await env.DB.prepare(
    `UPDATE gmail_config SET
       gmail_email = NULL,
       gmail_refresh_token = NULL,
       gmail_access_token = NULL,
       token_expires_at = NULL,
       updated_at = datetime('now')
      WHERE id = ?`
  )
    .bind('admin')
    .run();
  return json({ ok: true });
}

/** POST /api/email/connect — buat URL autorisasi OAuth Gmail. */
export async function emailConnect({ request, env }: RouteContext) {
  const clientId = env.GOOGLE_CLIENT_ID;
  if (!clientId) throw new HttpError(503, 'Google OAuth belum dikonfigurasi');

  const body = await readJson(request);
  const origin = typeof body.origin === 'string' ? body.origin : '';
  const state = crypto.randomUUID();

  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${origin}/api/email/callback`,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/gmail.readonly',
    access_type: 'offline',
    prompt: 'consent',
    state,
  }).toString();

  return json({ authUrl: url.toString(), state });
}

/** GET /api/email/callback — Google OAuth callback, simpan token ke DB. */
export async function emailCallback({ request, env }: RouteContext) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');

  if (error) return redirect('/settings?tab=gmail&email=failed');
  if (!code) return redirect('/settings?tab=gmail&email=failed');

  const clientId = env.GOOGLE_CLIENT_ID;
  const clientSecret = env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new HttpError(503, 'Google OAuth belum dikonfigurasi');

  const redirectUri = `${new URL(request.url).origin}/api/email/callback`;

  const tokenRes = await googleFetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  if (!tokenRes.ok) return redirect('/settings?tab=gmail&email=failed');

  const tokens = (await tokenRes.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };

  const profileRes = await googleFetch('https://www.googleapis.com/gmail/v1/users/me/profile', {
    headers: { authorization: `Bearer ${tokens.access_token}` },
  });
  if (!profileRes.ok) return redirect('/settings?tab=gmail&email=failed');

  const profile = (await profileRes.json()) as { emailAddress: string };
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

  await env.DB.prepare(
    `INSERT INTO gmail_config (id, gmail_email, gmail_refresh_token, gmail_access_token, token_expires_at, connected_at, updated_at)
     VALUES ('admin', ?, ?, ?, ?, datetime('now'), datetime('now'))
     ON CONFLICT(id) DO UPDATE SET gmail_email = ?, gmail_refresh_token = ?, gmail_access_token = ?, token_expires_at = ?, updated_at = datetime('now')`
  )
    .bind(
      profile.emailAddress,
      tokens.refresh_token ?? '',
      tokens.access_token,
      expiresAt,
      profile.emailAddress,
      tokens.refresh_token ?? '',
      tokens.access_token,
      expiresAt
    )
    .run();

  return redirect('/settings?tab=gmail&email=connected');
}

/** GET /api/emails — daftar email inbox. */
export async function listEmails({ env }: RouteContext) {
  const emails = await env.DB.prepare(
    'SELECT id, subject, from_email, to_email, body, received_at, created_at, read_at FROM emails ORDER BY received_at DESC LIMIT 50'
  ).all<{
    id: string;
    subject: string;
    from_email: string;
    to_email: string;
    body: string;
    received_at: string;
    created_at: string;
    read_at: string | null;
  }>();

  return json(emails.results ?? []);
}

/** GET /api/emails/:id — detail satu email. */
export async function getEmail({ env, params }: RouteContext) {
  const email = await env.DB.prepare(
    'SELECT id, subject, from_email, to_email, body, received_at, created_at FROM emails WHERE id = ?'
  )
    .bind(params.id)
    .first<{
      id: string;
      subject: string;
      from_email: string;
      to_email: string;
      body: string;
      received_at: string;
      created_at: string;
    }>();

  if (!email) throw new HttpError(404, 'Email tidak ditemukan');
  return json(email);
}

/** GET /api/emails/:id/full — ambil email penuh (HTML + teks) dari Gmail API. */
export async function getEmailFull({ env, params }: RouteContext) {
  const token = await getAccessToken(env);

  const msgRes = await googleFetch(
    `https://www.googleapis.com/gmail/v1/users/me/messages/${params.id}?format=full`,
    { headers: { authorization: `Bearer ${token}` } }
  );
  if (!msgRes.ok) throw new HttpError(404, 'Email tidak ditemukan di Gmail');

  const msgData = (await msgRes.json()) as {
    id: string;
    payload: GmailPart & { headers: { name: string; value: string }[] };
    internalDate: string;
  };

  const { subject, fromEmail, toEmail } = readHeaders(msgData.payload.headers);

  const htmlRaw = findBody(msgData.payload, 'text/html');
  const textRaw = findBody(msgData.payload, 'text/plain');

  const body_html = htmlRaw ? decodeBase64Url(htmlRaw) : '';
  const body_text = textRaw ? decodeBase64Url(textRaw) : '';

  const receivedAt = new Date(parseInt(msgData.internalDate, 10)).toISOString();

  return json({
    id: msgData.id,
    subject,
    from_email: fromEmail,
    to_email: toEmail,
    body: body_html || body_text,
    body_html,
    body_text,
    received_at: receivedAt,
    created_at: receivedAt,
  });
}

/** POST /api/emails/:id/read — tandai email sudah dibaca. */
export async function markEmailRead({ env, params }: RouteContext) {
  await env.DB.prepare("UPDATE emails SET read_at = datetime('now') WHERE id = ?")
    .bind(params.id)
    .run();
  return json({ ok: true });
}

/** POST /api/email/sync — sinkronkan email dari Gmail. */
export async function emailSync({ env }: RouteContext) {
  const token = await getAccessToken(env);

  const searchUrl = `https://www.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(
    'subject:"Penting: Cara memperbarui Rumah dengan Akun Netflix-mu"'
  )}&maxResults=50`;
  const searchRes = await googleFetch(searchUrl, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!searchRes.ok) throw new HttpError(502, 'Gmail menolak permintaan sinkronisasi. Coba hubungkan ulang Gmail di Settings.');

  const searchData = (await searchRes.json()) as { messages?: { id: string }[] };
  const messages = searchData.messages ?? [];
  let count = 0;

  for (const msg of messages) {
    const existing = await env.DB.prepare('SELECT id FROM emails WHERE id = ?').bind(msg.id).first();
    if (existing) continue;

    const msgRes = await googleFetch(
      `https://www.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
      { headers: { authorization: `Bearer ${token}` } }
    );
    if (!msgRes.ok) continue;

    const msgData = (await msgRes.json()) as {
      id: string;
      payload: GmailPart & { headers: { name: string; value: string }[] };
      internalDate: string;
    };

    const { subject, fromEmail, toEmail } = readHeaders(msgData.payload.headers);
    const receivedAt = new Date(parseInt(msgData.internalDate, 10)).toISOString();

    await env.DB.prepare(
      "INSERT INTO emails (id, subject, from_email, to_email, body, received_at, created_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))"
    )
      .bind(msg.id, subject, fromEmail, toEmail, '', receivedAt)
      .run();
    count++;
  }

  return json({ emailsCount: count });
}