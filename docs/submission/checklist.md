# AKINDO submission checklist

**Flagged: this list is a guess at what the form asks.** The real AKINDO Mezo Buildathon form was not readable when the research was done, so check every line against the live form before submitting.

**Deadline flag:** Mezo's blog gave final submissions as **2026-11-15**, and winners and the demo session as 2026-11-23. Check on AKINDO whether the window is still open or an entry was already sent, and update this file either way.

## Rules to confirm on the event page
- [ ] Deadline and timezone
- [ ] Track options and whether only one can be picked
- [ ] Which wave this counts as (Wave 2) and whether Wave 1 entries carry over
- [ ] Requirement wording: "MUSD and/or MEZO plus a working deployment"
- [ ] Whether Mezo Passport is required (the research found no mention in the current rules)
- [ ] Judging criteria and any community scoring or voting step
- [ ] KYB or payout conditions for winners

## Form fields (probable)
- [ ] Project name: Kiln
- [ ] One-line tagline
- [ ] Short description (`submission-text.md`)
- [ ] Longer description or problem and solution
- [ ] Track
- [ ] Public GitHub repo link: [add]
- [ ] Live demo URL (deployed frontend): [add]
- [ ] Demo video link, with length limit and host rules: [add]
- [ ] Pitch deck, if requested: [add]
- [ ] Team members and contact details
- [ ] Wallet address for prizes
- [x] Chain used (Mezo testnet) and deployed contract addresses: README and `contracts/deployments/testnet.json`
- [x] Explorer links to transactions: README and `docs/testnet-proof.md`
- [ ] "What's next" section (`submission-text.md`)
- [ ] Any social or Discord handles

## Repo readiness
- [ ] Repo is public and has the MIT license
- [x] README facts checked against the code and `docs/testnet-proof.md` (2026-11-19)
- [x] No "pending" placeholders left in README
- [x] repo URL set in the README setup section
- [ ] Setup instructions tested on a clean clone (`forge test` was run, `npm install` and `npm run dev` were not)
- [ ] No secrets or private keys committed

## Demo readiness
- [ ] Frontend deployed and reachable (it is not deployed today, so the live demo URL field has nothing to point at)
- [ ] Decide what to put in a demo URL field if the form requires one
- [ ] Wallet funded on testnet if re-running the sales
- [x] Demo script has no `[PENDING]` lines left
- [ ] Video recorded, uploaded, link opens when logged out
