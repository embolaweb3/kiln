# Mezo testnet, verified

Verified on Mezo testnet (chain 31611, RPC `https://rpc.test.mezo.org`) on 2026-11-14.
Scripts that produced each result are in `/scripts`. Raw results: `scripts/results/mezo-live.json`.
Explorer links use `https://explorer.test.mezo.org/tx/<hash>`.

Sections are added as each item from the verification brief is finished.

---

## A. MEZO token at `0x7B7c000000000000000000000000000000000001`

**Short answer: it behaves as a normal ERC-20 with EIP-2612 permit, including when the spender, the owner or the recipient is a contract. A Kiln contract can use `approve` + `transferFrom` and `permit` on it.** One earlier claim in `mezo-integration.md` is corrected below: it is not the tigris `Mezo.sol`.

### What it is

| Check | Result | Script |
|---|---|---|
| `eth_getCode` | 3,021 bytes, solc 0.8.24 metadata tail, codehash `0xad8b858e4f0a4654fd01cc960c3495cd23326000486851344f8061bf299e50ac` | `04-mezo-code.ts` |
| Proxy (EIP-1967 impl / admin slots) | Both empty. Not a proxy. | `04-mezo-code.ts` |
| `name` / `symbol` / `decimals` | `MEZO` / `MEZO` / **18** | `01-params.ts` |
| Selectors in the code | ERC-20 core, `permit`, `nonces`, `DOMAIN_SEPARATOR`, `PERMIT_TYPEHASH`, `mint`, `getMinter`, `setMinter` | `04-mezo-code.ts` |
| Own EVM storage | **All zeros** in slots 0 to 7, and the balance of a known holder is not in any mapping slot 0 to 199 | `06-find-slot.ts` |
| Opcodes in the code | 0 `SLOAD`, 0 `SSTORE`, 9 `STATICCALL`, 4 `CALL` | `07-mezo-calls.ts` |

How to read this: the bytecode keeps no state and forwards every call to a target address it computes as `0x7B7C << 144 + 1`, which is its own address. The error strings that come back for unknown methods (`failed to get method by ID: [method not found in ABI`) and for `mint` (`sender is not the minter`) are Go-style messages, not Solidity reverts. **My inference, not proven:** the address is a native chain precompile and the 3,021 bytes are a placeholder stub so that tools see a contract. Supporting detail: `approve` costs about 25.5k gas, well under a typical OZ ERC-20 `approve`.

Practical consequences of that inference:

- Do not assume the OpenZeppelin storage layout. **`vm.store` / `deal`-style balance setting will not work for MEZO in a Foundry fork test.** Fork tests need real MEZO obtained on-chain (section C).
- Behaviour was verified with real transactions, below. Anything not listed there is untested.

It also differs from the tigris source (`Mezo.sol`): that file has `minter()` and a plain `ERC20Permit("Mezo")`. The deployed token has `getMinter()` and its permit domain name is **`MEZO`**, not `Mezo`.

### Real transactions

All sent from test wallet `0x135198b57a68A0614546572Db7c40F3Fa6Aace6E`. Probe contracts are in `scripts/probe/Probe.sol` (throwaway, never production).

