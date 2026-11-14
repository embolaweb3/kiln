import { encodeAbiParameters, erc20Abi, keccak256, type Address } from "viem";
import { publicClient as c } from "./lib/chain";
const MEZO = "0x7B7c000000000000000000000000000000000001" as const;
const holder = "0x8eb88d745B0aFFF9D71AbC40d7F550Cded7bB342" as Address; // MUSD/MEZO pool
const bal = await c.readContract({ address: MEZO, abi: erc20Abi, functionName: "balanceOf", args: [holder] });
console.log("holder balance", bal);
for (let s = 0n; s < 200n; s++) {
  const slot = keccak256(encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [holder, s]));
  const v = await c.getStorageAt({ address: MEZO, slot });
  if (v && BigInt(v) === bal) console.log("mapping base slot:", s);
}
for (let s = 0n; s < 8n; s++) console.log("raw slot", s, await c.getStorageAt({ address: MEZO, slot: `0x${s.toString(16).padStart(64, "0")}` }));
