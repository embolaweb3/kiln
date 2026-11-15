"use client";

import { createContext, useContext, useEffect, useMemo, useRef } from "react";
import { useAccount, useWalletClient } from "wagmi";
import { setPassportWallet } from "@/lib/errors";
import { createKilnClient, type KilnClient } from "@/lib/kiln-client";

const Ctx = createContext<KilnClient | null>(null);

export function KilnProvider({ children }: { children: React.ReactNode }) {
  const { data: wallet } = useWalletClient();
  const { connector } = useAccount();
  // orangekit connector ids are all "orangekit-<wallet>"
  const isPassport = connector?.id?.startsWith("orangekit") ?? false;
  useEffect(() => setPassportWallet(isPassport), [isPassport]);
  const walletRef = useRef(wallet);
  walletRef.current = wallet;
  // the client reads the wallet lazily so it stays stable across reconnects
  const client = useMemo(() => createKilnClient(() => walletRef.current), []);
  return <Ctx.Provider value={client}>{children}</Ctx.Provider>;
}

export function useKiln(): KilnClient {
  const c = useContext(Ctx);
  if (!c) throw new Error("useKiln outside KilnProvider");
  return c;
}
