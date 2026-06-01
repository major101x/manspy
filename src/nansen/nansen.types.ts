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

export interface NansenTransaction {
  tx_hash: string;
  block_number: number;
  timestamp: string;
  from: string;
  to: string;
  value_usd: number;
  token_symbol?: string;
  tx_type: string;
}

export interface NansenTransactionsResponse {
  address: string;
  chain: string;
  total_count: number;
  items: NansenTransaction[];
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
