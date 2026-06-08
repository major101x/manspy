import { NansenTransactionsResponse } from './nansen.types';

// Strip Nansen's leading emoji and the trailing "[0x1234ab]" address fragment,
// e.g. "🏦 Bybit: Deposit [0x7647b7]" -> "Bybit: Deposit".
export function cleanNansenLabel(s: string): string {
  return s
    .replace(/\[0x[0-9a-fA-F]+\]/g, '')
    .replace(/[^\x20-\x7E]/g, '')
    .trim();
}

/**
 * Recent-activity summary from the sampled transactions page. Nansen exposes no
 * lifetime count, so this is "at least N txs in the last 30 days"; `hasMore` is
 * true when the page wasn't the last (i.e. there are more than we sampled).
 */
export function summarizeTxActivity(tx: NansenTransactionsResponse | null): {
  count: number;
  hasMore: boolean;
} {
  if (!tx?.data?.length) return { count: 0, hasMore: false };
  return { count: tx.data.length, hasMore: tx.pagination?.is_last_page === false };
}

/**
 * Nansen's own entity label for `address`, harvested from the counterparty legs
 * inside its transactions (where the labels actually live). Returns null when
 * Nansen has no label for this address.
 */
export function nansenLabelFor(
  tx: NansenTransactionsResponse | null,
  address: string,
): string | null {
  if (!tx?.data?.length) return null;
  const a = address.toLowerCase();
  for (const t of tx.data) {
    for (const leg of [...(t.tokens_sent ?? []), ...(t.tokens_received ?? [])]) {
      if (leg.from_address?.toLowerCase() === a && leg.from_address_label)
        return cleanNansenLabel(leg.from_address_label);
      if (leg.to_address?.toLowerCase() === a && leg.to_address_label)
        return cleanNansenLabel(leg.to_address_label);
    }
  }
  return null;
}

/**
 * Up to `limit` distinct recent counterparties for `address` (the other side of
 * each transfer), labelled where Nansen knows them, with the per-tx volume. Used
 * to give the LLM concrete "who is this wallet interacting with" context.
 */
export function recentCounterparties(
  tx: NansenTransactionsResponse | null,
  address: string,
  limit = 3,
): { label: string; volumeUsd: number }[] {
  if (!tx?.data?.length) return [];
  const a = address.toLowerCase();
  const seen = new Set<string>();
  const out: { label: string; volumeUsd: number }[] = [];
  for (const t of tx.data) {
    if (out.length >= limit) break;
    for (const leg of [...(t.tokens_sent ?? []), ...(t.tokens_received ?? [])]) {
      const isFrom = leg.from_address?.toLowerCase() === a;
      const other = isFrom ? leg.to_address : leg.from_address;
      const otherLabel = isFrom ? leg.to_address_label : leg.from_address_label;
      if (!other || other.toLowerCase() === a) continue;
      const key = other.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const label = otherLabel
        ? cleanNansenLabel(otherLabel)
        : `${other.slice(0, 6)}…${other.slice(-4)}`;
      out.push({ label, volumeUsd: t.volume_usd ?? 0 });
      break;
    }
  }
  return out.slice(0, limit);
}
