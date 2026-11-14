# Mezo integration notes for Kiln

Research date: 2026-11-14. Sources read locally (shallow clones) unless noted:

- `mezo-org/musd` (`solidity/contracts/*`), cited as `musd:`
- `mezo-org/tigris` (`solidity/contracts/*`, `solidity/deployments/*`), cited as `tigris:`
- `mezo-org/documentation`, cited as `docs:`
- `@mezo-org/passport@0.17.2` npm tarball (README and `src/`)
- Live reads against the testnet RPC with `cast`

Tags used below:

- **[verified-code]** read in contract source
- **[verified-chain]** confirmed with an RPC call on testnet today
- **[docs]** stated in Mezo docs only
- **[UNVERIFIED]** not confirmed. Do not build on it without checking.

---

## 0. Things to know first

1. **Deadline.** The current Mezo Buildathon (third edition, on AKINDO) has final Wave 2 submissions due **Nov 15, 2026**, which is tomorrow. See section 6.
2. **This brief matches the older 2025 hackathon.** The "Mezo Passport required, working testnet demo, five-part rubric" wording comes from the Oct 2025 Mezo Hackathon, not the current Buildathon. The current rules say "MUSD and/or MEZO plus a working deployment". Passport is not mentioned. Check the AKINDO page for the real rules before relying on this brief.
3. **veMEZO has no confirmed testnet address.** The `VeMEZO` contract exists in tigris, but `tigris/solidity/deployments/testnet` has only veBTC. The docs list only veBTC addresses. veMEZO gating cannot be built until the address is found (section 2).
4. **The scaffolded web app conflicts with Passport.** `@mezo-org/passport@0.17.2` has peer deps `wagmi ^2.5.12`, `react ^18.2` and `@rainbow-me/rainbowkit ^2`. The scaffold installed wagmi 3.x and React 19 with Next 16. This needs fixing before any UI work (section 5).
5. **Mezo's own docs contradict each other on chain parameters.** `docs:.../developers/chains/index.md` gives chain IDs `mezo-testnet` and RPC `testnet-rpc.mezo.org`. `configure-environment.md` gives `31611` and `rpc.test.mezo.org`. Only the second one works, so treat the first page as unreliable.

---

## 1. Borrow positions (MUSD)

### Contract and functions

Entry point is `BorrowerOperations` (`musd:BorrowerOperations.sol`). It is an upgradeable proxy. A "position" is a **trove**, keyed by borrower address, **one per address**.

| Action | Function | Notes |
|---|---|---|
| Open | `openTrove(uint256 _debtAmount, address _upperHint, address _lowerHint) payable` | Collateral is **native BTC** sent as `msg.value`. The `msg.value` is used as collateral directly. |
| Add collateral | `addColl(upperHint, lowerHint) payable` | |
| Withdraw collateral | `withdrawColl(amount, upperHint, lowerHint)` | |
| Borrow more | `withdrawMUSD(amount, upperHint, lowerHint)` | |
| Repay | `repayMUSD(amount, upperHint, lowerHint)` | |
| Combined | `adjustTrove(collWithdrawal, debtChange, isDebtIncrease, upperHint, lowerHint) payable` | |
| Close | `closeTrove()` | Burns `debt − 200 MUSD`. The 200 MUSD gas compensation is refunded from the Gas Pool. Collateral goes back to the borrower. |
| Refinance | `refinance(upperHint, lowerHint)` | Moves the trove to the current rate. |
| Claim leftover | `claimCollateral()` | After redemption or liquidation surplus. |

All of these use `msg.sender` as borrower, caller and recipient (`_openTrove(msg.sender, msg.sender, ...)`, `BorrowerOperations.sol:180-318`).

Reads:

- `TroveManager.getEntireDebtAndColl(address)` returns coll, principal, interest and pending values.
- `TroveManager.getCurrentICR(address, price)`.
- `TroveManager.getTroveStatus(address)`.
- `HintHelpers.getApproxHint(...)` for the hint addresses. `SortedTroves` supplies the position insert.
- `PriceFeed.fetchPrice()`.

