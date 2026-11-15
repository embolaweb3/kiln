# Kiln web

Next 14 (app router), React 18, wagmi 2, viem, anime.js.

## Wallet connection
Mezo Passport 0.17.2 is integrated (`lib/wagmi.ts`, `components/providers.tsx`) and builds. Passport pins React 18 and wagmi 2, which is why this app is on Next 14 and wagmi 2.14.16 (newer wagmi pulls a connector that fails to resolve `@x402/evm`). Notes:
- `next.config.mjs` transpiles the orangekit packages, they ship raw TypeScript.
- The wallet tree is client-only, Passport touches `document` while building its config.
- `getConfig` needs a WalletConnect id (`NEXT_PUBLIC_WC_PROJECT_ID`). Injected and Bitcoin wallets work without it.
- Not yet tested against a real Bitcoin wallet. If Passport misbehaves in a live demo, swap `lib/wagmi.ts` for plain wagmi connectors.

## Data modes
`NEXT_PUBLIC_USE_FIXTURES=true` serves sales, tiers and contributions from `dev-fixtures/`. Mezo position reads and `borrowMusd` hit Mezo testnet either way (addresses and ABIs in `lib/mezo.ts`, from `docs/mezo-integration.md`). `NEXT_PUBLIC_FIXTURE_POSITION=near-liquidation|healthy` overrides the position read to demo health states.

With fixtures off the app uses `lib/kiln-chain.ts`, a viem client written against `contracts/abi/*.json`.
- `npm run sync` (also runs before dev and build) copies the ABIs into `lib/abi/` and `contracts/deployments/testnet.json` into `public/deployments/`. The deployment file is fetched at runtime, so new addresses only need that file replaced.
- With no deployment file every Kiln call throws `KilnNotDeployedError`.
- Writes approve first with a plain `approve` (MUSD before contribute, MEZO before stake, MEZO and the sale token before createSale), then simulate, send and wait for the receipt. Contract reverts are mapped to plain messages in `lib/errors.ts`.
- Sale name and symbol are not on-chain. `lib/sale-meta.ts` reads them from the sale token, then `public/sale-meta.json`, then what the creating browser saved.

## Fork test
`scripts/fork-e2e.ts` runs the chain client through borrow, stake, contribute, finalize, claim, veto, refunds, release and unstake against an anvil fork. Notes from setting it up:
- Start anvil with `--hardfork london`, Mezo blocks have no blob gas fields.
- MEZO and the oracle (`0x7b7c…0015`) are precompiles anvil cannot run. Deploy with `MEZO_ADDRESS` set to a MockERC20, and MUSD is funded by impersonating the PCV contract, so the real `openTrove` is not exercised end to end.
- `Deploy.s.sol` writes to `contracts/deployments/`, which has to exist first.

Copy `.env.example` to `.env.local` to start.
