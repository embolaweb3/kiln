# Security notes

Slither 0.11.6, run from `contracts/` with `slither . --filter-paths "lib|test|script" --exclude-dependencies`.

## Slither findings

| # | Detector | Where | Verdict | Action |
|---|---|---|---|---|
| 1 | `missing-zero-check` | `MezoTierVault` and `TeamBond` constructors, `factory_` | Valid. A zero factory would leave the vault unable to register sales, or the bond unable to open bonds, with no way to fix it. | Fixed: both constructors revert with `ZeroAddress`. The same check was added to the token, vault and bond addresses in `KilnFactory` and `Sale`. Unit tests cover each. |
| 2 | `timestamp` (8 comparisons) | `Sale`, `KilnFactory` | Accepted. Sale windows are minutes to days, and a validator can shift `block.timestamp` by seconds at most. Nothing depends on sub-minute precision. | None. The factory's minimum duration and timelock bound keep windows well above that granularity. |

Re-run after the fix: only the `timestamp` detector remains.

## Properties and how they are checked

| Property | Mechanism | Test |
|---|---|---|
| No admin path to user funds | No owner on `Sale`, `TeamBond`, `KilnFactory`. The vault owner can only call `setCapParams`, which cannot touch stakes. | `test_setCapParamsGuards`, `test_ownerCannotRegisterSale` |
| Raise balance accounting | `raiseToken.balanceOf(sale) == totalRaised - totalRefunded - totalReleased` | `invariant_raiseAccounting` |
| No wallet over its cap | Checked at contribution. The stake backing the cap cannot leave while the lock is held. | `invariant_noWalletOverCap`, fuzz `testFuzz_contributionsRespectCaps` |
| Staked MEZO locked while a contribution is live | `MezoTierVault.lockCount` blocks `unstake`. Only factory-registered sales can lock. | `invariant_stakeLockedWhileContributionLive`, `test_directSaleCannotLockStake` |
| Bond cannot leave while veto is possible | `TeamBond.release` and `slash` are callable only by the owning sale. The sale releases only after the timelock with no veto, or after a failed sale. | `invariant_bondStaysWhileVetoPossible` |
| Reentrancy | `nonReentrant` on every state-changing external function that moves tokens. State is written before transfers. | unit tests, invariants |
| Fee-on-transfer tokens | Balance-delta check on every pull of the raise, bond, stake and sale token. | `test_contributeRejectsFeeOnTransferRaiseToken`, `test_depositRejectsFeeToken`, `test_stakeRejectsFeeOnTransfer`, `test_feeOnTransferSaleTokenRejected` |
| No unbounded loops | Veto, refunds, claims and locks are per-wallet pull calls with running totals. | by construction |

The invariant suite was mutation-checked: removing the lock call, the wallet cap check, the unstake lock, the timelock check or the refund accounting each made at least one invariant fail.

## Known issues

### Veto can be profitable for a holder at the threshold

Status: known, accepted for the testnet build. Design unchanged.

A passed veto refunds the unreleased MUSD pro rata and slashes the bond to contributors, but it does not touch sale tokens. Tokens are claimable straight after finalize, so contributors keep what they already claimed or can still claim. A contributor, or a group, holding the veto threshold can therefore pay nothing to veto and walk away with the full token allocation for only the released share of the price, plus a share of the bond. This is most attractive when the token trades above the sale price.

Impact: a team can lose the remainder of the raise and its bond to a veto that was not about team quality. Contributors' funds are not at risk.

Mitigations in place: the veto threshold is set per sale inside the factory bounds, and the bond is the team's stake in that outcome.

Planned fix: hold token claims until the timelock ends. After a veto, contributors would then claim tokens only for the share of their contribution that was released, and the team would take back the rest. This removes the incentive without changing who can veto. It is not in this build.

## Design decisions to know about

- **Known issue: a veto can be profitable (see below).**
- **Sale-token price rounding.** Tokens owed are `floor(contribution * unit / price)`. The sum of per-wallet floors never exceeds the floor of the total, so the sale can always pay every claim. Dust stays in the sale.
- **Maximum sale duration.** The factory also enforces a `maxDuration`, which was not in the brief. Without it a team could set a far-future end and hold contributors' stake locked.
- **Stake unlock is lazy.** `MezoTierVault.unlock(sale, wallet)` is public and permissionless once the sale is finalized or failed. A user who contributed must call it (or anyone can for them) before `unstake`.
- **Failed sales release the lock too**, so a failed sale cannot trap stake.

## MEZO is a precompile-backed token

`0x7B7c000000000000000000000000000000000001` on Mezo testnet is not ordinary bytecode: its `balanceOf` calls its own address, which the node resolves natively (Cosmos bank module; `transferFrom` without an allowance fails with a `MsgSend authorization` error). Forge's local EVM cannot execute it, so unit tests use a mock ERC-20 and MEZO behaviour is proven on the live chain in `docs/testnet-proof.md`. Every MEZO transfer in the contracts has a balance-delta check, so a token that does not move 1:1 fails closed.
