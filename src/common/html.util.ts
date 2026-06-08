/**
 * Escape text for Telegram's HTML parse_mode. Only &, <, > are special, so this
 * is total and safe for untrusted/LLM-generated text — unlike legacy Markdown,
 * where an unbalanced metacharacter throws a parse error and drops the message.
 */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
