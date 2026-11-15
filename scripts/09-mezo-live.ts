// Real transactions proving MEZO approve/transferFrom/permit with contract spenders.
// Costs a few cents of testnet BTC. Results are written to results/mezo-live.json.
import { readFileSync, writeFileSync } from "node:fs";
import { erc20Abi, formatUnits, hexToSignature, keccak256, encodeAbiParameters, parseAbi, parseEther, toHex, type Address, type Hex } from "viem";
import { publicClient as c, walletFor, loadAccount, txLink } from "./lib/chain";
import { BTC, MEZO, ROUTER, routerAbi, routes } from "./08-quote-mezo";

const me = loadAccount();
const w = walletFor(me);
const log: Record<string, any> = {};
const save = () => writeFileSync("results/mezo-live.json", JSON.stringify(log, null, 2));
const art = (n: string) => JSON.parse(readFileSync(`probe/out/Probe.sol/${n}.json`, "utf8")).bytecode.object as Hex;
const RECIPIENT = "0x00000000000000000000000000000000000b0001" as Address;

async function send(label: string, fn: () => Promise<Hex>) {
  try {
    const hash = await fn();
    const rc = await c.waitForTransactionReceipt({ hash });
    log[label] = { status: rc.status, hash, link: txLink(hash), gasUsed: rc.gasUsed.toString(), block: rc.blockNumber.toString() };
    console.log(label, rc.status, txLink(hash));
    save();
    return rc;
  } catch (e: any) {
    log[label] = { status: "not-sent-or-failed", error: (e.shortMessage ?? e.message).slice(0, 300) };
    console.log(label, "FAILED:", log[label].error);
    save();
    return undefined;
  }
}
const mezoBal = (a: Address) => c.readContract({ address: MEZO, abi: erc20Abi, functionName: "balanceOf", args: [a] });
const mezoAllow = (o: Address, s: Address) => c.readContract({ address: MEZO, abi: erc20Abi, functionName: "allowance", args: [o, s] });

// 1. buy MEZO: approve the ERC-20 form of BTC, swap BTC -> MUSD -> MEZO
const swapIn = parseEther("0.0001");
await send("btc_approve_router", () => w.writeContract({ address: BTC, abi: erc20Abi, functionName: "approve", args: [ROUTER, swapIn] }));
await send("swap_btc_to_mezo", () => w.writeContract({
  address: ROUTER, abi: routerAbi, functionName: "swapExactTokensForTokens",
  args: [swapIn, 1n, [...routes], me.address, BigInt(Math.floor(Date.now() / 1000) + 600)] }));
const start = await mezoBal(me.address);
console.log("MEZO balance:", formatUnits(start, 18));
log.mezoBalanceAfterSwap = start.toString();
if (start < 20n * 10n ** 18n) { console.log("not enough MEZO, stopping"); save(); process.exit(1); }

// 2. deploy probe contracts
const abis = {
  Spender: parseAbi(["function pull(address t, address from, address to, uint256 amt) returns (bool)"]),
  Owner: parseAbi(["function run(address t, address s, address to, uint256 amt) returns (uint256,uint256,uint256,uint256)"]),
  PermitRelay: parseAbi(["function run(address t, address s, address owner, address to, uint256 amt, uint256 dl, uint8 v, bytes32 r, bytes32 sg) returns (uint256,uint256)"]),
};
const addr: Record<string, Address> = {};
for (const n of ["Spender", "Owner", "PermitRelay"] as const) {
  const rc = await send(`deploy_${n}`, () => w.deployContract({ abi: abis[n] as any, bytecode: art(n) }));
  if (!rc?.contractAddress) { console.log("deploy failed", n); process.exit(1); }
  addr[n] = rc.contractAddress; log[`deploy_${n}`].address = rc.contractAddress;
}
save();

const AMT = 5n * 10n ** 18n;

