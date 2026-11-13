// Helpers shared by the inbox list and the email pane.

export interface EmailItem {
  id: string;
  subject: string;
  from_email: string;
  to_email: string;
  body: string;
  received_at: string;
  created_at: string;
  read_at?: string | null;
}

export function initialsOf(email: string): string {
  const name = email.split('@')[0];
  const parts = name.split(/[.\-_]/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}

export function extractAvatarFromBody(body: string): string | null {
  const match = body.match(/<img[^>]+src="([^"]+)"/i);
  return match ? match[1] : null;
}

export function stripHtml(html: string): string {
  // Style and script contents are not text: drop them before reading the words.
  const div = document.createElement('div');
  div.innerHTML = html.replace(/<(style|script)[\s\S]*?<\/\1>/gi, '');
  return div.textContent || div.innerText || '';
}

/** A short line in the mail that reads like a button ("YA, ITU SAYA"), if there is one. */
export function detectActionButton(body: string): string | null {
  const plain = stripHtml(body);
  const lines = plain.split('\n').map((l) => l.trim()).filter(Boolean);
  const actionKeywords = ['ya, itu saya', 'ya, itu ada', 'konfirmasi', 'verifikasi', 'aktifkan', 'setujui', 'terima'];
  for (const line of lines) {
    const upper = line.toUpperCase();
    if (line.length > 1 && line.length < 40 && (upper === line || actionKeywords.some((kw) => upper.includes(kw.toUpperCase())))) {
      return line;
    }
  }
  return null;
}

/** The first line of text that is not the action button: a preview for the list. */
export function snippetOf(body: string, action: string | null): string {
  const lines = stripHtml(body).split('\n').map((l) => l.trim()).filter(Boolean);
  return lines.filter((l) => l !== action).join(' ');
}

/** Short age of a mail for the list: "now", "9m", "3h", "2d", then the date. */
export function relativeTime(iso: string, lang: string, now = Date.now()): string {
  const then = new Date(iso).getTime();
  const minutes = Math.round((now - then) / 60000);
  if (minutes < 1) return lang === 'id' ? 'baru' : 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString(lang === 'id' ? 'id-ID' : 'en-US', { day: 'numeric', month: 'short' });
}

/** The sender's name without the address: "Netflix <info@…>" → "Netflix". */
export function senderName(from: string): string {
  const name = from.replace(/<[^>]*>/g, '').replace(/"/g, '').trim();
  return name || from;
}

/** The address alone: "Netflix <info@…>" → "info@…". */
export function senderAddress(from: string): string {
  const m = from.match(/<([^>]+)>/);
  return m ? m[1] : from;
}
