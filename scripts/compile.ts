import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import solc from 'solc';

const sourcePath = join(process.cwd(), 'contracts', 'ManSpyAlertLog.sol');
const source = readFileSync(sourcePath, 'utf-8');

const input = {
  language: 'Solidity',
  sources: {
    'ManSpyAlertLog.sol': {
      content: source,
    },
  },
  settings: {
    outputSelection: {
      '*': {
        '*': ['abi', 'evm.bytecode'],
      },
    },
  },
};

const output = JSON.parse(solc.compile(JSON.stringify(input)));

if (output.errors) {
  const hasError = output.errors.some((e: any) => e.severity === 'error');
  if (hasError) {
    console.error('Compilation errors:', output.errors);
    process.exit(1);
  }
}

const contract = output.contracts['ManSpyAlertLog.sol']['ManSpyAlertLog'];

writeFileSync(
  join(process.cwd(), 'contracts', 'ManSpyAlertLog.json'),
  JSON.stringify(contract, null, 2),
);

console.log('Compilation successful!');
console.log('Bytecode length:', contract.evm.bytecode.object.length);
console.log('ABI functions:', contract.abi.length);
