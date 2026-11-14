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
