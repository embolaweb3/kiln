# Testnet proof

Mezo testnet (chain 31611). Every row is a transaction; click through to the explorer.
Run: 2026-11-15T06:36Z. Two sales ran in parallel from one factory: sale A (EMBR) meets its soft cap and releases, sale B (TIDE) misses it and refunds.

| Contract | Address |
|---|---|
| KilnFactory | [0xF2ffCF1c35A1b597932be0f2349b9c7B35Ab3ffb](https://explorer.test.mezo.org/address/0xF2ffCF1c35A1b597932be0f2349b9c7B35Ab3ffb) |
| MezoTierVault | [0x652c5c4637656EB18079594A7e5B0d9De7E7Faa3](https://explorer.test.mezo.org/address/0x652c5c4637656EB18079594A7e5B0d9De7E7Faa3) |
| TeamBond | [0x6B1cDFfa339268978bcaC8E85D69c5FC653a4C13](https://explorer.test.mezo.org/address/0x6B1cDFfa339268978bcaC8E85D69c5FC653a4C13) |
| EMBR (demo token) | [0xaca1B07a18f0a6b3B96232A4F4028BaAf7c59F5f](https://explorer.test.mezo.org/address/0xaca1B07a18f0a6b3B96232A4F4028BaAf7c59F5f) |
| TIDE (demo token) | [0x265CeB3A2E12daB9cf795204cDABF2F52B05940d](https://explorer.test.mezo.org/address/0x265CeB3A2E12daB9cf795204cDABF2F52B05940d) |

Team and deployer: `0x3423Fe49b312706705Aaf4156Ad12027e84B9Cf5`. Contributor: `0xF506e4B1f68454c979eb9F6a3F22e86e8B1663ea`.

## 1. Setup

| Step | Actor | Tx | Note |
|---|---|---|---|
| fund gas | team | [`0xd465a6a9…`](https://explorer.test.mezo.org/tx/0xd465a6a9b9ded0850e3e65243c0b4e6d5c1cf31e055a38aaefa3dce5fe945662) | 0.003 BTC for the contributor's gas (sent by an earlier attempt that stopped on a script bug) |
| fund MUSD | team | [`0x626d8d6b…`](https://explorer.test.mezo.org/tx/0x626d8d6bab8351611fd454f766334d2367639d36d9cbb88198477039bf200355) | 200 MUSD to the contributor |
| fund MEZO | team | [`0x0329b814…`](https://explorer.test.mezo.org/tx/0x0329b8145cac05604098f0693c6dacd21158905ee1f244800e6b2437816d1c76) | 2 MEZO to the contributor, to stake |
| approve EMBR | team | [`0xc3eb7175…`](https://explorer.test.mezo.org/tx/0xc3eb7175bb922585e13e414ce578ce5b41dd56947e2b831fe4b7b26935a42186) | factory may pull the 400 EMBR for sale A |
| approve TIDE | team | [`0x2fd01bf3…`](https://explorer.test.mezo.org/tx/0x2fd01bf382b0e3db2376f33eb800bf38a561f828b7405c2da63166a1f739ccbf) | factory may pull the 400 TIDE for sale B |
| approve MEZO bond | team | [`0xb7a69556…`](https://explorer.test.mezo.org/tx/0xb7a695560df0f87ebdf1993e9d43347ccc653370eeee22c2942678e7a345423d) | factory may pull two 1 MEZO bonds |
| create sale A | team | [`0xae8c150b…`](https://explorer.test.mezo.org/tx/0xae8c150b5522bf07ddd219135a95c8c3a5d7794713be41185be2454d07ec90c9) | EMBR at 1 MUSD, soft cap 100, hard cap 400, first tranche 25%, timelock 5 min, veto 20%, bond 1 MEZO |
| create sale B | team | [`0x55025e76…`](https://explorer.test.mezo.org/tx/0x55025e76e242784c1c3e6ee4b9567781ee78aad03a587cb75a54ee0e9e6dae77) | TIDE on the same terms; will miss its soft cap |

Sale A: [`0x3721FD15543fC4Bd43AAF951eF87B231576ab384`](https://explorer.test.mezo.org/address/0x3721FD15543fC4Bd43AAF951eF87B231576ab384) (EMBR). Sale B: [`0x46137370fa5612933c8638c41Bcb3bB154D8009B`](https://explorer.test.mezo.org/address/0x46137370fa5612933c8638c41Bcb3bB154D8009B) (TIDE). Window: chain time 1794724840 to 1794725440.

Checks after creation:

- vault registered both sales: A=true, B=true
- bonds held: 2 MEZO in TeamBond
- sale tokens escrowed: 400 EMBR in sale A, 400 TIDE in sale B

## 2. Stake and contribute (contributor)

| Step | Actor | Tx | Note |
|---|---|---|---|
| approve MEZO | contributor | [`0x4b46b9fb…`](https://explorer.test.mezo.org/tx/0x4b46b9fb16d9ac2fdefdb9aa7dda092d2f6b1177b7fd9f8087d01b601908a8b7) | vault may pull 2 MEZO (sent by hand: the script's own send of this step succeeded on chain but the script could not parse the reply, so it stopped; resumed from here) |
| stake MEZO | contributor | [`0xda61c86c…`](https://explorer.test.mezo.org/tx/0xda61c86cefb414600fa1caf171ed578b2f9181535a034ff2fdedcd41893cee3f) | stake 2 MEZO |
| approve MUSD A | contributor | [`0x24592043…`](https://explorer.test.mezo.org/tx/0x245920432ed82e4f9f0d607b37b33797a24faf4c55e940e67cacd5c2bf693656) | sale A may pull 150 MUSD (sent by hand after the script stopped on a receipt-handling bug) |
| approve MUSD B | contributor | [`0xd0f0fd4e…`](https://explorer.test.mezo.org/tx/0xd0f0fd4ee51de0090428b2fcf55f7708b2cea81cbc2dc443c2604a812e04a6d0) | sale B may pull 30 MUSD |
| contribute A | contributor | [`0xbb9b38fc…`](https://explorer.test.mezo.org/tx/0xbb9b38fc9df3359127b57edd8608752ba21648604e5a2639b8487bcda80dd600) | 150 MUSD, above the 100 soft cap |
| contribute B | contributor | [`0xf01eb4a6…`](https://explorer.test.mezo.org/tx/0xf01eb4a69422c63759d2dc4a569e1c354ba902adb248ec2ab4751d8875b9feb3) | 30 MUSD, below the 100 soft cap |

Checks after contributing:

- per-wallet cap: 500 MUSD before staking, 700 MUSD after staking 2 MEZO
- sale A raised 150 MUSD, sale B raised 30 MUSD
- vault lock count for the contributor: 2
- unstake while contributions are live: reverts with `StakeLocked()`, as expected
- finalize sale B early: reverts with `SoftCapNotMet()`, as expected

## 3. After the window (both sales settle together)

| Step | Actor | Tx | Note |
|---|---|---|---|
| finalize A | team | [`0x2ae0deec…`](https://explorer.test.mezo.org/tx/0x2ae0deec4b0404e508536d122640a1d29e021bc79255d6320e1193c04c3d07c4) | soft cap met: first tranche (25% of 150 = 37.5 MUSD) to the team, unsold EMBR returned |
| claim A | contributor | [`0xc277e06a…`](https://explorer.test.mezo.org/tx/0xc277e06aba21ae7629e01e7dff5feed3bbe825c4509aef617ebd1ad913e2a16e) | claim 150 EMBR |
| refund B | contributor | [`0x0738b87b…`](https://explorer.test.mezo.org/tx/0x0738b87b75d67342bdba272939d3e9961efa3b80fe9fe1fccc9bf2c42e684e42) | soft cap missed: pull the 30 MUSD back |
| reclaim B | team | [`0x7bb61ee3…`](https://explorer.test.mezo.org/tx/0x7bb61ee3b70888507db69ba5fd4e139e0d39f38415ff427096b76bebc26acf05) | sale B: the 400 TIDE and the bond go back to the team |
| unlock A | team | [`0x3e4bb071…`](https://explorer.test.mezo.org/tx/0x3e4bb0719bf905cbd2239aa352d79a4311e8ecc14d9dc324bc8f125624019492) | vault frees the contributor's lock for sale A |
| unlock B | team | [`0x8f228113…`](https://explorer.test.mezo.org/tx/0x8f228113ec554fd1fc8837237ab91353d191ff05bc39056ee8bb37ae48bd65ec) | vault frees the contributor's lock for sale B |
| unstake | contributor | [`0x47b7fdd9…`](https://explorer.test.mezo.org/tx/0x47b7fdd90d98bbbd532630762d71551485a4bf7f3d1aeaddbf6efe4a4d5e6426) | no locks left: withdraw the 2 MEZO |

Checks after settling:

- contributor holds 150 EMBR and 50 MUSD (200 funded, 150 spent on A, 30 refunded from B)
- sale B: contributor refund flag = true, MUSD left in sale B = 0
- sale A holds 112.5 MUSD (the remainder held for the timelock)
- contributor stake after unstake: 0 MEZO
- release before the timelock ends: reverts with `TimelockActive()`, as expected

## 4. Release

| Step | Actor | Tx | Note |
|---|---|---|---|
| release A | team | [`0x73c8f29a…`](https://explorer.test.mezo.org/tx/0x73c8f29ac3610bdc9a1488eeb1000c4981633cea184b250360484845054cff74) | no veto: remaining 112.5 MUSD to the team and the 1 MEZO bond returned |

Final state:

- sale A: state 6 (6 = Completed); released to the team 150 of 150 MUSD raised; MUSD left in the sale: 0
- sale B: state 2 (2 = Failed); MUSD left in the sale: 0
- team MUSD: 600 before, 550 after (200 sent to the contributor, so the net gain is 150 = the 150 raised in sale A)
- team MEZO: 15 before, 13 after (2 sent to the contributor, bonds posted and returned)
- TeamBond MEZO balance: 0

## Notes

- This is one clean run of both sales, but not one clean script execution. Three attempts of `contracts/script/e2e.sh` were needed. The first stopped on a 64-bit overflow in the script's wei arithmetic (one gas transfer had gone out, linked above). The second and third stopped on how the script handled transaction replies. Two contributor approvals (`approve MEZO`, `approve MUSD A`) were therefore sent by hand and are labelled as such. All three attempts used the same two live sales, created once. No contract or deployment was changed.
- The script now submits with `--async` and polls for the receipt, so a dropped receipt call cannot resend a transaction.
- Not covered: smart-account owners (Passport users), the veto path on testnet (it is covered by the unit and invariant suites), and sales with more than one contributor.
- MEZO is a precompile-backed token that forge cannot simulate, so its approve, `transferFrom` (bond deposit, vault stake) and `transfer` behaviour is proven by the transactions above.
