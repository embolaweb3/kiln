// Adjust tests on the open trove: addColl, withdrawColl, repayMUSD, adjustTrove, plus revert checks.
import { writeFileSync } from "node:fs";
import { erc20Abi, formatUnits, parseEther, type Hex } from "viem";
import { publicClient as c, walletFor, loadAccount, txLink } from "./lib/chain";
import { ADDRESSES, WAD, borrowerOperationsAbi, getHints, getPosition } from "./lib/position";

const me = loadAccount();
const w = walletFor(me);
const bo = { address: ADDRESSES.borrowerOperations, abi: borrowerOperationsAbi } as const;
const out: any[] = [];
const ser = (o: any) => JSON.parse(JSON.stringify(o, (_, v) => (typeof v === "bigint" ? v.toString() : v)));
const snap = async () => {
  const p = await getPosition(c, me.address);
  const musd = await c.readContract({ address: ADDRESSES.musd, abi: erc20Abi, functionName: "balanceOf", args: [me.address] });
  return { coll: p.collateral, debt: p.debt, icr: p.icr, interest: p.interest, musdWallet: musd };
};
const pct = (x: bigint) => (Number(x) / 1e16).toFixed(3) + "%";

async function step(label: string, newColl: (s: Awaited<ReturnType<typeof snap>>) => bigint, newDebt: (s: Awaited<ReturnType<typeof snap>>) => bigint,
  call: (hints: [`0x${string}`, `0x${string}`]) => { functionName: any; args: any; value?: bigint }) {
  const before = await snap();
  const hints = await getHints(c, newColl(before), newDebt(before));
  const req = call(hints);
  let hash: Hex | undefined; let err: string | undefined;
  for (let attempt = 0; attempt < 2 && !hash; attempt++) {
    try {
      const { request } = await c.simulateContract({ account: me, ...bo, ...req } as any);
      hash = await w.writeContract(request as any);
    } catch (e: any) {
      err = (e.shortMessage ?? e.message).replace(/\s+/g, " ").slice(0, 220);
      if (!/Missing or invalid parameters/.test(err ?? "")) break;
    }
  }
  if (!hash) { out.push({ label, sent: false, error: err }); console.log(label, "-> not sent:", err); return; }
  const rc = await c.waitForTransactionReceipt({ hash });
  const after = await snap();
  out.push(ser({ label, sent: true, status: rc.status, link: txLink(hash), hash, gasUsed: rc.gasUsed, before, after }));
  console.log(`${label}: ${rc.status} ${txLink(hash)} | coll ${formatUnits(before.coll, 18)} -> ${formatUnits(after.coll, 18)} | debt ${formatUnits(before.debt, 18)} -> ${formatUnits(after.debt, 18)} | ICR ${pct(before.icr)} -> ${pct(after.icr)} | wallet MUSD ${formatUnits(before.musdWallet, 18)} -> ${formatUnits(after.musdWallet, 18)}`);
}
async function expectRevert(label: string, req: { functionName: any; args: any; value?: bigint }) {
  try { await c.simulateContract({ account: me, ...bo, ...req } as any); out.push({ label, reverted: false }); console.log(label, "-> UNEXPECTEDLY OK"); }
  catch (e: any) { const m = (e.shortMessage ?? e.message).replace(/\s+/g, " ").slice(0, 200); out.push({ label, reverted: true, reason: m }); console.log(label, "-> reverts:", m); }
}

const ONE = WAD;
const dust = parseEther("0.0001");
await step("addColl 0.0001 BTC", (s) => s.coll + dust, (s) => s.debt, ([u, l]) => ({ functionName: "addColl", args: [u, l], value: dust }));
await step("withdrawColl 0.0001 BTC", (s) => s.coll - dust, (s) => s.debt, ([u, l]) => ({ functionName: "withdrawColl", args: [dust, u, l] }));
await expectRevert("repayMUSD 5 (drops net debt below 1800)", { functionName: "repayMUSD", args: [5n * ONE, "0x0000000000000000000000000000000000000000", "0x0000000000000000000000000000000000000000"] });
await step("repayMUSD 1", (s) => s.coll, (s) => s.debt - ONE, ([u, l]) => ({ functionName: "repayMUSD", args: [ONE, u, l] }));
await step("withdrawMUSD 1 (fee applies)", (s) => s.coll, (s) => s.debt + ONE, ([u, l]) => ({ functionName: "withdrawMUSD", args: [ONE, u, l] }));
await step("adjustTrove: addColl 0.00005 BTC + borrow 1 MUSD", (s) => s.coll + dust / 2n, (s) => s.debt + ONE, ([u, l]) => ({ functionName: "adjustTrove", args: [0n, ONE, true, u, l], value: dust / 2n }));
const z = "0x0000000000000000000000000000000000000000";
await expectRevert("adjustTrove with both msg.value and collWithdrawal", { functionName: "adjustTrove", args: [dust, 0n, false, z, z], value: dust });
await expectRevert("withdrawColl that would push ICR under 110%", { functionName: "withdrawColl", args: [parseEther("0.02"), z, z] });
await expectRevert("closeTrove with MUSD wallet short of debt-200", { functionName: "closeTrove", args: [] });
const final = await getPosition(c, me.address);
out.push({ label: "final position", position: ser(final) });
writeFileSync("results/trove-adjust.json", JSON.stringify(out, null, 2));
