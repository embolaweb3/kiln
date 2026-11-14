# Kiln

Launchpad for the Mezo Buildathon: contributors borrow MUSD against BTC and join token sales without selling BTC. MEZO sets allocation tiers and backs team quality bonds.

## Session start
- Read everything in /docs and run `git log` before doing anything else.

## Git
- Commit yourself, small and frequent, one logical change per commit.
- Commit messages are short and plain. No Claude/AI mention, no Co-Authored-By, no extra details.
- Local git config only (user.name embolaweb3).

## Code
- Comments in a natural human style, sparse, explaining why not what.
- Never guess external interfaces. Verify against the real source before using them.
- No TODOs or mocks in production paths. Mocks live only under /contracts/test.

## Contracts (/contracts)
- Foundry, Solidity.
- Custom errors, NatSpec on external functions, an event for every state change.

## UI (/web)
- Next.js, TypeScript, wagmi/viem.
- White-family palette, glassmorphism, anime.js animations.
