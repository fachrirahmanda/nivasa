// Helpers shared by the inbox list and the email pane.

export interface EmailItem {
  id: string;
  subject: string;
  from_email: string;
  to_email: string;
  body: string;
  received_at: string;
  created_at: string;
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
