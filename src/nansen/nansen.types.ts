export interface NansenPagination {
  page: number;
  per_page: number;
  is_last_page: boolean;
}

export interface NansenBalanceItem {
  chain: string;
  address: string;
  token_address: string;
  token_symbol: string;
  token_name: string;
  token_amount: number;
  price_usd: number;
  value_usd: number;
}

export interface NansenCurrentBalanceResponse {
  pagination: NansenPagination;
  data: NansenBalanceItem[];
}

export interface NansenPnLToken {
  token_symbol: string;
  realized_pnl_usd: number;
}

export interface NansenPnLSummaryResponse {
  address: string;
  chain: string;
  realized_pnl_usd: number;
  unrealized_pnl_usd: number;
  win_rate: number;
  total_trades: number;
  top_tokens: NansenPnLToken[];
}

// A token leg inside a transaction (Nansen returns sent/received arrays, each
// carrying counterparty addresses + their entity labels).
export interface NansenTokenLeg {
  token_symbol?: string;
  token_amount?: number;
  price_usd?: number | null;
  value_usd?: number | null;
  token_address?: string;
  from_address?: string;
  to_address?: string;
  from_address_label?: string;
  to_address_label?: string;
}

export interface NansenTransaction {
  chain: string;
  method: string;
  tokens_sent: NansenTokenLeg[];
  tokens_received: NansenTokenLeg[];
  volume_usd: number;
  block_timestamp: string;
  transaction_hash: string;
  source_type: string;
}

// The /profiler/address/transactions endpoint returns a paginated `data` array.
// Note: there is NO lifetime `total_count` — only this page + `is_last_page`.
export interface NansenTransactionsResponse {
  pagination: NansenPagination;
  data: NansenTransaction[];
}

export interface NansenAddressEnrichment {
  address: string;
  chain: string;
  currentBalance: NansenCurrentBalanceResponse | null;
  pnlSummary: NansenPnLSummaryResponse | null;
  transactions: NansenTransactionsResponse | null;
  cachedAt: number;
  error?: string;
}