### Parameters

| Parameter | Value | Source |
|---|---|---|
| MCR (liquidation threshold) | 110% | `LiquityBase.sol:22` |
| CCR (recovery mode) | 150% | `LiquityBase.sol:25` |
| Gas compensation | 200 MUSD | `LiquityBase.sol:28`, [verified-chain] |
| Interest rate | fixed per trove at open time, 100 bps = 1% | `InterestRateManager.sol:88`, [verified-chain] `interestRate()` = 100 |
| One-time borrowing fee | 0.1% | [verified-chain] `getBorrowingFee(10000e18)` = 10e18 |
| **Min net debt** | **1,800 MUSD** | [verified-chain] `minNetDebt()` = 1.8e21 |

- Net debt is the requested amount plus the fee. Gas compensation is added on top as composite debt.
- Fee-exempt accounts exist (`governableVariables.isAccountFeeExempt`).
- In recovery mode the fee is skipped but the ICR must be at least CCR.
- BTC/USD on testnet read about 65,926 at research time.

### Can a contract act on a user's behalf?

There are two routes. The first is the contract-owns-trove route. If a contract calls `openTrove`, the contract is `msg.sender` and owns the trove. A sale contract opening troves this way makes **Kiln the borrower**. That means one trove per Kiln address, shared debt and liquidation, and Kiln holding user collateral. Not usable.

The second route is delegated opening by signature. `BorrowerOperationsSignatures` (`musd:BorrowerOperationsSignatures.sol`, address from `BorrowerOperations.borrowerOperationsSignaturesAddress()`, [verified-chain] `0xD757e3646AF370b15f32EB557F0F8380Df7D639e`) has:

- `openTroveWithSignature(debtAmount, upperHint, lowerHint, borrower, recipient, signature, deadline) payable`
- `addCollWithSignature`, `adjustTroveWithSignature`, `withdrawMUSDWithSignature`, `repayMUSDWithSignature`, `withdrawCollWithSignature`
- `closeTroveWithSignature`, `refinanceWithSignature`, `claimCollateralWithSignature`

Properties, from the source:

- **The trove is owned by `borrower`** (the signer). The signature authorizes the **MUSD recipient**, so `recipient` can be the Kiln sale contract.
- EIP-712 domain: name `"BorrowerOperationsSignatures"`, version `"1"`, `verifyingContract` = the signatures contract, plus chain ID. The open type is `OpenTrove(uint256 assetAmount,uint256 debtAmount,address borrower,address recipient,uint256 nonce,uint256 deadline)`.
- `assetAmount` is the **`msg.value` of the relaying call** (`BorrowerOperationsSignatures.sol:440-446`). The BTC is paid by whoever relays, not pulled from the borrower. So the user has to send the BTC in their own transaction.
- Nonce comes from `getNonce(borrower)`, which is incremented on use. The signature is checked with `ECDSA.recover`, so **EOA signatures only. There is no ERC-1271 support.**

**Cleanest single-flow UX, for EOA wallets:**

1. The user signs `OpenTrove(assetAmount=btc, debtAmount, borrower=user, recipient=KilnSale, nonce, deadline)`.
2. The user sends one transaction `Sale.contributeWithBorrow{value: btc}(debt, hints, sig, deadline, ...)`.
3. The sale calls `openTroveWithSignature{value: msg.value}`. MUSD is minted straight to the sale, and the sale credits the contribution to `user`.

That is one signature and one transaction: "borrow to participate". The signature path is effectively atomic.

**Passport Bitcoin wallets differ.** Passport routes transactions through a smart account on Mezo (`@mezo-org/orangekit`). That account is `msg.sender` for everything. For those users the signature path will not work (no ERC-1271). The fallback for them is two steps through their own account: `openTrove` (or `withdrawMUSD` if a trove exists), then `Sale.contribute(musd)`. Whether the smart account can batch both into one UserOp is [UNVERIFIED].

