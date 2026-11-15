"use client";

import { useAccount } from "wagmi";
import type { Address } from "viem";

export function useWallet(): { address: Address | undefined; connected: boolean } {
  const { address, isConnected } = useAccount();
  return { address, connected: isConnected };
}
