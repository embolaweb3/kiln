// Cross-checks lib/position.ts against the contract: ICR at the computed liquidation price must equal MCR.
import { formatUnits } from "viem";
import { publicClient as c, loadAccount } from "./lib/chain";
import { ADDRESSES, MCR, getPosition, troveManagerAbi } from "./lib/position";

const me = loadAccount().address;
const p = await getPosition(c, me);
const icrAtLiq = await c.readContract({ address: ADDRESSES.troveManager, abi: troveManagerAbi, functionName: "getCurrentICR", args: [me, p.liquidationPrice] });
const icrJustAbove = await c.readContract({ address: ADDRESSES.troveManager, abi: troveManagerAbi, functionName: "getCurrentICR", args: [me, p.liquidationPrice + 10n ** 18n] });
const icrJustBelow = await c.readContract({ address: ADDRESSES.troveManager, abi: troveManagerAbi, functionName: "getCurrentICR", args: [me, p.liquidationPrice - 10n ** 18n] });
console.log("status", p.status, "| price", formatUnits(p.price, 18), "| ICR", formatUnits(p.icr, 16) + "%");
console.log("liquidation price", formatUnits(p.liquidationPrice, 18), "| distance", formatUnits(p.liquidationDistance, 16) + "%");
console.log("contract ICR at that price:", icrAtLiq, "(MCR is", MCR + ")");
console.log("at +$1:", formatUnits(icrJustAbove, 16) + "% | at -$1:", formatUnits(icrJustBelow, 16) + "%");
console.log("matches MCR within 1 wei:", icrAtLiq >= MCR - 1n && icrAtLiq <= MCR + 1n);
