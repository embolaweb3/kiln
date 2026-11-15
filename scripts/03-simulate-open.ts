// Dry-runs openTrove at the minimum-debt boundary with eth_call and a balance override.
// Nothing is sent and the wallet does not need funds.
import { decodeErrorResult, formatUnits, parseEther } from "viem";
import { publicClient as c, loadAccount } from "./lib/chain";
import { ADDRESSES, WAD, borrowerOperationsAbi, getHints, collateralForIcr, GAS_COMPENSATION, priceFeedAbi } from "./lib/position";

const me = loadAccount().address;
const price = await c.readContract({ address: ADDRESSES.priceFeed, abi: priceFeedAbi, functionName: "fetchPrice" });
const bo = { address: ADDRESSES.borrowerOperations, abi: borrowerOperationsAbi } as const;

async function trySim(debt: bigint) {
  const fee = await c.readContract({ ...bo, functionName: "getBorrowingFee", args: [debt] });
  const composite = debt + fee + GAS_COMPENSATION;
  const coll = collateralForIcr(composite, 2n * WAD, price);
  const [upper, lower] = await getHints(c, coll, composite);
  try {
    await c.simulateContract({
      ...bo, functionName: "openTrove", args: [debt, upper, lower], value: coll, account: me,
      stateOverride: [{ address: me, balance: parseEther("1") }],
    });
    console.log(`debt ${formatUnits(debt, 18)} net ${formatUnits(debt + fee, 18)} -> OK (coll ${formatUnits(coll, 18)} BTC)`);
  } catch (e: any) {
    console.log(`debt ${formatUnits(debt, 18)} net ${formatUnits(debt + fee, 18)} -> REVERT: ${(e.shortMessage ?? e.message).slice(0, 160)}`);
  }
}

// exact boundary: smallest debt with debt*1.001 >= 1800 is ceil(1800/1.001)
const min = (1800n * WAD * 1000n + 1000n) / 1001n; // ceil(1800e18 / 1.001)
for (const d of [1800n * WAD, min + 1n, min, min - 1n, 1799n * WAD]) await trySim(d);
