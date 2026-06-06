import { Injectable, Logger } from '@nestjs/common';
import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { mantleSepoliaTestnet } from 'viem/chains';

const abi = [
  {
    inputs: [
      { internalType: 'string', name: 'txHash', type: 'string' },
      { internalType: 'string', name: 'pattern', type: 'string' },
      { internalType: 'string', name: 'riskLevel', type: 'string' },
      { internalType: 'uint256', name: 'confidence', type: 'uint256' },
    ],
    name: 'logAlert',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'getRecordCount',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

export interface AlertLogStats {
  address: string;
  recordCount: number | null;
  explorerUrl: string;
}

@Injectable()
export class AlertLogService {
  private readonly logger = new Logger(AlertLogService.name);
  private readonly contractAddress = process.env
    .CONTRACT_ADDRESS as `0x${string}`;
  private readonly privateKey = process.env.PRIVATE_KEY as `0x${string}`;

  async logAlert(
    txHash: string,
    pattern: string,
    riskLevel: string,
    confidence: number,
  ): Promise<number | null> {
    if (!this.contractAddress || !this.privateKey) {
      this.logger.warn(
        'Missing CONTRACT_ADDRESS or PRIVATE_KEY, skipping on-chain log',
      );
      return null;
    }

    try {
      const account = privateKeyToAccount(this.privateKey);
      const client = createWalletClient({
        account,
        chain: mantleSepoliaTestnet,
        transport: http('https://rpc.sepolia.mantle.xyz'),
      });

      const hash = await client.writeContract({
        address: this.contractAddress,
        abi,
        functionName: 'logAlert',
        args: [
          txHash,
          pattern,
          riskLevel,
          BigInt(Math.round(confidence * 100)),
        ],
      });

      this.logger.log(
        `On-chain alert logged: tx=${hash.slice(0, 12)}… id=${txHash.slice(0, 12)}…`,
      );
      return 1; // Return success indicator
    } catch (e: any) {
      this.logger.warn(`On-chain logging failed: ${e?.message}`);
      return null;
    }
  }

  /**
   * Read-only audit stats for the /contract command. Returns null when on-chain
   * logging isn't configured; degrades to recordCount: null if the read fails.
   */
  async getStats(): Promise<AlertLogStats | null> {
    if (!this.contractAddress) return null;

    const explorerUrl = `https://sepolia.mantlescan.xyz/address/${this.contractAddress}`;

    try {
      const client = createPublicClient({
        chain: mantleSepoliaTestnet,
        transport: http('https://rpc.sepolia.mantle.xyz'),
      });
      const count = await client.readContract({
        address: this.contractAddress,
        abi,
        functionName: 'getRecordCount',
      });
      return {
        address: this.contractAddress,
        recordCount: Number(count),
        explorerUrl,
      };
    } catch (e: any) {
      this.logger.warn(`Failed to read getRecordCount: ${e?.message}`);
      return { address: this.contractAddress, recordCount: null, explorerUrl };
    }
  }
}
