// Swaps a little BTC for MUSD (BTC -> MUSD volatile pool) so a trove can be closed.
// Usage: tsx 15-buy-musd.ts <btcAmount>
import { erc20Abi, formatUnits, parseEther } from "viem";
import { publicClient as c, walletFor, loadAccount, txLink } from "./lib/chain";
import { BTC, MUSD, FACTORY, ROUTER, routerAbi } from "./08-quote-mezo";

const me = loadAccount();
const w = walletFor(me);
const amountIn = parseEther(process.argv[2] ?? "0.00006");
const route = [{ from: BTC, to: MUSD, stable: false, factory: FACTORY }] as const;
const [, quote] = await c.readContract({ address: ROUTER, abi: routerAbi, functionName: "getAmountsOut", args: [amountIn, route] });
console.log("quote", formatUnits(quote, 18), "MUSD");
const bal = () => c.readContract({ address: MUSD, abi: erc20Abi, functionName: "balanceOf", args: [me.address] });
const before = await bal();
const a = await w.writeContract({ address: BTC, abi: erc20Abi, functionName: "approve", args: [ROUTER, amountIn] });
await c.waitForTransactionReceipt({ hash: a });
console.log("approve", txLink(a));
const h = await w.writeContract({ address: ROUTER, abi: routerAbi, functionName: "swapExactTokensForTokens",
  args: [amountIn, quote * 99n / 100n, [...route], me.address, BigInt(Math.floor(Date.now() / 1000) + 600)] });
const rc = await c.waitForTransactionReceipt({ hash: h });
console.log("swap", rc.status, txLink(h), "MUSD received", formatUnits((await bal()) - before, 18));