| # | What | Result | Gas | Tx |
|---|---|---|---|---|
| 1 | Approve ERC-20 form of BTC (`0x7b7C…0000`) to the Router | ok | 25,540 | [0x403aef…](https://explorer.test.mezo.org/tx/0x403aefaea6f3f0e1601e05865a0ae0da1adb7bd30d9c69c59d93addf03a9ab90) |
| 2 | Router swap BTC → MUSD → MEZO (0.0001 BTC in, 44.3125 MEZO out) | ok | 343,804 | [0xabcd3c…](https://explorer.test.mezo.org/tx/0xabcd3c940362776d6ea26ecca2b40a1d8e9aff71cbdca1ed4a5e914545ce8e01) |
| 3 | Deploy `Spender` (`0x4aa3c18ae4be74334bc53c5208865854832d7fa7`) | ok | 227,616 | [0x373b5a…](https://explorer.test.mezo.org/tx/0x373b5ac23620d7aaef1936f7b009d6dc0a4065396c8c8ced53108dcd51d35734) |
| 4 | Deploy `Owner` (`0x5de7a7f5046d2bf393f5b7ac229bd354f41dfa00`) | ok | 440,225 | [0xe03502…](https://explorer.test.mezo.org/tx/0xe03502c2139f8197117c5da6ca437f49ca9586d0785bf64386ce79eec49f4564) |
| 5 | Deploy `PermitRelay` (`0x558e36f91a47f0306f90fe51c9f0d4968bab0379`) | ok | 443,653 | [0x54b0bc…](https://explorer.test.mezo.org/tx/0x54b0bc28341621ed63469e697bc854a4b69d396e8d1495b4cac213e5be738dde) |
| 6 | **EOA** `approve(Spender, 5)` | ok, `allowance` read back = 5e18 | 25,552 | [0xf47982…](https://explorer.test.mezo.org/tx/0xf47982cdc7bca5c432f603335dad3b2b16439a5ef77c76699b6b3e6f9d9408e3) |
| 7 | **Contract** `Spender` calls `transferFrom(EOA, recipient, 5)` | ok, recipient +5 MEZO, allowance → 0 | 29,050 | [0x768456…](https://explorer.test.mezo.org/tx/0x7684568347f4ed457aa5aba81a9337a36fdcef13c274d30de2159fd1b2acd727) |
| 8 | Same pull again with allowance 0 (simulated) | reverts, as it should | n/a | n/a |
| 9 | EOA transfers 5 MEZO to contract `Owner` | ok | 25,540 | [0x5197a2…](https://explorer.test.mezo.org/tx/0x5197a2eec8ebf7a8fa8a0f2931d6357891e4f5f0d028a52fd08447259c83f49c) |
| 10 | **Contract owner**: `Owner` approves `Spender`, then `Spender` pulls 5 to a recipient, one tx | ok, recipient +5, `Owner` balance → 0 | 46,799 | [0x761a7a…](https://explorer.test.mezo.org/tx/0x761a7a9adbf90f49f68185e117fb3a5244c15d9d4860410f85d0c2c8f3a3e6a5) |
| 11 | EOA `approve(Spender, 2)` | ok | 25,552 | [0xaf2e52…](https://explorer.test.mezo.org/tx/0xaf2e52658549f882b2d9864002fc36ab7081f7a497cb0a059017b182636eae44) |
| 12 | **Bond pattern**: `Spender` pulls from the EOA **into itself** (`transferFrom(user, address(this), 2)`) | ok, contract balance +2 | 29,266 | [0x7a9714…](https://explorer.test.mezo.org/tx/0x7a9714123f26a935fc643aa074f286079038a0989d9ca58d8a198efb81fb21e5) |
| 13 | **Permit**: EOA signs EIP-2612 permit, `PermitRelay` (a contract, not the owner) submits it and then pulls 5 | ok, recipient +5, owner nonce 0 → 1 | 50,566 | [0xba0792…](https://explorer.test.mezo.org/tx/0xba0792176fd63711d43c7dc7c98892655a7f43b34a7a83ef9a3fd5d94e5de697) |

Steps 9 and 10 failed on the first run with a generic RPC error (`Missing or invalid parameters`) and succeeded when re-run unchanged against the same contracts. A gas estimate for the same transfer succeeded in between. I could not tell the cause, so I am treating it as a transient RPC fault. Retry once on that error in deploy scripts.

### Permit details

- Typehash matches EIP-2612: `Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)`.
- EIP-712 domain, recovered by hashing candidates against `DOMAIN_SEPARATOR()`: **name `"MEZO"`, version `"1"`, chainId `31611`, verifyingContract `0x7B7c…0001`**. Do not copy `"Mezo"` from the tigris source.
- `v` was passed as 27/28, `r`, `s` as usual. Works relayed by a third-party contract.
- **Not tested:** permit from a smart-account owner (ERC-1271), expired-deadline and wrong-nonce reverts on-chain, `permit` with value `max`.

### What does not work

- **You cannot mint MEZO.** `mint` reverts with `sender is not the minter`. `getMinter()` returns the contract `0xe1952b3E980E43d3910d42088029341f436C1B74`. The tigris `Mezo.sol` has no equivalent `getMinter`, so the source in `tigris` does not describe this deployment.
- **No storage cheatcodes** for balances, as above.

### Corrections to `mezo-integration.md`

| Research doc | Now |
|---|---|
| "Whether this is a precompile or a normal ERC-20 is [UNVERIFIED]" | Behaves as a normal ERC-20 + permit for contract callers, verified on-chain. Internally likely a precompile-backed stub (inferred). |
| "tigris has a plain `Mezo.sol` (OZ `ERC20Permit`). It is not necessarily what is deployed." | Confirmed not what is deployed: `getMinter()` instead of `minter()`, permit domain name `MEZO`. |

### Open

- Whether `transferFrom` pulls from a **smart-account** owner (Passport users) behaves the same. Not tested.
- Get MEZO for demo wallets: see section C (to be written). The Router swap in steps 1 and 2 is a working route, but the MUSD/MEZO pool is thin (about 30 MUSD, 214 MEZO at last read), so 44 MEZO moved the price noticeably.

---

## B. Opening a trove (normal `BorrowerOperations.openTrove`)

Signed by the test wallet `0x135198b57a68A0614546572Db7c40F3Fa6Aace6E`, plain transaction, no signature route.
Tx: [0x5526ba…](https://explorer.test.mezo.org/tx/0x5526ba41ecbf9a85cfcaf2e45f88cced4203aaedffcba57c94d810d4a6b81e9b), block 16783124, 596,067 gas. Raw data: `scripts/results/trove-open.json`, script `13-open-trove.ts`.

| Item | Observed |
|---|---|
| Requested debt | 1,800 MUSD |
| Borrowing fee (`BorrowingFeePaid` event) | **1.8 MUSD** (0.1%, `borrowingRate()` = 1e15) |
| Gas compensation | **200 MUSD** (constant `MUSD_GAS_COMPENSATION`) |
| Composite debt (`TroveUpdated._principal` on open) | **2,001.8 MUSD** = 1,800 + 1.8 + 200 |
| **MUSD received by the borrower** | **exactly 1,800 MUSD** (balance delta). The fee is minted to PCV, the 200 goes to the Gas Pool. |
| Collateral sent | 0.046531594888773617 BTC (`msg.value`, native BTC) |
| Interest rate on the trove | 100 bps (1%), fixed at open |
| ICR at open price ($64,530.35) | 150.0% by construction. Read back minutes later at 149.97% because the oracle price moved. |
| Cost of the transaction in BTC | 8.7e-8 BTC (about 146 wei per gas) |
| Hints | `HintHelpers.getApproxHint` then `SortedTroves.findInsertPosition` worked unchanged (`getHints` in `lib/position.ts`) |

### Is the 1,800 MUSD minimum still right?

**Yes, but it means something slightly different from "1,800 principal".**

- `minNetDebt()` = 1,800 MUSD live. Net debt is **requested amount plus the 0.1% fee**, checked before the 200 gas compensation is added.
- Smallest request that opens: **1,798.201798201798201799 MUSD**. One wei less reverts with `BorrowerOps: Trove's net debt must be greater than minimum` (dry run, `03-simulate-open.ts`, plus the same revert string seen live).
- The minimum composite debt is therefore **2,000 MUSD**, and the borrower receives **about 1,798.2 MUSD**, not 1,800. Mezo's docs ("1,800 principal + 200 gas") ignore the fee.
- Collateral needed for the minimum trove, at the oracle price: 0.0610 BTC for 200% ICR, 0.0458 BTC for 150% at $65.6k. These move with the price.

### Differences from the research doc

| Research doc | Observed |
|---|---|
| "Net debt is the requested amount plus the fee." | Confirmed, and the 1,800 floor applies to that sum. |
| "Min net debt 1,800 MUSD" | Confirmed live. Docs elsewhere say 1,800 principal, which is slightly off. |
| Fee goes somewhere unspecified | Minted to PCV (`0x4dDD…80Af`). The borrower gets the full requested amount and **owes the fee on top**. |

---

## C. Reading a position (`scripts/lib/position.ts`)

Copy `scripts/lib/position.ts` into the frontend. It only needs viem. All names, argument orders and return shapes in it were taken from `mezo-org/musd` `solidity/contracts` and exercised against testnet in `13-open-trove.ts`, `14-adjust-trove.ts` and `16-check-position.ts`.

### Contracts (testnet 31611)

| Contract | Address |
|---|---|
| BorrowerOperations (proxy) | `0xCdF7028ceAB81fA0C6971208e83fa7872994beE5` |
| TroveManager | `0xE47c80e8c23f6B4A1aE41c34837a0599D5D16bb0` |
| SortedTroves | `0x722E4D24FD6Ff8b0AC679450F3D91294607268fA` |
| HintHelpers | `0x4e4cBA3779d56386ED43631b4dCD6d8EacEcBCF6` |
| PriceFeed | `0x86bCF0841622a5dAC14A313a15f96A95421b9366` |
| MUSD | `0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503` |

### Reads

| Call | Returns |
|---|---|
| `TroveManager.getEntireDebtAndColl(address)` | `(coll, principal, interest, pendingCollateral, pendingPrincipal, pendingInterest)`, all uint256, 18 decimals. **The first three already include the pending amounts** and interest accrued up to the current block, so do not add the pending ones again. |
| `TroveManager.getCurrentICR(address, uint256 price)` | uint256, WAD fraction. 1.5e18 = 150%. Max uint256 if debt is 0. |
| `TroveManager.getTroveStatus(address)` | uint8: 0 nonExistent, 1 active, 2 closedByOwner, 3 closedByLiquidation, 4 closedByRedemption |
| `TroveManager.getTroveInterestRate(address)` | uint16 bps |
| `TroveManager.getTroveMaxBorrowingCapacity(address)` | uint256 |
| `TroveManager.getTCR(price)`, `checkRecoveryMode(price)` | system collateral ratio, bool |
| `PriceFeed.fetchPrice()` | uint256, 18 decimals, USD per BTC (read $64,530 at open) |

### Computing liquidation distance from on-chain data

```
debt             = principal + interest            // from getEntireDebtAndColl, includes the 200 gas comp
ICR              = coll * price / debt
liquidationPrice = MCR * debt / coll               // MCR = 1.1e18
distance         = (price - liquidationPrice) / price
```

Verified: with the open trove, `getCurrentICR(borrower, liquidationPrice)` returned 1.099999999999999999e18, within 1 wei of MCR. At liquidationPrice + $1 it read 110.0023%, at − $1 109.9977% (`16-check-position.ts`). Example: liquidation price $47,295 at a price of $64,490, so a distance of 26.66%.

Notes:

- **Liquidation applies when `ICR < MCR` (110%).** In the source I read (`TroveManager` batch liquidation) there is no separate recovery-mode threshold for the 110% test. Recovery mode (TCR < 150%) only changes what you may open and adjust.
- **The debt number includes the 200 MUSD gas compensation**, and liquidation price uses that full figure.
- **Interest accrues every second**, so debt, ICR and liquidation price drift between reads. After a few minutes the interest was already 2.03e-5 MUSD. At 1% a year the liquidation price rises about 1% a year with no other change.
- `repayToClose` in the module is `debt − 200`, which is what `closeTrove` burns from the caller.
- Exposed as `getPosition(client, address)`. `getHints(client, coll, compositeDebt)` returns `[upper, lower]` for any open or adjust call. `collateralForIcr(compositeDebt, targetIcr, price)` sizes collateral. Write calls use the `borrowerOperationsAbi` in the same file.

---

## D. Adjusting and closing

All adjusts below ran against the open trove. Raw data: `scripts/results/trove-adjust.json`, script `14-adjust-trove.ts`. ICR figures also move with the oracle price between reads, so small ICR changes are not only from the adjust.

| Call | Result | Tx |
|---|---|---|
| `addColl(upper, lower)` with 0.0001 BTC | ok, collateral +0.0001 BTC | [0xb24cb8…](https://explorer.test.mezo.org/tx/0xb24cb8f269824676e7cce18059a5be6d4944c919e078fc3c101cd186fa5d81f8) |
| `withdrawColl(0.0001 BTC, …)` | ok | [0x122d45…](https://explorer.test.mezo.org/tx/0x122d451998e38d12a1dc2ac6a5a66bebfd4ff55b2b600da823e1605b86f42688) |
| `repayMUSD(1 MUSD, …)` | ok, debt −1, wallet −1 | [0x82219d…](https://explorer.test.mezo.org/tx/0x82219dec0cc9b56afc8fe0b2e94eaa1402b29c55ea42d8602f4c00d8d5b94d02) |
| `withdrawMUSD(1 MUSD, …)` | ok, wallet +1, **debt +1.001** (fee 0.1% on the increase) | [0x4e964c…](https://explorer.test.mezo.org/tx/0x4e964c24efd57dabb99d892515e6a58d5a8881d1baab80bcefe2443a8827ec72) |
| `adjustTrove(0, 1 MUSD, true, …)` with 0.00005 BTC | ok, collateral +0.00005 BTC and wallet +1 MUSD in one tx | [0x3473bb…](https://explorer.test.mezo.org/tx/0x3473bb4fe20ade2ed1808b945532277b30bd6420b6e4f8e5f04412b0215ad79b) |

### Gotchas, each seen as a real revert (simulated, exact reason from the contract)

1. **Repaying below the minimum is refused.** `repayMUSD(5)` on a trove with net debt about 1,801.8 reverts `BorrowerOps: Trove's net debt must be greater than minimum`. A trove cannot be partly repaid under 1,800 net debt. The only way out is `closeTrove`, which needs all of `debt − 200` in the wallet.
2. **Collateral in and out of the same call is refused.** `adjustTrove` with both `msg.value` and a `collWithdrawal` reverts `BorrowerOperations: Cannot withdraw and add coll`.
3. **Withdrawals that push ICR under 110% revert** with `BorrowerOps: An operation that would result in ICR < MCR is not permitted`.
4. **Borrowing more costs the fee on the increase**, same 0.1%, added to debt and not paid from the wallet.
5. **`closeTrove` reverts if the wallet cannot cover the debt.** Seen: `BorrowerOps: Caller doesnt have enough mUSD to make repayment`.
6. **Hints are optional in practice but worth passing.** `getApproxHint` then `findInsertPosition` worked on all calls above, so reuse it.

### Closing, and what happens if the MUSD is spent first

`closeTrove` burns **`debt − 200`** from the **caller's** wallet, then refunds the 200 gas compensation from the Gas Pool and returns the collateral. The borrower never received the fee (it went to PCV) and the trove accrues interest, so **a borrower who spends everything they borrowed cannot close**:

- Received at open: 1,800 MUSD. Needed to close: about 1,801.8 MUSD plus accrued interest. The gap is the fee plus interest, about 1.8 MUSD and rising.
- On this wallet, after sending 600 MUSD to the Kiln deployer, the wallet holds about 1,205.7 MUSD (it also bought about 4.7 MUSD with BTC to cover the fee and interest, [swap 0x1a2e98…](https://explorer.test.mezo.org/tx/0x1a2e986b7bbb26b2ca4ec17fbf6f57fe22c05d732f534023569e059e3779688a)) against a close requirement of about 1,802.8. `closeTrove` simulation reverts, as listed above.
- While the MUSD is gone the position stays open, keeps accruing 1% a year and stays exposed to liquidation below about $47.3k. **A sale refund of MUSD does not release the borrower**: they still owe the full amount plus fee plus interest. This matches the research doc and is now seen in practice.

**Status: close not yet executed.** It needs about 598 MUSD returned to the test wallet. See the report message.