// 3. EOA approves contract spender; the contract pulls (the Kiln sale/bond case)
await send("eoa_approve_contract_spender", () => w.writeContract({ address: MEZO, abi: erc20Abi, functionName: "approve", args: [addr.Spender, AMT] }));
log.allowanceAfterApprove = (await mezoAllow(me.address, addr.Spender)).toString();
const r0 = await mezoBal(RECIPIENT);
await send("contract_spender_pull_from_eoa", () => w.writeContract({ address: addr.Spender, abi: abis.Spender, functionName: "pull", args: [MEZO, me.address, RECIPIENT, AMT] }));
log.pullFromEoa = { recipientDelta: (await mezoBal(RECIPIENT) - r0).toString(), allowanceAfter: (await mezoAllow(me.address, addr.Spender)).toString() };
// control: second pull with no allowance left must fail
try { await c.simulateContract({ account: me, address: addr.Spender, abi: abis.Spender, functionName: "pull", args: [MEZO, me.address, RECIPIENT, 1n] }); log.pullWithoutAllowance = "UNEXPECTEDLY OK"; }
catch (e: any) { log.pullWithoutAllowance = `reverts: ${(e.details ?? e.shortMessage ?? "").slice(0, 200)}`; }

// 4. contract-owned MEZO: contract approves another contract and it pulls
await send("fund_owner_contract", () => w.writeContract({ address: MEZO, abi: erc20Abi, functionName: "transfer", args: [addr.Owner, AMT] }));
const r1 = await mezoBal(RECIPIENT);
await send("contract_owner_approve_and_pull", () => w.writeContract({ address: addr.Owner, abi: abis.Owner, functionName: "run", args: [MEZO, addr.Spender, RECIPIENT, AMT] }));
log.contractOwnerFlow = { recipientDelta: (await mezoBal(RECIPIENT) - r1).toString(), ownerBalAfter: (await mezoBal(addr.Owner)).toString() };

// 5. permit signed by the EOA, relayed through a contract, then pulled
const permitAbi = parseAbi(["function DOMAIN_SEPARATOR() view returns (bytes32)", "function nonces(address) view returns (uint256)"]);
const domSep = await c.readContract({ address: MEZO, abi: permitAbi, functionName: "DOMAIN_SEPARATOR" });
const nonce = await c.readContract({ address: MEZO, abi: permitAbi, functionName: "nonces", args: [me.address] });
const th = keccak256(toHex("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"));
let dom: { name: string; version: string } | undefined;
for (const name of ["MEZO", "Mezo"]) {
  const sep = keccak256(encodeAbiParameters([{ type: "bytes32" }, { type: "bytes32" }, { type: "bytes32" }, { type: "uint256" }, { type: "address" }],
    [th, keccak256(toHex(name)), keccak256(toHex("1")), 31611n, MEZO]));
  if (sep === domSep) dom = { name, version: "1" };
}
log.permitDomain = dom ?? "no match for name MEZO/Mezo version 1";
if (dom) {
  const dl = BigInt(Math.floor(Date.now() / 1000) + 3600);
  const sig = hexToSignature(await me.signTypedData({
    domain: { ...dom, chainId: 31611, verifyingContract: MEZO },
    types: { Permit: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }, { name: "value", type: "uint256" }, { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" }] },
    primaryType: "Permit",
    message: { owner: me.address, spender: addr.Spender, value: AMT, nonce, deadline: dl },
  }));
  const r2 = await mezoBal(RECIPIENT);
  await send("permit_relayed_by_contract_then_pull", () => w.writeContract({
    address: addr.PermitRelay, abi: abis.PermitRelay, functionName: "run",
    args: [MEZO, addr.Spender, me.address, RECIPIENT, AMT, dl, Number(sig.v ?? 27n), sig.r, sig.s] }));
  log.permitFlow = { recipientDelta: (await mezoBal(RECIPIENT) - r2).toString(), nonceAfter: (await c.readContract({ address: MEZO, abi: permitAbi, functionName: "nonces", args: [me.address] })).toString() };
}
log.mezoBalanceEnd = (await mezoBal(me.address)).toString();
log.contracts = addr;
save();
console.log(JSON.stringify(log, null, 2));
