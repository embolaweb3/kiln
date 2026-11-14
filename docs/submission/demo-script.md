# Demo script (3:00)

Order: Mezo integration, then the live testnet flow, then security. Shot details marked `[PENDING]` depend on code that is not merged yet. Do not record those parts until they work. Do not narrate anything that is not on screen.

## 0:00 to 0:45, Mezo integration

Screen: README architecture diagram, then the contract source.

- "Kiln lets BTC holders join token sales by borrowing MUSD against their BTC on Mezo. They never sell the BTC."
- Show the diagram. "MUSD is the only sale currency. MEZO does two jobs: stake tiers set allocation, and a MEZO bond backs the team."
- Show `BorrowerOperationsSignatures.openTroveWithSignature`. "The user owns the trove. The sale contract is only the MUSD recipient, so Kiln never holds anyone's collateral."
- `[PENDING]` Show the Kiln sale contract calling it, and the tier gate reading veMEZO (or the fallback, say which one it is).

## 0:45 to 2:15, Live testnet flow

Screen: the web app on Mezo testnet (chain 31611), wallet connected. Have a funded wallet ready: testnet BTC from the faucet, and the trove state known in advance.

1. `[PENDING]` Connect wallet. Show the tier from MEZO stake and the contribution cap.
2. `[PENDING]` Enter an amount. Show the trove preview: collateral, debt, fee, ICR buffer.
3. `[PENDING]` Sign once, send one transaction (only if the one-tx borrow is merged and working, otherwise show the two steps honestly).
4. `[PENDING]` Open the explorer link for the transaction. Show MUSD minted and the contribution recorded.
5. `[PENDING]` Show the team bond posted and the milestone state.
6. `[PENDING]` Only if merged: finalize, then show the pool created by the liquidity seeder.

## 2:15 to 3:00, Security

Screen: tests output and the notes in the README.

- `[PENDING]` Run `forge test` and show the pass count. Mention fuzz or invariant tests only if they exist.
- "Refunds don't unwind debt. We say so in the UI."
- "Each veMEZO token ID registers once, against a past snapshot, so one NFT can't be passed around or flash-lent for allocation."
- "The bond is plain MEZO in our own escrow, because veMEZO can't be slashed."
- `[PENDING]` Show the slash or refund path on testnet if it was run.
- Close: repo link, and what's next (liquidity seeding, one-tx borrow, veMEZO gating once deployed).

## Before recording

- Replace every `[PENDING]` with a real shot or delete the line.
- Time a full run. Cut to fit 3:00.
- Check wallet balances, faucet state and the trove status first, since one trove per address blocks a second open.
