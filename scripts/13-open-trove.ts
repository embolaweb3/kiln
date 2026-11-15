// Real openTrove through BorrowerOperations, signed by the test wallet. Target ICR ~150%.
import { writeFileSync } from "node:fs";
import { erc20Abi, formatUnits, parseAbi, parseEventLogs, parseEther } from "viem";
import { publicClient as c, walletFor, loadAccount, txLink } from "./lib/chain";
import { ADDRESSES, WAD, GAS_COMPENSATION, borrowerOperationsAbi, collateralForIcr, getHints, getPosition, priceFeedAbi } from "./lib/position";

const me = loadAccount();
const w = walletFor(me);
const DEBT = 1800n * WAD;
const PCV = "0x4dDD70f4C603b6089c07875Be02fEdFD626b80Af" as const;
const events = parseAbi([
  "event TroveCreated(address indexed _borrower, uint256 arrayIndex)",
  "event TroveUpdated(address indexed _borrower, uint256 _principal, uint256 _interest, uint256 _coll, uint256 _stake, uint16 _interestRate, uint256 _lastInterestUpdateTime, uint8 _operation)",
  "event BorrowingFeePaid(address indexed _borrower, uint256 _fee)",
]);
const musdBal = (a: `0x${string}`) => c.readContract({ address: ADDRESSES.musd, abi: erc20Abi, functionName: "balanceOf", args: [a] });

const price = await c.readContract({ address: ADDRESSES.priceFeed, abi: priceFeedAbi, functionName: "fetchPrice" });
const fee = await c.readContract({ address: ADDRESSES.borrowerOperations, abi: borrowerOperationsAbi, functionName: "getBorrowingFee", args: [DEBT] });
const composite = DEBT + fee + GAS_COMPENSATION;
const coll = collateralForIcr(composite, 15n * 10n ** 17n, price);
const btcBefore = await c.getBalance({ address: me.address });
console.log("price", formatUnits(price, 18), "fee", formatUnits(fee, 18), "collateral", formatUnits(coll, 18), "BTC; wallet", formatUnits(btcBefore, 18));
if (btcBefore - coll < parseEther("0.0003")) throw new Error("would leave less than 0.0003 BTC for gas and the later swap");

const [upper, lower] = await getHints(c, coll, composite);
const musdBefore = await musdBal(me.address);
const pcvBefore = await musdBal(PCV);
const { request } = await c.simulateContract({ account: me, address: ADDRESSES.borrowerOperations, abi: borrowerOperationsAbi, functionName: "openTrove", args: [DEBT, upper, lower], value: coll });
const hash = await w.writeContract(request);
const rc = await c.waitForTransactionReceipt({ hash });
const logs = parseEventLogs({ abi: events, logs: rc.logs });
const pos = await getPosition(c, me.address);
const out = {
  tx: txLink(hash), hash, status: rc.status, gasUsed: rc.gasUsed.toString(), block: rc.blockNumber.toString(),
  requestedDebt: DEBT.toString(), hints: { upper, lower },
  collateralSent: coll.toString(), priceAtOpen: price.toString(),
  musdReceived: ((await musdBal(me.address)) - musdBefore).toString(),
  pcvMusdDelta: ((await musdBal(PCV)) - pcvBefore).toString(),
  btcSpentIncludingGas: (btcBefore - (await c.getBalance({ address: me.address }))).toString(),
  events: logs.map((l) => ({ name: l.eventName, args: JSON.parse(JSON.stringify(l.args, (_, v) => (typeof v === "bigint" ? v.toString() : v))) })),
  position: JSON.parse(JSON.stringify(pos, (_, v) => (typeof v === "bigint" ? v.toString() : v))),
};
writeFileSync("results/trove-open.json", JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
