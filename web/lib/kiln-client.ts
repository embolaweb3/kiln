import type { WalletClient } from "viem";
import { createFixtureClient } from "@/dev-fixtures";
import { borrowMusdOnMezo, readBorrowPosition } from "./mezo";
import type { KilnClient } from "./types";

export * from "./types";

export const USE_FIXTURES = process.env.NEXT_PUBLIC_USE_FIXTURES === "true";

export class KilnNotDeployedError extends Error {
  constructor() {
    super(
      "Kiln contracts are not wired yet. Set NEXT_PUBLIC_USE_FIXTURES=true or add the deployment.",
    );
    this.name = "KilnNotDeployedError";
  }
}

const notDeployed = async (): Promise<never> => {
  throw new KilnNotDeployedError();
};

/**
 * Chain-backed client. The Mezo side (position read, borrow) is real already.
 * Kiln contract calls get replaced once contracts/deployments/testnet.json
 * and the ABIs land from the contracts branch.
 */
function createChainClient(getWallet: () => WalletClient | undefined): KilnClient {
  return {
    listSales: notDeployed,
    getSale: notDeployed,
    getMyTier: notDeployed,
    getMyContributions: notDeployed,
    stakeMezo: notDeployed,
    unstakeMezo: notDeployed,
    contribute: notDeployed,
    claim: notDeployed,
    refund: notDeployed,
    createSale: notDeployed,
    vetoRelease: notDeployed,
    releaseTranche: notDeployed,
    getBorrowPosition: readBorrowPosition,
    async borrowMusd(input) {
      const w = getWallet();
      if (!w) throw new Error("Wallet not connected");
      return borrowMusdOnMezo(w, input);
    },
  };
}

export function createKilnClient(getWallet: () => WalletClient | undefined): KilnClient {
  return USE_FIXTURES ? createFixtureClient(getWallet) : createChainClient(getWallet);
}
