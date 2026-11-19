# Demo script (3:00)

Order: Mezo integration, then the live testnet flow, then the security work. Everything below is in the repo or in `docs/testnet-proof.md`. Do not say anything on the "Do not claim" list.

## Do not claim

- The veto path ran live. It did not. It is covered by unit and invariant tests.
- Any sale had several contributors. Both testnet sales had one.
- Passport smart-account wallets work. They are untested.
- Borrowing was part of the testnet sale run. The contributor was funded with MUSD by transfer.
- Liquidity seeding, one-transaction borrow, or veMEZO gating exist. They are planned.
- The app is hosted. It is not deployed unless that changes before recording.

## 0:00 to 0:45, Mezo integration

Screen: README architecture diagram, then `Sale.sol`, `MezoTierVault.sol` and `TeamBond.sol`.

- "Kiln lets BTC holders join token sales with MUSD they borrow against their BTC on Mezo. They keep the BTC."
- Show the diagram. "MUSD is the raise token. MEZO does two jobs: staking MEZO raises a wallet's cap, and the team posts a MEZO bond."
- Show `participate` in the app: the borrow step calls Mezo's `BorrowerOperations` directly. "The trove belongs to the contributor. Kiln never holds collateral."
- Show `MezoTierVault.maxContribution` and `TeamBond.slash`. "If contributors veto, the bond is slashed to them."

## 0:45 to 2:15, Live testnet flow

Screen: `docs/testnet-proof.md` and the explorer, chain 31611. This run happened on 2026-11-15, so show it as a recorded run and not as a fresh one, unless you re-run `contracts/script/e2e.sh`.

1. Factory and vault addresses, from the README table.
2. Two sales created from one factory, tokens and 1 MEZO bond escrowed each.
3. Contributor stakes 2 MEZO. Per-wallet cap goes from 500 to 700 MUSD.
4. Contributes 150 MUSD to sale A (soft cap 100) and 30 MUSD to sale B.
5. Early actions that revert, as designed: unstake while locked (`StakeLocked`), finalize B early (`SoftCapNotMet`), release before the timelock (`TimelockActive`).
6. After the window: A finalizes, first tranche of 37.5 MUSD goes to the team, contributor claims 150 EMBR. B failed, so the contributor refunds 30 MUSD and the team reclaims its tokens and bond.
7. After the timelock, A releases the remaining 112.5 MUSD and the bond goes back to the team.

Say plainly: one contributor, no veto in this run.

Optional, if there is time: show the app against testnet with `NEXT_PUBLIC_USE_FIXTURES=false`, reading the two real sales.

## 2:15 to 3:00, Security

Screen: terminal and `docs/security.md`.

- Run `forge test` in `contracts/`. Expect 95 passed, 1 skipped (the fork test, which needs an RPC URL). The run takes about 35 seconds because of the invariant suite, so cut or speed up the recording.
- "The invariant suite checks raise accounting, wallet caps, stake locked while contributing, and the bond staying put while a veto is possible. We mutation-checked it: removing each guard made an invariant fail."
- "Slither found one real issue, a missing zero-address check. Fixed and tested."
- "The veto path is tested, not run live."
- "Known issue: a holder at the veto threshold can profit from vetoing, because tokens are claimable before the timelock ends. The fix is to hold claims until the timelock ends. It is written up and not in this build."
- Close with repo link and what's next: liquidity seeding, one-transaction borrow, veMEZO gating once there is a testnet address.

## Before recording

- Open the explorer links in the proof doc and check they load.
- If you want a live shot, re-run the end-to-end script with fresh sales. Check wallet balances and key files first.
- Time a full run and cut to 3:00.