### Awkward points

- **Min net debt 1,800 MUSD.** The minimum contribution is effectively about $1,800 plus 200 MUSD of gas compensation locked in the trove. This is bad for small contributors. Alternatives: let users with an existing trove top up with `withdrawMUSD` (signature variant exists), or allow contribution from MUSD already held.
- **One trove per address.** A user with an open trove cannot call `openTroveWithSignature` (`_requireTroveisNotActive`). The UI must detect this and switch to `adjustTroveWithSignature` or `withdrawMUSDWithSignature`.
- **Refunds do not unwind debt.** If a sale fails and Kiln refunds the MUSD, the user still owes `debt + interest + fee`. To close they need the extra fee and interest in MUSD. The UI must say so.
- **The user's trove is liquidated at 110% ICR and can be redeemed** (MUSD redemptions hit low-ICR troves first). The UI should push users toward an ICR buffer such as 200% or more and show the current ICR. Kiln cannot protect users from this.
- Kiln never holds trove collateral in this design, which is a good thing for the security story.

---

## 2. MEZO and veMEZO power

### What exists

- **MEZO token:** `0x7B7c000000000000000000000000000000000001` [docs] mainnet. On testnet the same address has code and `symbol()` returns `"MEZO"` [verified-chain], and `totalSupply()` is readable. The address pattern `0x7B7c…` is shared with other Mezo system contracts (BTC is `0x7b7C…0000`). Whether this is a precompile or a normal ERC-20 is **[UNVERIFIED]**, so check `approve`/`transferFrom` behaviour before the bond contract depends on it. The tigris repo also has a plain `Mezo.sol` (OZ `ERC20Permit`). It is not necessarily what is deployed.
- **veMEZO:** `tigris:VeMEZO.sol`, a `VotingEscrow` configured with the MEZO token and a **4-year max lock** (min lock 1 week [docs]). It is an **ERC-721 NFT per lock.** Weight decays linearly. Permanent locks exist (`lockPermanent`).
- **Testnet veMEZO address: [UNVERIFIED], not found.** tigris `deploy/` scripts deploy only veBTC (`08_deploy_ve_btc.ts`). Docs have no veMEZO address. Check the Mezo app or explorer, or ask in Discord.

### Reading power on-chain

`VotingEscrow` (inherited by `VeMEZO`) [verified-code, `tigris:VotingEscrow.sol`]:

```
balanceOf(address owner) -> uint256              // number of NFTs
ownerToNFTokenIdList(address owner, uint256 i) -> uint256   // enumerate token IDs
ownerOf(uint256 tokenId) -> address
balanceOfNFT(uint256 tokenId) -> uint256         // current voting weight
balanceOfNFTAt(uint256 tokenId, uint256 t) -> uint256       // weight at timestamp t
locked(uint256 tokenId) -> (amount, end, isPermanent)       // IVotingEscrow.LockedBalance; field names not read
totalSupply() / totalSupplyAt(uint256 t) / getPastTotalSupply(t)
getPastVotes(address account, uint256 tokenId, uint256 t)   // delegation checkpoints
```

A user's total power is the sum of `balanceOfNFT` over their NFTs. There is no single "power of address" function.

### Snapshot support and the sybil problem

- `balanceOfNFTAt(tokenId, t)` gives a historical weight per **token**. It does not record who owned the token at `t`.
- The NFTs are transferable. Using `ownerOf(tokenId)` now with a past snapshot lets one NFT be passed between wallets, each claiming allocation.
- **Fix:** a registration window before the sale. Each `tokenId` can be registered **once**, with the tier computed from `balanceOfNFTAt(tokenId, saleSnapshotTime)`. After registration the NFT moving does not matter.
- Whether `getPastVotes` suits a per-account snapshot is [UNVERIFIED]. It takes a `tokenId` argument and I did not trace the checkpoint semantics.
- Voting escrows can be flash-lent. Using a snapshot timestamp in the past, rather than the live weight, avoids that.

