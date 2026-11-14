# Submission text

Fill the bracketed items from the repo when they exist. Delete any sentence that is not true at submission time.

## Project name

Kiln

## Short description

Kiln is a launchpad on Mezo where BTC holders join token sales by borrowing MUSD against their BTC instead of selling it. MEZO stake sets allocation tiers, and project teams post a MEZO bond that can be slashed if they miss milestones.

## Longer description

Contributors borrow MUSD from Mezo against BTC they keep in their own trove, then use it to buy into a sale. The sale accepts only MUSD. Allocation caps come from MEZO stake. Teams post a MEZO quality bond held in a Kiln escrow, and raised funds are released by milestone, so a team that stops delivering has something to lose.

[Add one sentence on what actually works on testnet at submission time.]

## Track fit

**DeFi.** The core mechanic is borrowing MUSD against BTC. Both assets are central to the product, so it meets the "MUSD and/or MEZO" requirement:

- MUSD: borrowed by contributors, the only sale currency, held in milestone escrow, used to seed liquidity.
- MEZO: stake tiers for allocation, and the team bond.

It also touches **Access & Distribution**, since it opens token sales to BTC holders without a sale of BTC. [Confirm on the form which single track to pick.]

Working deployment: Mezo testnet, chain 31611. [Add contract addresses and explorer links.]

## What's next

- Liquidity seeding into a Mezo Pools volatile pool at finalize, with LP tokens in a timelock.
- One-transaction signature borrow for EOA wallets.
- veMEZO gating once a veMEZO testnet address is confirmed.
- Support for Passport Bitcoin wallets through the two-step flow.
- A decision on milestone attestation (council, contributor vote, or a challenge window).
- Audit before any mainnet use.
