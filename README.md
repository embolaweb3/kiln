# Kiln

Borrow to participate. Join token sales by borrowing MUSD against your BTC on Mezo, without selling the BTC.

## Layout
- `contracts/` Foundry project
- `web/` Next.js + wagmi/viem frontend
- `docs/` research and design notes

## Status
Early design. See `docs/`.

## Known issues
- **A veto can be profitable.** Sale tokens stay claimable during the release timelock, so a holder at the veto threshold can veto, keep all their tokens, and get the unreleased MUSD back plus a share of the team bond. The planned fix is to hold token claims until the timelock ends. Not in the current build. Details in `docs/security.md`.

## License
MIT
