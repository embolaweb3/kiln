"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useWallet } from "./wallet";
import { EmptyState } from "./ui";

export function ConnectGate({ children, what }: { children: React.ReactNode; what: string }) {
  const { connected } = useWallet();
  if (connected) return <>{children}</>;
  return (
    <EmptyState
      title="Connect a wallet"
      body={`Connect to ${what}. Bitcoin wallets work through Mezo Passport.`}
      action={<ConnectButton label="Connect wallet" />}
    />
  );
}
