# Kiln web

Next 14 (app router), React 18, wagmi 2, viem, anime.js.

## Wallet connection
Mezo Passport 0.17.2 is integrated (`lib/wagmi.ts`, `components/providers.tsx`) and builds. Passport pins React 18 and wagmi 2, which is why this app is on Next 14 and wagmi 2.14.16 (newer wagmi pulls a connector that fails to resolve `@x402/evm`). Notes:
- `next.config.mjs` transpiles the orangekit packages, they ship raw TypeScript.
- The wallet tree is client-only, Passport touches `document` while building its config.
- `getConfig` needs a WalletConnect id (`NEXT_PUBLIC_WC_PROJECT_ID`). Injected and Bitcoin wallets work without it.
- Not yet tested against a real Bitcoin wallet. If Passport misbehaves in a live demo, swap `lib/wagmi.ts` for plain wagmi connectors.

## Data modes
`NEXT_PUBLIC_USE_FIXTURES=true` serves sales, tiers and contributions from `dev-fixtures/`. Mezo position reads and `borrowMusd` always hit Mezo testnet using the addresses and ABIs in `lib/mezo.ts` (sourced from `docs/mezo-integration.md`). `NEXT_PUBLIC_FIXTURE_POSITION=near-liquidation|healthy` overrides the position read to demo health states.

With fixtures off, Kiln contract calls throw `KilnNotDeployedError` until the contract deployment and ABIs are wired into `lib/kiln-client.ts`.

Copy `.env.example` to `.env.local` to start.
