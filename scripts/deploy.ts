import { createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { mantleSepoliaTestnet } from 'viem/chains';
import { readFileSync } from 'fs';
import { join } from 'path';

const contractJson = JSON.parse(
  readFileSync(join(process.cwd(), 'contracts', 'ManSpyAlertLog.json'), 'utf-8'),
);

const abi = contractJson.abi;
const bytecode = '0x' + contractJson.evm.bytecode.object;

async function main() {
  const privateKey = process.env.PRIVATE_KEY as `0x${string}`;
  if (!privateKey) {
    console.error('PRIVATE_KEY env var not set');
    process.exit(1);
  }

  const account = privateKeyToAccount(privateKey);
  const client = createWalletClient({
    account,
    chain: mantleSepoliaTestnet,
    transport: http('https://rpc.sepolia.mantle.xyz'),
  });

  console.log('Deploying ManSpyAlertLog...');
  console.log('Account:', account.address);

  const hash = await client.deployContract({
    abi,
    bytecode: bytecode as `0x${string}`,
    args: [],
  });

  console.log('Transaction hash:', hash);
  console.log('Waiting for confirmation...');

  // Wait a bit for the transaction to be mined
  await new Promise((resolve) => setTimeout(resolve, 15000));

  console.log('Deployment complete!');
  console.log('');
  console.log('Next steps:');
  console.log('1. Check transaction status on https://explorer.sepolia.mantle.xyz/tx/' + hash);
  console.log('2. Once confirmed, copy the contract address');
  console.log('3. Add CONTRACT_ADDRESS=<address> to your .env');
}

main().catch((error) => {
  console.error('Deployment failed:', error);
  process.exit(1);
});
