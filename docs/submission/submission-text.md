# Submission text

Every statement here is in the repo or in `docs/testnet-proof.md`. Check the repo link and demo fields before pasting.

## Project name

Kiln

## Short description

Kiln is a token-sale launchpad on Mezo. Contributors borrow MUSD against BTC instead of selling it and use that MUSD to join sales. Staking MEZO raises a wallet's cap, and teams post a MEZO bond that is slashed to contributors if they veto the team.

## Longer description

Kiln sales raise MUSD at a fixed price. Contributors borrow MUSD from Mezo against BTC they keep in their own trove, then contribute it. Each wallet has a base cap, and staking MEZO in the tier vault raises it. Staked MEZO stays locked while the wallet has a contribution in an unsettled sale.

A team creates a sale through a factory with fixed parameter bounds and posts a MEZO bond. If the soft cap is missed, contributors refund and the team gets its tokens and bond back. If it is met, the team gets a first tranche at finalize and the rest after a timelock. During the timelock, contributors holding enough of the raise can veto: the remainder is refunded pro rata and the bond is slashed to them.

On Mezo testnet, two sales ran end to end from one factory with one contributor: one met its soft cap, finalized, paid out and released after the timelock, and one missed its soft cap and refunded. Every transaction is linked in `docs/testnet-proof.md`. The contracts have 95 passing tests, including fuzz and invariant suites. The veto path is covered by those tests but has not run live.

## Track fit

**DeFi.** The core mechanic is borrowing MUSD against BTC to take part in sales. MUSD and MEZO are both in the core flow:

- MUSD: borrowed from Mezo by the contributor, the only raise token, paid to the team in two tranches.
- MEZO: staked for allocation caps and posted as the team bond.

Working deployment: Mezo testnet (chain 31611), addresses in the README. [Confirm on the form whether a second track can be selected. The sale access angle also fits Access & Distribution.]

## Limits to state if asked

- One contributor per sale on testnet, and no live veto.
- Borrowing and contributing are separate steps. The testnet sales used a contributor funded with MUSD by transfer.
- Passport smart-account wallets are untested.
- Tiers use staked MEZO, not veMEZO.
- Not audited. One known issue (veto can be profitable) is documented in `docs/security.md`.

## What's next

- Hold token claims until the timelock ends, which removes the veto incentive issue.
- Liquidity seeding into a Mezo Pools volatile pool at finalize, with LP tokens in a timelock.
- One-transaction borrow and contribute using Mezo's signature route, for EOA wallets.
- veMEZO gating once a testnet address is confirmed.
- A live veto run, a multi-contributor sale, and testing with Passport smart-account wallets.
- An independent audit before any mainnet use.
