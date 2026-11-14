import { formatUnits, parseAbi, parseEther } from "viem";
import { publicClient as c } from "./lib/chain";
export const ROUTER = "0x9a1ff7FE3a0F69959A3fBa1F1e5ee18e1A9CD7E9" as const;
export const FACTORY = "0x4947243CC818b627A5D06d14C4eCe7398A23Ce1A" as const;
export const BTC = "0x7b7C000000000000000000000000000000000000" as const;
export const MUSD = "0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503" as const;
export const MEZO = "0x7B7c000000000000000000000000000000000001" as const;
export const routerAbi = parseAbi([
  "function getAmountsOut(uint256 amountIn, (address from, address to, bool stable, address factory)[] routes) view returns (uint256[] amounts)",
  "function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, (address from, address to, bool stable, address factory)[] routes, address to, uint256 deadline) returns (uint256[] amounts)",
]);
export const routes = [
  { from: BTC, to: MUSD, stable: false, factory: FACTORY },
  { from: MUSD, to: MEZO, stable: false, factory: FACTORY },
] as const;
if (process.argv[1]?.endsWith("08-quote-mezo.ts")) {
  for (const btc of ["0.0001", "0.0002", "0.0005"]) {
    const a = await c.readContract({ address: ROUTER, abi: routerAbi, functionName: "getAmountsOut", args: [parseEther(btc), routes] });
    console.log(btc, "BTC ->", formatUnits(a[1], 18), "MUSD ->", formatUnits(a[2], 18), "MEZO");
  }
}
