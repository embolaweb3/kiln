// Re-runs step 4 of 09-mezo-live.ts (contract-owned MEZO) against the already deployed probes.
import { readFileSync, writeFileSync } from "node:fs";
import { erc20Abi, parseAbi, type Address, type Hex } from "viem";
import { publicClient as c, walletFor, loadAccount, txLink } from "./lib/chain";
import { MEZO } from "./08-quote-mezo";

const log = JSON.parse(readFileSync("results/mezo-live.json", "utf8"));
const { Spender, Owner } = log.contracts as Record<string, Address>;
const me = loadAccount();
const w = walletFor(me);
const RECIPIENT = "0x00000000000000000000000000000000000b0001" as Address;
const AMT = 5n * 10n ** 18n;
const ownerAbi = parseAbi(["function run(address t, address s, address to, uint256 amt) returns (uint256,uint256,uint256,uint256)"]);
const bal = (a: Address) => c.readContract({ address: MEZO, abi: erc20Abi, functionName: "balanceOf", args: [a] });

async function send(label: string, fn: () => Promise<Hex>) {
  const hash = await fn();
  const rc = await c.waitForTransactionReceipt({ hash });
  log[label] = { status: rc.status, hash, link: txLink(hash), gasUsed: rc.gasUsed.toString(), block: rc.blockNumber.toString() };
  console.log(label, rc.status, txLink(hash));
}

await send("fund_owner_contract", () => w.writeContract({ address: MEZO, abi: erc20Abi, functionName: "transfer", args: [Owner, AMT] }));
log.ownerContractBalAfterFunding = (await bal(Owner)).toString();
const before = await bal(RECIPIENT);
await send("contract_owner_approve_and_pull", () => w.writeContract({ address: Owner, abi: ownerAbi, functionName: "run", args: [MEZO, Spender, RECIPIENT, AMT] }));
log.contractOwnerFlow = { recipientDelta: ((await bal(RECIPIENT)) - before).toString(), ownerBalAfter: (await bal(Owner)).toString() };
log.mezoBalanceEnd = (await bal(me.address)).toString();
writeFileSync("results/mezo-live.json", JSON.stringify(log, null, 2));
console.log(log.contractOwnerFlow, log.ownerContractBalAfterFunding);
