"use client";

import { useState } from "react";
import { RainbowKitProvider, lightTheme } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { mezoTestnet } from "@mezo-org/passport";
import { wagmiConfig } from "@/lib/wagmi";
import { KilnProvider } from "./kiln-context";
import { Shell } from "./shell";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          initialChain={mezoTestnet}
          theme={lightTheme({ accentColor: "#1d1d1f", borderRadius: "large" })}
        >
          <KilnProvider>
            <Shell>{children}</Shell>
          </KilnProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
