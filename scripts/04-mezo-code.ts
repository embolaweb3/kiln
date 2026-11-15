import { keccak256 } from "viem";
import { publicClient as c } from "./lib/chain";

const MEZO = "0x7B7c000000000000000000000000000000000001" as const;
const code = (await c.getCode({ address: MEZO }))!;
const bytes = (code.length - 2) / 2;
console.log("eth_getCode length (bytes):", bytes);
console.log("codehash:", keccak256(code));
console.log("first 32 bytes:", code.slice(0, 66));
console.log("last 53 bytes (solc metadata tail):", code.slice(-106));
console.log("contains 0xfe-only stub?", /^0x(fe)+$/.test(code));
console.log("nonce/balance:", await c.getTransactionCount({ address: MEZO }), await c.getBalance({ address: MEZO }));
const sels = [...new Set(code.match(/63[0-9a-f]{8}(?=81|14|80)/g) ?? [])].map((s) => s.slice(2));
console.log("PUSH4 selectors:", sels.join(" "));
const proxySlots = ["0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc", "0x7050c9e0f4ca769c69bd3a8ef740bc37934f8e2c036e5a723fd8ee048ed3f8c3"];
for (const s of proxySlots) console.log("proxy slot", s.slice(0, 10), await c.getStorageAt({ address: MEZO, slot: s as `0x${string}` }));
