import type { WalletClient } from "viem";
import { createFixtureClient } from "@/dev-fixtures";
import { createChainClient } from "./kiln-chain";
import type { KilnClient } from "./types";

export * from "./types";
export { KilnNotDeployedError } from "./deployments";

export const USE_FIXTURES = process.env.NEXT_PUBLIC_USE_FIXTURES === "true";

export function createKilnClient(getWallet: () => WalletClient | undefined): KilnClient {
  return USE_FIXTURES ? createFixtureClient(getWallet) : createChainClient({ getWallet });
}
