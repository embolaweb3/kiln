/**
 * Runs the real chain client against an anvil fork with Kiln deployed.
 *
 *   FORK_RPC=http://127.0.0.1:8599 DEPLOYMENT=/path/to/deployment.json \
 *     npx tsx scripts/fork-e2e.ts
 *
 * MEZO is a precompile that anvil can't execute, so the deployment must have been
 * made with MEZO_ADDRESS pointing at a MockERC20 (mint() is called here).
 */
import { readFileSync } from "node:fs";
import { createPublicClient, createWalletClient, http, parseAbi, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createChainClient } from "../lib/kiln-chain";
import { setDeploymentForTests, type Deployment } from "../lib/deployments";
import { friendlyError } from "../lib/errors";
import { mezoChain } from "../lib/mezo";

const RPC = process.env.FORK_RPC ?? "http://127.0.0.1:8599";
const dep = JSON.parse(readFileSync(process.env.DEPLOYMENT as string, "utf8")) as Deployment;
setDeploymentForTests(dep);

const chain = { ...mezoChain, rpcUrls: { default: { http: [RPC] } } };
const pub = createPublicClient({ chain, transport: http(RPC) });
// anvil's published test keys
const TEAM_KEY: Hex = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const USER_KEY: Hex = "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a";
const wallet = (key: Hex) => createWalletClient({ account: privateKeyToAccount(key), chain, transport: http(RPC) });
const team = wallet(TEAM_KEY);
const user = wallet(USER_KEY);
const teamClient = createChainClient({ getWallet: () => team, publicClient: pub as never });
const userClient = createChainClient({ getWallet: () => user, publicClient: pub as never });

const E = (n: number) => BigInt(Math.round(n * 1e6)) * 10n ** 12n;
const erc20 = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function mint(address,uint256)",
]);
const bal = (token: Address, who: Address) =>
  pub.readContract({ address: token, abi: erc20, functionName: "balanceOf", args: [who] });

