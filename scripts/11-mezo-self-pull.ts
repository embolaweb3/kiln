// Spender contract pulls MEZO from the user into itself (the bond/sale pattern).
import { readFileSync, writeFileSync } from "node:fs";
import { erc20Abi, parseAbi, type Address, type Hex } from "viem";
import { publicClient as c, walletFor, loadAccount, txLink } from "./lib/chain";
import { MEZO } from "./08-quote-mezo";

const log = JSON.parse(readFileSync("results/mezo-live.json", "utf8"));
const Spender = log.contracts.Spender as Address;
const me = loadAccount();
const w = walletFor(me);
const AMT = 2n * 10n ** 18n;
const spenderAbi = parseAbi(["function pull(address t, address from, address to, uint256 amt) returns (bool)"]);
const bal = (a: Address) => c.readContract({ address: MEZO, abi: erc20Abi, functionName: "balanceOf", args: [a] });
async function send(label: string, fn: () => Promise<Hex>) {
  const hash = await fn(); const rc = await c.waitForTransactionReceipt({ hash });
  log[label] = { status: rc.status, hash, link: txLink(hash), gasUsed: rc.gasUsed.toString() };
  console.log(label, rc.status, txLink(hash));
}
await send("approve_for_self_pull", () => w.writeContract({ address: MEZO, abi: erc20Abi, functionName: "approve", args: [Spender, AMT] }));
const before = await bal(Spender);
await send("contract_pulls_into_itself", () => w.writeContract({ address: Spender, abi: spenderAbi, functionName: "pull", args: [MEZO, me.address, Spender, AMT] }));
log.selfPull = { contractBalDelta: ((await bal(Spender)) - before).toString() };
writeFileSync("results/mezo-live.json", JSON.stringify(log, null, 2));
console.log(log.selfPull);