### Fallbacks if veMEZO is not on testnet

- Gate on **veBTC** instead. It is deployed and verified (`VeBTC` `0xB63fcCd03521Cf21907627bd7fA465C129479231`, `token()` returns the BTC contract). Max lock is 28 days [docs], so it is weaker as a commitment signal.
- Deploy Kiln's own `VotingEscrow` for MEZO from tigris source as a testnet stand-in, clearly labelled. That keeps the design intact but weakens the "built into Mezo" story.
- Gate on plain MEZO balance snapshot. Easy, but weakest as a commitment signal and flash-loanable.

### Team bond constraint

veMEZO has **no slashing hook**, and a locked NFT is controlled by its owner. So "lock MEZO as a quality bond" cannot be done by locking into veMEZO. The bond must sit in a **Kiln-owned escrow holding plain MEZO**, and slashing must be implemented there. Mezo's token has no burn function in `Mezo.sol`, so slashed MEZO goes to a treasury or a contributor refund pool, not a burn.

---

## 3. DEX

**Mezo Pools, Aerodrome/Velodrome-style.** Source is `tigris` (Solidly-inspired). Two kinds [docs]:

- **Basic pools:** constant-product (volatile) and stable-curve pools with fungible ERC-20 LP tokens. Fee 0.30% volatile, 0.02% stable.
- **Concentrated liquidity (CL):** Slipstream-based, NFT positions.

Testnet addresses [docs] with [verified-chain] where noted:

| Contract | Address |
|---|---|
| Router | `0x9a1ff7FE3a0F69959A3fBa1F1e5ee18e1A9CD7E9` (code present) |
| PoolFactory | `0x4947243CC818b627A5D06d14C4eCe7398A23Ce1A` (is `Router.defaultFactory()`) |
| MUSD/BTC pool (volatile) | `0xd16A5Df82120ED8D626a1a15232bFcE2366d6AA9` (also returned by `getPool(MUSD, BTC, false)`) |
| MUSD/mUSDC pool | `0x525F049A4494dA0a6c87E3C4df55f9929765Dc3e` |
| MUSD/mUSDT pool | `0x27414B76CF00E24ed087adb56E26bAeEEe93494e` |
| CLFactory | `0x7B61BC8Aa460476d142F1CD107A47297002f69ff` |
| CLSwapRouter | `0x3112908bB72ce9c26a321Eeb22EC8e051F3b6E6a` |
| NonfungiblePositionManager | `0x9B753e11bFEd0D88F6e1D2777E3c7dac42F96062` |

### Seeding interface (`tigris:Router.sol`) [verified-code]

```
addLiquidity(address tokenA, address tokenB, bool stable,
             uint256 amountADesired, uint256 amountBDesired,
             uint256 amountAMin, uint256 amountBMin,
             address to, uint256 deadline)
    returns (uint256 amountA, uint256 amountB, uint256 liquidity)
quoteAddLiquidity(tokenA, tokenB, stable, factory, amountADesired, amountBDesired)
poolFor(tokenA, tokenB, stable, factory)
swapExactTokensForTokens(amountIn, amountOutMin, Route[] routes, to, deadline)
// Route { address from; address to; bool stable; address factory; }
```

- `_addLiquidity` **creates the pool if missing** (calls `PoolFactory.createPool` when `getPool` is empty), so a new project-token/MUSD pool needs no separate setup.
- The Router pulls with `transferFrom(msg.sender, pool, amount)`, so the seeder contract must approve the Router for both tokens.
- LP tokens are minted to `to`. The first mint permanently locks `MINIMUM_LIQUIDITY` (1000) at `address(1)`.
- Use **volatile** (`stable=false`) for a launch token. Stable pools require balanced initial deposits (`DepositsNotEqual`).
- For a trustworthy launch, Kiln should send the LP tokens to a **time-lock contract** rather than to the team.
- Seeding at the sale price avoids a first-swap price manipulation. Pool price is set by the ratio of the first deposit.
- Gauges and emissions apply to CL pools and listed pools only. A new volatile pool earns no MEZO emissions unless added to voting. That does not block the launch.

