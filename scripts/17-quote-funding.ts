import { formatUnits, parseEther } from "viem";
import { publicClient as c } from "./lib/chain";
import { BTC, MUSD, MEZO, FACTORY, ROUTER, routerAbi } from "./08-quote-mezo";
const r = (from: `0x${string}`, to: `0x${string}`) => ({ from, to, stable: false, factory: FACTORY });
const q = async (amt: bigint, routes: any[]) => {
  const a = await c.readContract({ address: ROUTER, abi: routerAbi, functionName: "getAmountsOut", args: [amt, routes] });
  return formatUnits(a[a.length - 1], 18);
};
for (const btc of ["0.001", "0.005", "0.01"]) console.log(btc, "BTC -> MUSD:", await q(parseEther(btc), [r(BTC, MUSD)]));
for (const musd of ["10", "50", "100"]) console.log(musd, "MUSD -> MEZO:", await q(parseEther(musd), [r(MUSD, MEZO)]));
