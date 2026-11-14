import { HttpError, json, readJson } from '../http';
import type { RouteContext } from '../context';
import { isAdmin } from '../admin';

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

/** The HTML of the mail, decoded, or '' when it has none. */
function htmlOf(payload: GmailPart): string {
  const html = findBody(payload, 'text/html');
  return html ? decodeBase64Url(html) : '';
}

/** The HTML of the mail as lines of text, with the tags taken out. */
function htmlLinesOf(payload: GmailPart): string[] {
  const text = htmlOf(payload)
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/(p|div|li|tr|h[1-6])>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '');
  return text.split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

/**
 * The mail as lines of text: the plain part first, then the HTML. The request card is often only in the HTML,
 * so both are read.
 */
function linesOf(payload: GmailPart): string[] {
  const plain = findBody(payload, 'text/plain');
  const plainLines = plain
    ? decodeBase64Url(plain).split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean)
    : [];
  return [...plainLines, ...htmlLinesOf(payload)];
}

/**
 * The request sentence of a mail, e.g. "Diminta oleh Rumah Kucing dari Aqua - Smart TV pada 13 November, 8.21 PM WIB".
 * Gives the name of the person asking and the device they ask from. null when the mail has no such sentence.
 */
function requestOf(lines: string[]): { line: string; sender: string; device: string } | null {
  for (const line of lines) {
    const id = line.match(/\bdiminta oleh (.+?) dari (.+?) pada\b/i);
    if (id) return { line, sender: id[1].trim(), device: id[2].trim() };
    const en = line.match(/\brequested by (.+?) from (.+?) on\b/i);
    if (en) return { line, sender: en[1].trim(), device: en[2].trim() };
  }
  return null;
}


/** The big heading of the mail (its first h1 to h3), as plain text. '' when the mail has none. */
function headingOf(html: string): string {
  const match = html.match(/<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/i);
  if (!match) return '';
  return match[1]
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);
}

/**
 * The link of the request card's button ("Ya, Itu Saya"), shown on the list row so the mail can be confirmed from the list.
 * Only https links are kept. '' when the mail has no such button.
 */