let failures = 0;
function check(name: string, ok: boolean, extra = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`);
  if (!ok) failures++;
}
async function expectFail(name: string, p: Promise<unknown>, contains: string) {
  try {
    await p;
    check(name, false, "did not fail");
  } catch (e) {
    const m = friendlyError(e).message;
    check(name, m.includes(contains), `-> "${m}"`);
  }
}
async function warp(seconds: number) {
  await pub.request({ method: "evm_increaseTime" as never, params: [seconds] as never });
  await pub.request({ method: "evm_mine" as never, params: [] as never });
}
const rpc = (method: string, params: unknown[]) => pub.request({ method: method as never, params: params as never });

async function makeSale(tag: string) {
  const block = await pub.getBlock();
  const start = Number(block.timestamp) + 30;
  const before = (await teamClient.listSales()).length;
  await teamClient.createSale({
    name: tag,
    symbol: tag.slice(0, 4).toUpperCase(),
    saleToken: dep.demoTokens!.EMBR,
    price: E(0.25),
    softCap: E(600),
    hardCap: E(3000),
    start,
    end: start + 700,
    firstTrancheBps: 3000,
    timelock: 400,
    vetoBps: 3000,
    bondAmount: E(5),
  });
  const sales = await teamClient.listSales();
  check(`createSale ${tag}`, sales.length === before + 1, `sale ${sales[0].address}`);
  await warp(40);
  return sales[0].address;
}

async function main() {
  const t = team.account.address;
  const u = user.account.address;
  await rpc("anvil_setBalance", [u, "0x" + (5n * 10n ** 18n).toString(16)]);
  for (const who of [t, u]) {
    await team.writeContract({ address: dep.mezo, abi: erc20, functionName: "mint", args: [who, E(100)], gas: 200_000n, gasPrice: 1_000_000_000n });
  }

  // The real borrow path can't complete on anvil: Mezo's PriceFeed reads an oracle precompile
  // (0x7b7c...0015) that anvil reports as NotActivated, so openTrove reverts in fetchPrice().
  // Hints, ABI and calldata are still exercised up to that point.
  try {
    await userClient.borrowMusd({ musd: E(2000), collateral: E(0.12) });
    check("borrowMusd (real BorrowerOperations)", true);
  } catch {
    console.log("SKIP  borrowMusd: openTrove needs the oracle precompile, funding MUSD from PCV instead");
    const PCV: Address = "0x4dDD70f4C603b6089c07875Be02fEdFD626b80Af";
    await rpc("anvil_impersonateAccount", [PCV]);
    await rpc("anvil_setBalance", [PCV, "0x" + (10n ** 18n).toString(16)]);
    const pcv = createWalletClient({ account: PCV, chain, transport: http(RPC) });
    await pcv.writeContract({
      address: dep.musd,
      abi: parseAbi(["function transfer(address,uint256) returns (bool)"]),
      functionName: "transfer",
      args: [u, E(2000)],
      gas: 200_000n,
      gasPrice: 1_000_000_000n,
    });
  }
  const musd = await bal(dep.musd, u);
  check("user holds MUSD", musd >= E(2000), `${Number(musd) / 1e18} MUSD`);

  // stake with approval
  await userClient.stakeMezo(E(5));
  const tier = await userClient.getMyTier(u);
  check("stakeMezo approves then stakes", tier.staked === E(5) && tier.cap === E(1000), `cap ${Number(tier.cap) / 1e18}, tier ${tier.name}`);

  // Sale A: finalize, veto, refund, bond share
  const a = await makeSale("Vetoed Co");
  await userClient.contribute(a, E(800));
  let mine = await userClient.getMyContributions(u);
  check("contribute approves MUSD then contributes", mine[0]?.contributed === E(800) && mine[0].stakeLocked);
  await expectFail("unstake blocked while locked", userClient.unstakeMezo(E(1)), "locked");
  await expectFail("contribute above cap", userClient.contribute(a, E(300)), "tier cap");
  await warp(800);
  check("state ended before finalize", (await userClient.getSale(a))?.state === "ended");
  await userClient.finalizeSale(a);
  await userClient.claim(a);
  check("claim pays sale tokens", (await bal(dep.demoTokens!.EMBR, u)) === E(3200));
  mine = await userClient.getMyContributions(u);
  check("canVeto during timelock", mine.find((c) => c.sale.address === a)?.canVeto === true);
  await userClient.vetoRelease(a);
  check("veto at 100% flips sale to vetoed", (await userClient.getSale(a))?.state === "vetoed");
  const beforeRefund = await bal(dep.musd, u);
  mine = await userClient.getMyContributions(u);
  const rowA = mine.find((c) => c.sale.address === a)!;
  await userClient.refund(a);
  const gotBack = (await bal(dep.musd, u)) - beforeRefund;
  check("refund on vetoed sale pays unreleased share", gotBack === rowA.refundable && gotBack === E(560), `${Number(gotBack) / 1e18} MUSD`);
  check("bond share shown", rowA.bondShare === E(5), `${Number(rowA.bondShare) / 1e18} MEZO`);
  const mezoBefore = await bal(dep.mezo, u);
  await userClient.claimBondShare(a);
  check("claimBondShare pays MEZO", (await bal(dep.mezo, u)) - mezoBefore === E(5));

  // Sale B: release path
  const b = await makeSale("Released Co");
  await userClient.contribute(b, E(800));
  await warp(800);
  await userClient.finalizeSale(b);
  await expectFail("release blocked during timelock", teamClient.releaseTranche(b), "timelock");
  await warp(500);
  const teamMusd = await bal(dep.musd, t);
  await teamClient.releaseTranche(b);
  check("releaseTranche pays the team", (await bal(dep.musd, t)) - teamMusd === E(560));
  check("bond returned", (await teamClient.getSale(b))?.bond.status === "released");

  // Sale C: fails under soft cap
  const c = await makeSale("Failed Co");
  await userClient.contribute(c, E(100));
  await warp(800);
  check("failed state", (await userClient.getSale(c))?.state === "failed");
  const before = await bal(dep.musd, u);
  await userClient.refund(c);
  check("refund on failed sale", (await bal(dep.musd, u)) - before === E(100));
  await teamClient.finalizeSale(c);
  check("reclaimOnFailure returns bond", (await teamClient.getSale(c))?.bond.status === "released");

  // unlock then unstake
  mine = await userClient.getMyContributions(u);
  check("all settled sales unlockable", mine.length === 3 && mine.every((r) => r.canUnlock), mine.map((r) => r.canUnlock).join());
  for (const r of mine) await userClient.unlockStake(r.sale.address, u);
  check("stake no longer locked", !(await userClient.getMyTier(u)).stakeLocked);
  await userClient.unstakeMezo(E(5));
  check("unstake after unlock", (await userClient.getMyTier(u)).staked === 0n);

  console.log(failures ? `\n${failures} FAILED` : "\nall passed");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
