import { Wallet } from "ethers";
import process from "node:process";

function parseArgs(argv) {
  const result = {};
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const value = argv[i + 1];
    if (value && !value.startsWith("--")) {
      result[key] = value;
      i++;
    } else {
      result[key] = true;
    }
  }
  return result;
}

const args = parseArgs(process.argv);

const privateKey =
  args.key || process.env.WALLET_PRIVATE_KEY || process.env.CHAIN_PRIVATE_KEY;
if (!privateKey || !privateKey.startsWith("0x")) {
  console.error(
    "Missing private key. Pass with --key or set WALLET_PRIVATE_KEY / CHAIN_PRIVATE_KEY."
  );
  process.exit(1);
}

let message = args.message || process.env.MESSAGE;

const address = args.address || process.env.WALLET_ADDRESS;
const nonce = args.nonce || process.env.NONCE;

if (!message && address && nonce) {
  message = `Registry Login\nAddress: ${address.toLowerCase()}\nNonce: ${nonce}`;
}

if (!message) {
  console.error(
    "Missing message. Provide --message or both --address and --nonce (or set MESSAGE env var)."
  );
  process.exit(1);
}

const wallet = new Wallet(privateKey);

const signature = await wallet.signMessage(message);
console.log(signature);