---

## 4. Testnet reference

| Item | Value | Status |
|---|---|---|
| Chain ID | `31611` | [verified-chain] `cast chain-id` |
| RPC (HTTPS) | `https://rpc.test.mezo.org` | [verified-chain] (one TLS error seen in ~20 calls, so retry) |
| RPC (WSS) | `wss://rpc-ws.test.mezo.org` | [docs] |
| Explorer | `https://explorer.test.mezo.org` | [docs] |
| Faucet | `https://faucet.test.mezo.org` (testnet BTC, CAPTCHA) | [docs] |
| Native currency | BTC, 18 decimals | [docs] |
| EVM version | `london` (Mezo docs set this in `foundry.toml`) | [docs] |
| Solc used by Mezo docs | 0.8.28 | [docs] |

**Testnet MUSD cannot be got from the faucet.** It has to be borrowed [docs:`x402-quickstart.mdx`]. Kiln demos therefore need an open trove first.

Contracts (testnet), [verified-chain] by reading from `BorrowerOperations`:

| Contract | Address |
|---|---|
| MUSD token | `0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503` (18 decimals, symbol `MUSD`, ERC20Permit) |
| BorrowerOperations (proxy) | `0xCdF7028ceAB81fA0C6971208e83fa7872994beE5` |
| BorrowerOperationsSignatures | `0xD757e3646AF370b15f32EB557F0F8380Df7D639e` |
| TroveManager | `0xE47c80e8c23f6B4A1aE41c34837a0599D5D16bb0` |
| SortedTroves | `0x722E4D24FD6Ff8b0AC679450F3D91294607268fA` (`getSize()` = 331) |
| HintHelpers | `0x4e4cBA3779d56386ED43631b4dCD6d8EacEcBCF6` ([docs] only) |
| PriceFeed | `0x86bCF0841622a5dAC14A313a15f96A95421b9366` (`fetchPrice()` works) |
| InterestRateManager | `0xD4D6c36A592A2c5e86035A6bca1d57747a567f37` |
| PCV | `0x4dDD70f4C603b6089c07875Be02fEdFD626b80Af` |
| MEZO token | `0x7B7c000000000000000000000000000000000001` (symbol `MEZO`) |
| veBTC | `0xB63fcCd03521Cf21907627bd7fA465C129479231` |
| **veMEZO** | **[UNVERIFIED] not found** |

MUSD notes: `transfer`/`transferFrom` revert when `to == address(this)` (the MUSD contract itself), which does not affect Kiln. MUSD supports `permit` (EIP-2612), so `contribute` can take a permit signature instead of a separate approve.

---

## 5. Mezo Passport (frontend)

Package: `@mezo-org/passport` (latest 0.17.2, 2026-01-27). Built on RainbowKit.

Requirements [verified from package.json peer deps and `src/config.ts`]:

- Peers: `viem ^2.22.8`, `react ^18.2.0`, `wagmi ^2.5.12`, `@tanstack/react-query ^5.28.4`, `@rainbow-me/rainbowkit ^2.0.2`.
- `getConfig({ appName, walletConnectProjectId, mezoNetwork: "testnet" })`. The npm README says only `appName` is needed, but the **TypeScript type requires `walletConnectProjectId`**, and `mezoNetwork` **defaults to `"mainnet"`**, so testnet must be set explicitly.
- Wrap with `WagmiProvider`, `QueryClientProvider` and `RainbowKitProvider initialChain={mezoTestnet}`.
- Default wallets: Unisat, OKX, Xverse (Bitcoin group) plus WalletConnect (Ethereum group).
- Hooks: `useBitcoinAccount()`, `useSendTransaction()` (Mezo tx from the underlying account), `useSendBitcoin()`.
- Bitcoin wallets act through an **underlying smart account** (`walletAccount.accountAddress`). Reads, such as the trove query, must use that address, not the BTC address (see `src/hooks/useBorrowData.ts`).

