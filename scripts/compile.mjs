#!/usr/bin/env node
/**
 * Compile contracts/TestToken.sol with solc-js and write the ABI + bytecode to
 * contracts/TestToken.json. The artifact is committed, so the app and the
 * deploy script never need a Solidity toolchain.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import solc from 'solc';

const source = readFileSync('contracts/TestToken.sol', 'utf8');
const input = {
  language: 'Solidity',
  sources: { 'TestToken.sol': { content: source } },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    evmVersion: 'cancun',
    outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } },
  },
};

const output = JSON.parse(solc.compile(JSON.stringify(input)));
const errors = (output.errors ?? []).filter(e => e.severity === 'error');
if (errors.length) {
  for (const e of errors) console.error(e.formattedMessage);
  process.exit(1);
}

const contract = output.contracts['TestToken.sol'].TestToken;
writeFileSync(
  'contracts/TestToken.json',
  JSON.stringify({ compiler: solc.version(), abi: contract.abi, bytecode: `0x${contract.evm.bytecode.object}` }, null, 2),
);
console.log(`compiled TestToken with solc ${solc.version()} (${contract.evm.bytecode.object.length / 2} bytes)`);