function actionOf(payload: GmailPart): string {
  for (const m of htmlOf(payload).matchAll(/<a\b[^>]*href="(https:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const label = m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (/\bya,?\s*itu\s*saya\b/i.test(label)) return m[1].replace(/&amp;/g, '&').slice(0, 2000);
  }
  return '';
}

/**
 * The sender's picture: the image nearest to the request sentence (the small badge beside it), or the first https image
 * when the mail has no request. '' when there is none. Only https links are kept, so nothing large is stored.
 */
function avatarOf(payload: GmailPart): string {
  const html = htmlOf(payload);
  const images: { index: number; src: string }[] = [];
  for (const m of html.matchAll(/<img[^>]+src="(https:\/\/[^"]+)"/gi)) {
    images.push({ index: m.index ?? 0, src: m[1].slice(0, 1000) });
  }
  if (images.length === 0) return '';
  const anchor = html.search(/\b(diminta|requested)\b/i);
  if (anchor < 0) return images[0].src;
  // Nearest image before the sentence; if there is none close by, the nearest one after it.
  const before = images.filter((img) => img.index < anchor && anchor - img.index < 3000).pop();
  if (before) return before.src;
  const after = images.find((img) => img.index > anchor && img.index - anchor < 3000);
  return after ? after.src : '';
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
/**
 * GET /api/emails?page=&pageSize=&tab=all|unread&q= — one page of the inbox, newest first.
 * `total` counts the mail that matches the tab and search; `unreadTotal` is the unread count for the tab badge.
 */
export async function listEmails({ env, request }: RouteContext) {
  const url = new URL(request.url);
  const pageSize = Math.min(50, Math.max(5, Number(url.searchParams.get('pageSize')) || 20));
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
  const unreadOnly = url.searchParams.get('tab') === 'unread';
  const q = (url.searchParams.get('q') ?? '').trim().slice(0, 200);

  // Mail older than the archive schedule is in the Archive; the rest is in the Requests list.
  const archived = url.searchParams.get('view') === 'archived';
  const days = await archiveDaysOf(env);
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  const viewWhere = days > 0 ? (archived ? 'received_at < ?' : 'received_at >= ?') : (archived ? '1 = 0' : '1 = 1');
  const viewBinds: (string | number)[] = days > 0 ? [cutoff] : [];

  const where: string[] = [viewWhere];
  const binds: (string | number)[] = [...viewBinds];
  if (unreadOnly) where.push('read_at IS NULL');
  if (q) {
    const like = `%${q.replace(/[\\%_]/g, (ch) => '\\' + ch)}%`;
    where.push("(subject LIKE ? ESCAPE '\\' OR from_email LIKE ? ESCAPE '\\')");
    binds.push(like, like);
  }
  // The devices that asked, with how many mails each has under the current tab and search (the device filter is not
  // applied here, so every chip keeps its count while another one is picked).
  const facetWhere = [...where, 'device IS NOT NULL', "device != ''"];
  const devices = await env.DB.prepare(
    `SELECT device AS name, COUNT(*) AS count FROM emails WHERE ${facetWhere.join(' AND ')} GROUP BY device ORDER BY count DESC, device ASC`
  )
    .bind(...binds)
    .all<{ name: string; count: number }>();

  const device = (url.searchParams.get('device') ?? '').trim().slice(0, 200);
  if (device) {
    where.push('device = ?');
    binds.push(device);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  // One extra row tells us whether there is a next page without a second query for it.
  const rows = await env.DB.prepare(
    `SELECT id, subject, from_email, to_email, received_at, created_at, read_at, snippet, avatar_url, sender_name, request_title, action_url, intro FROM emails ${whereSql} ORDER BY received_at DESC LIMIT ? OFFSET ?`
  )
    .bind(...binds, pageSize + 1, (page - 1) * pageSize)
    .all<{
      id: string;
      subject: string;
      from_email: string;
      to_email: string;
      received_at: string;
      created_at: string;
      read_at: string | null;
      snippet: string | null;
      avatar_url: string | null;
      sender_name: string | null;
      request_title: string | null;
      action_url: string | null;
      intro: string | null;
    }>();

  const totals = await env.DB.prepare(
    `SELECT COUNT(*) AS total, SUM(CASE WHEN read_at IS NULL THEN 1 ELSE 0 END) AS unread FROM emails ${whereSql}`
  )
    .bind(...binds)
    .first<{ total: number; unread: number | null }>();

  const all = await env.DB.prepare(`SELECT COUNT(*) AS unread FROM emails WHERE read_at IS NULL AND ${viewWhere}`)
    .bind(...viewBinds)
    .first<{ unread: number }>();

  const results = rows.results ?? [];
  return json({
    items: results.slice(0, pageSize),
    page,
    pageSize,
    total: totals?.total ?? 0,
    hasMore: results.length > pageSize,
    unreadTotal: all?.unread ?? 0,
    devices: devices.results ?? [],
  });
}

/** POST /api/emails/:id/read — tandai email sudah dibaca. */
export async function markEmailRead({ env, params }: RouteContext) {
  await env.DB.prepare("UPDATE emails SET read_at = datetime('now') WHERE id = ?")
    .bind(params.id)
    .run();
  return json({ ok: true });
}

/** POST /api/email/reset — hapus semua email yang sudah tersinkron. Gmail tetap terhubung. */
export async function emailReset({ env, actorId }: RouteContext) {
  if (!(await isAdmin(env, actorId))) throw new HttpError(403, 'Hanya admin yang bisa mereset data email');
  await env.DB.prepare('DELETE FROM emails').run();
  return json({ ok: true });
}

/** POST /api/email/sync — sinkronkan email dari Gmail. */
export async function emailSync({ env }: RouteContext) {
  const token = await getAccessToken(env);

  const searchUrl = `https://www.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(
    'subject:"Penting: Cara memperbarui Rumah dengan Akun Netflix-mu"'
  )}&maxResults=20`;
  const searchRes = await googleFetch(searchUrl, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!searchRes.ok) throw new HttpError(502, 'Gmail menolak permintaan sinkronisasi. Coba hubungkan ulang Gmail di Settings.');

  const searchData = (await searchRes.json()) as { messages?: { id: string }[] };
  const messages = searchData.messages ?? [];
  let count = 0;

  for (const msg of messages) {
    // New mail is stored. Mail stored before the preview or avatar existed gets them filled in (not counted as new).
    const existing = await env.DB.prepare('SELECT id, snippet, avatar_url, sender_name, request_title, action_url, intro, device FROM emails WHERE id = ?')
      .bind(msg.id)
      .first<{ id: string; snippet: string | null; avatar_url: string | null; sender_name: string | null; request_title: string | null; action_url: string | null; intro: string | null; device: string | null }>();
    if (existing && existing.snippet !== null && existing.avatar_url !== null && existing.sender_name !== null && existing.request_title !== null && existing.action_url !== null && existing.intro !== null && existing.device !== null) continue;

    const msgRes = await googleFetch(
      `https://www.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
      { headers: { authorization: `Bearer ${token}` } }
    );
    if (!msgRes.ok) continue;

    const msgData = (await msgRes.json()) as {
      id: string;
      snippet?: string;
      payload: GmailPart & { headers: { name: string; value: string }[] };
      internalDate: string;
    };
    const lines = linesOf(msgData.payload);
    const request = requestOf(lines);
    // The list's description is Gmail's own snippet for the mail, not text read from the body.
    const snippet = (msgData.snippet ?? '').slice(0, 200);
    // The list's name line: "FR - Apple TV". The list's title line: the heading of the mail itself, or else its question line.
    const sender = request ? `${request.sender} - ${request.device}`.slice(0, 200) : '';
    const device = request ? request.device.slice(0, 200) : '';
    // The sentence under the title: "Kami menerima permintaan untuk …".
    // The mail wraps this sentence over several lines, so it is joined until it ends with a full stop.
    const introAt = lines.findIndex((l) => /^kami menerima permintaan/i.test(l));
    let intro = '';
    if (introAt >= 0) {
      for (let i = introAt; i < lines.length && i < introAt + 4; i++) {
        intro = intro ? `${intro} ${lines[i]}` : lines[i];
        if (/[.!?]$/.test(lines[i])) break;
      }
    }
    intro = intro.slice(0, 400);
    const title =
      headingOf(htmlOf(msgData.payload)) ||
      lines.find((l) => l.endsWith('?') && l.length >= 20 && l.length <= 200 && !/^penting/i.test(l)) ||
      '';
    const avatar = avatarOf(msgData.payload);
    const action = actionOf(msgData.payload);

    if (existing) {
      await env.DB.prepare('UPDATE emails SET snippet = ?, avatar_url = ?, sender_name = ?, request_title = ?, action_url = ?, intro = ?, device = ? WHERE id = ?')
        .bind(snippet, avatar, sender, title, action, intro, device, msg.id)
        .run();
      continue;
    }

    const { subject, fromEmail, toEmail } = readHeaders(msgData.payload.headers);
    const receivedAt = new Date(parseInt(msgData.internalDate, 10)).toISOString();

    await env.DB.prepare(
      "INSERT INTO emails (id, subject, from_email, to_email, body, received_at, created_at, snippet, avatar_url, sender_name, request_title, action_url, intro, device) VALUES (?, ?, ?, ?, ?, ?, datetime('now'), ?, ?, ?, ?, ?, ?, ?)"
    )
      .bind(msg.id, subject, fromEmail, toEmail, '', receivedAt, snippet, avatar, sender, title, action, intro, device)
      .run();
    count++;
  }

  return json({ emailsCount: count });
}

/** How many days a mail stays in the Requests list before it moves to the Archive. 0 means never. */
const ARCHIVE_CHOICES = [0, 1, 3, 7, 14, 30];
const DEFAULT_ARCHIVE_DAYS = 7;

async function archiveDaysOf(env: RouteContext['env']): Promise<number> {
  const row = await env.DB.prepare('SELECT archive_after_days FROM email_settings WHERE id = ?')
    .bind('admin')
    .first<{ archive_after_days: number }>();
  return row?.archive_after_days ?? DEFAULT_ARCHIVE_DAYS;
}

/** GET /api/email/archive — the archive schedule, for everyone who sees the mail. */
export async function getArchiveSchedule({ env }: RouteContext) {
  return json({ archiveAfterDays: await archiveDaysOf(env), choices: ARCHIVE_CHOICES });
}

/** PUT /api/email/archive { archiveAfterDays } — the admin sets when mail moves to the Archive. */
export async function saveArchiveSchedule({ request, env, actorId }: RouteContext) {
  if (!(await isAdmin(env, actorId))) throw new HttpError(403, 'Hanya admin yang bisa mengatur arsip');
  const body = await readJson(request);
  const days = Number(body.archiveAfterDays);
  if (!ARCHIVE_CHOICES.includes(days)) throw new HttpError(400, 'Pilihan arsip tidak dikenal');
  await env.DB.prepare(
    'INSERT INTO email_settings (id, archive_after_days) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET archive_after_days = ?'
  )
    .bind('admin', days, days)
    .run();
  return json({ archiveAfterDays: days, choices: ARCHIVE_CHOICES });
}

/** GET /api/emails/devices — the devices that asked, with how many mails each has and when it last asked. */
export async function emailDevices({ env }: RouteContext) {
  const devices = await env.DB.prepare(
    `SELECT device AS name, COUNT(*) AS count,
            SUM(CASE WHEN read_at IS NULL THEN 1 ELSE 0 END) AS unread,
            MAX(received_at) AS lastAt
       FROM emails
      WHERE device IS NOT NULL AND device != ''
      GROUP BY device
      ORDER BY lastAt DESC`
  ).all<{ name: string; count: number; unread: number | null; lastAt: string }>();
  return json({ devices: (devices.results ?? []).map((d) => ({ ...d, unread: d.unread ?? 0 })) });
}