**Conflict with the current scaffold:**

- `web/package.json` has `wagmi ^3.7.11` and React 19.3 (Next 16.4.6). Passport wants wagmi 2 and React 18. Using it as-is will fail peer resolution or break at runtime.
- Options: pin wagmi to 2.x, and either use Next 15 with React 18, or test Passport under React 19 with overrides. Whether Passport runs under React 19 is [UNVERIFIED].
- Not done in this session, to respect "no implementation". Flagged as the first task for the UI work.

---

## 6. Buildathon rules

Sources: [Mezo blog post "The Mezo Buildathon is underway"](https://mezo.org/blog/mezo-buildathon-is-underway/) (read in full), web search results, and the [AKINDO](https://app.akindo.io/) home page (listing only). **The AKINDO event page itself was not readable, and I found no official judging rubric for this edition.**

Verified from Mezo's blog:

- Third edition, started Fri Oct 16, 2026, with AKINDO, powered by Supernormal Foundation.
- Two tracks: **DeFi** (borrowing, lending, looping, yield with MUSD or MEZO) and **Access & Distribution**.
- **$7,000 in MEZO prizes**: Wave 1 (Oct 16-26) $2,000, Wave 2 (Nov 2-15) $5,000. **Final submissions due Nov 15, 2026.** Winners and demo session Nov 23.
- Every submission must integrate **MUSD and/or MEZO** and include a **working deployment**. Allowed chains: Mezo, Ethereum, Base, BSC. Mezo testnet submissions are welcome.
- Eligible Wave 1 projects advance to Wave 2. New projects and extensions are both fine.
- Follow-on: Supernormal Foundation's Ignition and Founder programs.

Not verified for this edition (third-party or other events):

- Submission pack (public repo, live link, deck, 2-minute pitch video) appeared in one third-party project README only. [UNVERIFIED]
- Payout in MEZO at a 14-day TWAP after KYB came from a third-party grants guide. [UNVERIFIED]
- AKINDO's general model is judges plus community scoring with points per wave. This is from AKINDO's generic pages and may not apply here. [UNVERIFIED]
- The **2025** Mezo Hackathon rubric was Mezo integration 30%, technical implementation 30%, business viability 20%, UX 10%, presentation 10%, with Passport required and a testnet demo. It was a different event. Use it only as a sensible quality bar.

Fit for Kiln: it is a clear **DeFi** track entry (borrow MUSD against BTC to take part in sales, MEZO tiers, MEZO bonds). MEZO and MUSD both appear in the core mechanics, which satisfies "MUSD and/or MEZO".

---

## 7. Proposed contract architecture

All contracts are Foundry, Solidity 0.8.x (`evm_version = london`), custom errors, NatSpec on externals, an event for every state change. Nothing is written yet.

### Components

1. **`KilnFactory` / `LaunchRegistry`**: creates a launch (sale, bond, escrow) per project and records parameters. Emits `LaunchCreated`.
2. **`Sale`** (one per launch):
   - Phases: bond posted, registration, contribution, finalize, claim, or refund.
   - Accepts MUSD only (`IERC20` plus `permit`).
   - Entry points: `contribute(amount)`, `contributeWithBorrow(...)` (signature route, section 1), `claim()`, `refund()`.
   - Accounting: per-user contribution, per-tier cap, soft cap, hard cap, and a pro-rata scale if oversubscribed (excess MUSD refunded).
3. **`AllocationGate`**: reads veMEZO (or the fallback). `register(tokenId)` records the weight at the snapshot timestamp and the tier. Each `tokenId` registers once. It returns `maxContribution(user)`.
4. **`TeamBond`**: holds the team's plain MEZO. States: `Posted`, `Active`, `PartiallySlashed`, `Released`. Slash decisions come from the milestone contract only. Slashed MEZO goes to the contributor refund pool or a treasury, since MEZO cannot be burned (section 2).
5. **`MilestoneEscrow`**: holds raised MUSD. Releases tranches per milestone. Needs one decision (below) on who attests a milestone. A missed deadline allows slashing the bond and enabling pro-rata MUSD refunds for the unreleased remainder.
6. **`LiquiditySeeder`**: at finalize, takes a fixed share of raised MUSD plus the matching amount of project tokens, calls Router `addLiquidity(token, MUSD, false, ..., to=LPLock)`, and sends the LP tokens to **`LPLock`**, a simple timelock.
7. **Borrow flow** is mostly off-chain plus the sale entry point. Kiln does not wrap `BorrowerOperations`. The UI builds the EIP-712 `OpenTrove` signature, and `contributeWithBorrow` relays it.

### Flow for one contributor (EOA)

```
sign OpenTrove(borrower=user, recipient=Sale, value=btc, debt)  [no tx]
Sale.contributeWithBorrow{value: btc}(...)
  -> BorrowerOperationsSignatures.openTroveWithSignature  (trove owned by user)
  -> MUSD minted to Sale
  -> Sale credits user, checks AllocationGate cap
```

For Passport Bitcoin wallets: two steps through the smart account (`openTrove`, then `contribute`).

### Decisions for you

- **Milestone attestation.** Options: (a) Kiln council multisig, (b) contributor vote weighted by allocation, (c) the team's evidence plus a challenge window. Option (c) is a good default for a hackathon, but nothing in Mezo forces a choice.
- **Where slashed MEZO goes.** Treasury versus contributors.
- **Whether sales can accept a user's existing MUSD** as well as freshly borrowed MUSD. Recommended yes.

### What the real contracts make impossible or awkward

| Issue | Impact | Alternative |
|---|---|---|
| Troves are keyed by `msg.sender`, one per address | Kiln cannot borrow for users without owning their trove | Signature route (EOA) or user-owned two-step |
| Signatures are ECDSA only | Passport Bitcoin wallets (smart accounts) cannot use the one-tx flow | Two-step flow, or a Kiln-side ERC-1271 adapter [UNVERIFIED that this helps, since `BorrowerOperationsSignatures` itself would still reject it] |
| Min net debt 1,800 MUSD | High floor on contributions | Accept existing MUSD; set sale minimum at that floor |
| Refund leaves debt outstanding | Users cannot fully unwind with refunded MUSD | State clearly in UI; possibly refund a bit extra from the protocol fee pool (a design choice, not a Mezo feature) |
| Liquidation at 110% and redemptions | A user can lose BTC mid-sale | UI ICR buffer warnings; nothing on-chain |
| veMEZO NFT transferable, no per-account snapshot | Allocation double-claim | One-time `tokenId` registration (section 2) |
| veMEZO has no slashing | Cannot use veMEZO as the bond | Kiln-owned MEZO escrow |
| veMEZO testnet address unknown | Tier gating blocked | veBTC fallback or own VotingEscrow clone, clearly labelled |
| MEZO has no burn | Slash cannot burn | Treasury or contributor pool |
| Passport peer deps vs scaffold | UI will not install cleanly | Pin wagmi 2.x, React 18 or test overrides |

---

## 8. Open questions to resolve before coding

1. Check the actual rules on the AKINDO Mezo Buildathon page. Deadline is Nov 15.
2. Find the testnet veMEZO address (or confirm there is none).
3. Check whether MEZO at `0x7B7c…0001` is a precompile and that `approve`/`transferFrom` behave normally.
4. Check Passport smart account batching and whether Passport runs under React 19.
5. Read `IVotingEscrow.LockedBalance` field names and `getPastVotes` checkpoint semantics.
6. Fork-test `openTroveWithSignature` with `relayer != borrower` and `recipient` set to a contract on a Mezo testnet fork. This is the key assumption of the one-tx UX.
