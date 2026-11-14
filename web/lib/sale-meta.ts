import type { Address } from "viem";
import { mezoPublicClient } from "./mezo";
import { parseAbi } from "viem";

/**
 * The sale contracts have no name, symbol or tagline field, so that lives
 * here. Order of trust: the token's own name()/symbol(), then public/sale-meta.json
 * (committed, keyed by sale address), then what this browser saved at creation.
 */
export interface SaleMeta {
  name?: string;
  symbol?: string;
  tagline?: string;
}

const metaAbi = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
]);

const LOCAL_KEY = "kiln:sale-meta";

export async function readTokenMeta(token: Address): Promise<Pick<SaleMeta, "name" | "symbol">> {
  const client = mezoPublicClient();
  const [name, symbol] = await Promise.all([
    client.readContract({ address: token, abi: metaAbi, functionName: "name" }).catch(() => undefined),
    client.readContract({ address: token, abi: metaAbi, functionName: "symbol" }).catch(() => undefined),
  ]);
  return { name, symbol };
}

function readLocal(): Record<string, SaleMeta> {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) ?? "{}");
  } catch {
    return {};
  }
}

/** Remember what the creator typed, for sales made from this browser. */
export function saveSaleMeta(sale: Address, meta: SaleMeta) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify({ ...readLocal(), [sale.toLowerCase()]: meta }));
  } catch {
    // storage can be blocked, the on-chain token fallback still works
  }
}

let fileCache: Promise<Record<string, SaleMeta>> | null = null;
function readFile(): Promise<Record<string, SaleMeta>> {
  fileCache ??= fetch("/sale-meta.json")
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({}));
  return fileCache;
}

export async function resolveSaleMeta(sale: Address, token: Address): Promise<SaleMeta> {
  const key = sale.toLowerCase();
  const [onchain, file] = await Promise.all([readTokenMeta(token), readFile()]);
  const local = readLocal()[key];
  return {
    tagline: file[key]?.tagline ?? local?.tagline,
    name: onchain.name ?? file[key]?.name ?? local?.name,
    symbol: onchain.symbol ?? file[key]?.symbol ?? local?.symbol,
  };
}
