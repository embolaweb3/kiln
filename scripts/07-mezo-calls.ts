import { publicClient as c } from "./lib/chain";
const MEZO = "0x7B7c000000000000000000000000000000000001" as const;
const code = (await c.getCode({ address: MEZO }))!;
// PUSH20 (0x73) followed by 20 bytes
const found = new Set<string>();
for (const m of code.slice(2).matchAll(/73([0-9a-f]{40})/g)) found.add("0x" + m[1]);
console.log("PUSH20 constants:", [...found]);
// opcode scan for call-family and delegatecall presence (rough, ignores push data)
const hex = code.slice(2); const ops: Record<string, number> = {};
for (let i = 0; i < hex.length; ) {
  const op = parseInt(hex.slice(i, i + 2), 16); i += 2;
  if (op >= 0x60 && op <= 0x7f) { i += (op - 0x5f) * 2; continue; }
  const name = ({ 0xf1: "CALL", 0xf2: "CALLCODE", 0xf4: "DELEGATECALL", 0xfa: "STATICCALL", 0x54: "SLOAD", 0x55: "SSTORE", 0xf0: "CREATE", 0xff: "SELFDESTRUCT" } as any)[op];
  if (name) ops[name] = (ops[name] ?? 0) + 1;
}
console.log("opcode counts:", ops);
