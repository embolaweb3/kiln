import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createPublicClient, createWalletClient, defineChain, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

export const mezoTestnet = defineChain({
  id: 31611,
  name: "Mezo Testnet",
  nativeCurrency: { name: "Bitcoin", symbol: "BTC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.test.mezo.org"] } },
  blockExplorers: {
    default: { name: "Mezo Explorer", url: "https://explorer.test.mezo.org" },
  },
});

export const EXPLORER = "https://explorer.test.mezo.org";
export const txLink = (hash: string) => `${EXPLORER}/tx/${hash}`;

export const publicClient = createPublicClient({
  chain: mezoTestnet,
  transport: http(undefined, { retryCount: 4, retryDelay: 500 }),
});

// The key lives outside the repo on purpose.
const KEY_FILE =
  process.env.KILN_KEY_FILE ?? join(homedir(), ".config", "kiln-verify", "deployer.key");

export function loadAccount() {
  const raw = readFileSync(KEY_FILE, "utf8").trim();
  return privateKeyToAccount(raw as `0x${string}`);
}

export function walletFor(account = loadAccount()) {
  return createWalletClient({
    account,
    chain: mezoTestnet,
    transport: http(undefined, { retryCount: 4, retryDelay: 500 }),
  });
}
