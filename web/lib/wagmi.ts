import { getConfig } from "@mezo-org/passport";

// Passport's types require a WalletConnect id. Injected and Bitcoin wallets
// work without a real one, only the WalletConnect QR flow needs it.
const projectId = process.env.NEXT_PUBLIC_WC_PROJECT_ID ?? "kiln-local-dev";

export const wagmiConfig = getConfig({
  appName: "Kiln",
  walletConnectProjectId: projectId,
  // passport defaults to mainnet, we only run on testnet for now
  mezoNetwork: "testnet",
  
});
