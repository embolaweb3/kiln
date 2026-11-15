// Sends funds from the test wallet to the Kiln deployer. Usage: tsx 12-send-deployer.ts btc|mezo|musd <amount>
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { erc20Abi, getAddress, parseEther } from "viem";
import { publicClient as c, walletFor, loadAccount, txLink } from "./lib/chain";
import { MEZO, MUSD } from "./08-quote-mezo";

// getAddress throws on a bad checksum, so a typo can't send funds anywhere.
const DEPLOYER = getAddress("0x3423Fe49b312706705Aaf4156Ad12027e84B9Cf5");
const [kind, amount] = process.argv.slice(2);
if (!["btc", "mezo", "musd"].includes(kind) || !amount) throw new Error("usage: btc|mezo|musd <amount>");
const w = walletFor(loadAccount());
const value = parseEther(amount);

const before = {
  btc: await c.getBalance({ address: DEPLOYER }),
  mezo: await c.readContract({ address: MEZO, abi: erc20Abi, functionName: "balanceOf", args: [DEPLOYER] }),
  musd: await c.readContract({ address: MUSD, abi: erc20Abi, functionName: "balanceOf", args: [DEPLOYER] }),
};
const hash = kind === "btc"
  ? await w.sendTransaction({ to: DEPLOYER, value })
  : await w.writeContract({ address: kind === "mezo" ? MEZO : MUSD, abi: erc20Abi, functionName: "transfer", args: [DEPLOYER, value] });
const rc = await c.waitForTransactionReceipt({ hash });
const after = {
  btc: await c.getBalance({ address: DEPLOYER }),
  mezo: await c.readContract({ address: MEZO, abi: erc20Abi, functionName: "balanceOf", args: [DEPLOYER] }),
  musd: await c.readContract({ address: MUSD, abi: erc20Abi, functionName: "balanceOf", args: [DEPLOYER] }),
};
const file = "results/transfers.json";
const log = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : [];
log.push({ kind, amount, to: DEPLOYER, status: rc.status, hash, link: txLink(hash),
  deployerDelta: (after[kind as "btc"] - before[kind as "btc"]).toString() });
writeFileSync(file, JSON.stringify(log, null, 2));
console.log(kind, amount, rc.status, txLink(hash), "deployer delta:", after[kind as "btc"] - before[kind as "btc"]);
