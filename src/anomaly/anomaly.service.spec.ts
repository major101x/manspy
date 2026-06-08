import { AnomalyService } from './anomaly.service';
import { AddressLabelService } from '../common/chain-intel/address-label.service';
import { RecentTxBufferService } from '../common/chain-intel/recent-tx-buffer.service';
import { FlowAggregatorService } from '../common/chain-intel/flow-aggregator.service';
import { AlertLogService } from '../web3/alert-log.service';

const ADDR = '0x0000004eba872864a71b957180eb17dff71bb8f1';

describe('AnomalyService.analyzeWallet', () => {
  let service: AnomalyService;
  let labels: { lookupWithEnrichment: jest.Mock };
  let flow: { computeAddressActivity: jest.Mock };
  let groqCreate: jest.Mock;

  beforeEach(() => {
    process.env.GROQ_API_KEY = 'test-key'; // OpenAI client requires a key at construction
    labels = { lookupWithEnrichment: jest.fn() };
    flow = { computeAddressActivity: jest.fn() };
    service = new AnomalyService(
      labels as unknown as AddressLabelService,
      {} as RecentTxBufferService,
      flow as unknown as FlowAggregatorService,
      {} as AlertLogService,
    );
    // Replace the Groq client created in the constructor.
    groqCreate = jest.fn();
    (service as any).ai = { chat: { completions: { create: groqCreate } } };
  });

  function mockVerdict() {
    groqCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              pattern: 'cex_withdrawal',
              risk_level: 'low',
              summary: 'Bybit Hot Wallet',
              confidence: 0.9,
            }),
          },
        },
      ],
    });
  }

  it('classifies a known entity without calling Nansen-derived Groq on empty data', async () => {
    labels.lookupWithEnrichment.mockResolvedValue({
      label: { name: 'Bybit Hot Wallet', type: 'cex' },
      nansen: null,
    });
    flow.computeAddressActivity.mockReturnValue({ netUsd: 0, txCount: 0 });
    mockVerdict();

    const a = await service.analyzeWallet(ADDR);
    expect(a.hasData).toBe(true);
    expect(a.label).toBe('Bybit Hot Wallet');
    expect(a.verdict?.pattern).toBe('cex_withdrawal');
    expect(groqCreate).toHaveBeenCalledTimes(1);
  });

  it('maps Nansen holdings, PnL, sampled activity, and harvests its label', async () => {
    labels.lookupWithEnrichment.mockResolvedValue({
      label: null, // not in our curated list — should fall back to Nansen's label
      nansen: {
        address: ADDR,
        currentBalance: {
          data: [
            { token_symbol: 'USDe', value_usd: 2_100_000 },
            { token_symbol: 'mETH', value_usd: 1_300_000 },
          ],
        },
        pnlSummary: { realized_pnl_usd: 45_000, win_rate: 0.68 },
        transactions: {
          pagination: { page: 1, per_page: 100, is_last_page: false },
          data: [
            {
              tokens_sent: [],
              tokens_received: [
                {
                  from_address: '0xd8169f099ce16c87a99d2a8494023574b5eea9c5',
                  to_address: ADDR,
                  to_address_label: '🏦 Bybit: Deposit [0x000000]',
                  from_address_label: '🏦 Bybit: Hot Wallet [0xd8169f]',
                },
              ],
              volume_usd: 7785,
            },
          ],
        },
      },
    });
    flow.computeAddressActivity.mockReturnValue({ netUsd: 120_000, txCount: 4 });
    mockVerdict();

    const a = await service.analyzeWallet(ADDR);
    expect(a.hasData).toBe(true);
    expect(a.holdingsUsd).toBe(3_400_000);
    expect(a.topHoldings[0]).toEqual({ symbol: 'USDe', valueUsd: 2_100_000 });
    expect(a.realizedPnlUsd).toBe(45_000);
    expect(a.winRate).toBe(0.68);
    expect(a.nansenTxCount30d).toBe(1);
    expect(a.nansenMoreTx).toBe(true); // is_last_page: false
    expect(a.label).toBe('Bybit: Deposit'); // harvested + cleaned from Nansen leg
    expect(a.recentNetUsd).toBe(120_000);
    expect(a.recentTxCount).toBe(4);
  });

  it('short-circuits before Groq when nothing is known', async () => {
    labels.lookupWithEnrichment.mockResolvedValue({ label: null, nansen: null });
    flow.computeAddressActivity.mockReturnValue({ netUsd: 0, txCount: 0 });

    const a = await service.analyzeWallet(ADDR);
    expect(a.hasData).toBe(false);
    expect(a.verdict).toBeNull();
    expect(groqCreate).not.toHaveBeenCalled();
  });

  it('returns a verdict-less analysis when Groq fails', async () => {
    labels.lookupWithEnrichment.mockResolvedValue({
      label: { name: 'Bybit Hot Wallet', type: 'cex' },
      nansen: null,
    });
    flow.computeAddressActivity.mockReturnValue({ netUsd: 0, txCount: 0 });
    groqCreate.mockRejectedValue(new Error('groq down'));

    const a = await service.analyzeWallet(ADDR);
    expect(a.hasData).toBe(true);
    expect(a.verdict).toBeNull();
  });
});
