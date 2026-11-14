import type { Address } from "viem";

export class KilnNotDeployedError extends Error {
  constructor(detail = "contracts/deployments/testnet.json has not been published yet") {
    super(`Kiln contracts are not deployed: ${detail}. Set NEXT_PUBLIC_USE_FIXTURES=true to use sample data.`);
    this.name = "KilnNotDeployedError";
  }
}

/** Shape written by contracts/script/Deploy.s.sol. Only addresses are read. */
export interface Deployment {
  chainId: number;
  musd: Address;
  mezo: Address;
  MezoTierVault: Address;
  KilnFactory: Address;
  TeamBond: Address;
  demoTokens?: Record<string, Address>;
}

const REQUIRED = ["musd", "mezo", "MezoTierVault", "KilnFactory", "TeamBond"] as const;
const isAddr = (v: unknown) => typeof v === "string" && /^0x[0-9a-fA-F]{40}$/.test(v);

let cached: Promise<Deployment> | null = null;

/**
 * Fetched at runtime from public/deployments/testnet.json, so new addresses
 * need a file swap and not a rebuild.
 */
export function loadDeployment(): Promise<Deployment> {
  cached ??= fetch("/deployments/testnet.json", { cache: "no-store" }).then(
    async (r) => {
      if (!r.ok) throw new KilnNotDeployedError();
      const json = (await r.json()) as Partial<Deployment>;
      const missing = REQUIRED.filter((k) => !isAddr(json[k]));
      if (missing.length) throw new KilnNotDeployedError(`deployment file is missing ${missing.join(", ")}`);
      return json as Deployment;
    },
    () => {
      throw new KilnNotDeployedError("could not fetch the deployment file");
    },
  );
  // a failed load shouldn't be cached forever
  cached.catch(() => {
    cached = null;
  });
  return cached;
}

/** Test hook: lets a script hand in a deployment without a server. */
export function setDeploymentForTests(d: Deployment | null) {
  cached = d ? Promise.resolve(d) : null;
}
