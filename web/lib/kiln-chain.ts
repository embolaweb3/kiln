import {
  decodeEventLog,
  erc20Abi as stdErc20Abi,
  type Abi,
  type Address,
  type Hash,
  type PublicClient,
  type WalletClient,
} from "viem";
import factoryJson from "./abi/KilnFactory.json";
import saleJson from "./abi/Sale.json";
import teamBondJson from "./abi/TeamBond.json";
import vaultJson from "./abi/MezoTierVault.json";
import { loadDeployment, type Deployment } from "./deployments";
import { borrowMusdOnMezo, mezoChain, mezoPublicClient, readBorrowPosition } from "./mezo";
import { resolveSaleMeta, saveSaleMeta } from "./sale-meta";
import type {
  BondStatus,
  Contribution,
  CreateSaleInput,
  KilnClient,
  Sale,
  SaleState,
  Tier,
  TxResult,
} from "./types";

const factoryAbi = factoryJson as Abi;
const saleAbi = saleJson as Abi;
const bondAbi = teamBondJson as Abi;
const vaultAbi = vaultJson as Abi;

// Sale.State, in declaration order
const SALE_STATES: SaleState[] = [
  "upcoming", // Upcoming
  "live", // Live
  "failed", // Failed
  "ended", // AwaitingFinalize
  "finalized", // Timelocked
  "finalized", // Releasable
  "finalized", // Completed
  "vetoed", // Vetoed
];
// TeamBond.Status: None, Held, Released, Slashed
const BOND_STATUS: BondStatus[] = ["escrowed", "escrowed", "released", "slashed"];

const BPS = 10_000n;
const ONE = 10n ** 18n;
const now = () => Math.floor(Date.now() / 1000);

export interface ChainDeps {
  getWallet: () => WalletClient | undefined;
  /** defaults to a client pinned to Mezo testnet, tests pass an anvil one */
  publicClient?: PublicClient;
  loadDeployment?: () => Promise<Deployment>;
}

export function createChainClient(deps: ChainDeps): KilnClient {
  const pub = deps.publicClient ?? mezoPublicClient();
  const load = deps.loadDeployment ?? loadDeployment;

  // typed enough for our own use, the ABIs are JSON so viem can't infer them
  const read = <T>(address: Address, abi: Abi, functionName: string, args: unknown[] = []) =>
    pub.readContract({ address, abi, functionName, args }) as Promise<T>;

  function wallet() {
    const w = deps.getWallet();
    if (!w?.account) throw new Error("Wallet not connected");
    return { w, account: w.account.address };
  }

  /** Simulates first so reverts surface as named contract errors, then sends and waits. */
  async function send(address: Address, abi: Abi, functionName: string, args: unknown[] = []): Promise<TxResult> {
    const { w, account } = wallet();
    await pub.simulateContract({ address, abi, functionName, args, account });
    const hash = await w.writeContract({ address, abi, functionName, args, account: w.account!, chain: mezoChain });
    await confirm(hash);
    return { hash };
  }

  async function confirm(hash: Hash) {
    const r = await pub.waitForTransactionReceipt({ hash });
    if (r.status !== "success") throw new Error("Transaction reverted on chain");
    return r;
  }

  /** Plain approve, only when the current allowance is too low. */
  async function ensureAllowance(token: Address, spender: Address, amount: bigint) {
    const { account } = wallet();
    const current = await read<bigint>(token, stdErc20Abi as Abi, "allowance", [account, spender]);
    if (current >= amount) return;
    await send(token, stdErc20Abi as Abi, "approve", [spender, amount]);
  }

  const metaCache = new Map<string, Promise<Awaited<ReturnType<typeof resolveSaleMeta>>>>();

  async function readSale(address: Address, d: Deployment): Promise<Sale> {
    const r = <T>(fn: string) => read<T>(address, saleAbi, fn);
    const [team, saleToken, price, softCap, hardCap, start, end, firstTrancheBps, timelock, vetoBps, raised, state, finalizedAt, vetoWeight, remainderReleased, bond] =
      await Promise.all([
        r<Address>("team"),
        r<Address>("saleToken"),
        r<bigint>("price"),
        r<bigint>("softCap"),
        r<bigint>("hardCap"),
        r<bigint>("start"),
        r<bigint>("end"),
        r<bigint>("firstTrancheBps"),
        r<bigint>("timelock"),
        r<bigint>("vetoBps"),
        r<bigint>("totalRaised"),
        r<number>("state"),
        r<bigint>("finalizedAt"),
        r<bigint>("vetoWeight"),
        r<boolean>("remainderReleased"),
        read<readonly [Address, bigint, number]>(d.TeamBond, bondAbi, "bonds", [address]),
      ]);

    if (!metaCache.has(address)) metaCache.set(address, resolveSaleMeta(address, saleToken));
    const meta = await metaCache.get(address)!;

    return {
      address,
      name: meta.name ?? "Unnamed sale",
      symbol: meta.symbol ?? "—",
      tagline: meta.tagline ?? "",
      team,
      saleToken,
      price,
      softCap,
      hardCap,
      raised,
      start: Number(start),
      end: Number(end),
      state: SALE_STATES[state] ?? "live",
      bond: { amount: bond[1], status: BOND_STATUS[bond[2]] ?? "escrowed" },
      release: {
        firstTrancheBps: Number(firstTrancheBps),
        timelock: Number(timelock),
        timelockEnd: finalizedAt > 0n ? Number(finalizedAt + timelock) : null,
        vetoBps: Number(vetoBps),
        vetoWeight,
        remainderReleased,
      },
    };
  }

  async function listSales() {
    const d = await load();
    const count = await read<bigint>(d.KilnFactory, factoryAbi, "saleCount");
    const addrs = await Promise.all(
      Array.from({ length: Number(count) }, (_, i) => read<Address>(d.KilnFactory, factoryAbi, "sales", [BigInt(i)])),
    );
    const sales = await Promise.all(addrs.map((a) => readSale(a, d)));
    return sales.reverse(); // newest first
  }

  // Tier labels are presentation only. The contract has a linear cap curve,
  // so we name bands by how much of the max cap a wallet has unlocked.
  const BANDS = [
    { name: "Base", from: 0n },
    { name: "Silver", from: 25n },
    { name: "Gold", from: 60n },
  ] as const;

  async function getMyTier(wallet_: Address): Promise<Tier> {
    const d = await load();
    const v = d.MezoTierVault;
    const [staked, cap, baseCap, capPerMezo, maxCap, lockCount, balance] = await Promise.all([
      read<bigint>(v, vaultAbi, "staked", [wallet_]),
      read<bigint>(v, vaultAbi, "maxContribution", [wallet_]),
      read<bigint>(v, vaultAbi, "baseCap"),
      read<bigint>(v, vaultAbi, "capPerMezo"),
      read<bigint>(v, vaultAbi, "maxCap"),
      read<bigint>(v, vaultAbi, "lockCount", [wallet_]),
      read<bigint>(d.mezo, stdErc20Abi as Abi, "balanceOf", [wallet_]),
    ]);

    const pct = maxCap === 0n ? 0n : (cap * 100n) / maxCap;
    let idx = 0;
    BANDS.forEach((b, i) => {
      if (pct >= b.from) idx = i;
    });
    const next = BANDS[idx + 1];
    let nextTierAt: bigint | null = null;
    if (next && capPerMezo > 0n && cap < maxCap) {
      const targetCap = (maxCap * next.from) / 100n;
      nextTierAt = targetCap > baseCap ? ((targetCap - baseCap) * ONE + capPerMezo - 1n) / capPerMezo : 0n;
    }
    return {
      name: cap === 0n ? "None" : BANDS[idx].name,
      staked,
      cap,
      nextTierAt,
      mezoBalance: balance,
      stakeLocked: lockCount > 0n,
    };
  }

  async function getMyContributions(who: Address): Promise<Contribution[]> {
    const d = await load();
    const sales = await listSales();
    const rows = await Promise.all(
      sales.map(async (sale) => {
        const a = sale.address;
        const [contributed, refunded, claimed, vetoed, vetoRefunded, locked, slashClaimed] = await Promise.all([
          read<bigint>(a, saleAbi, "contributionOf", [who]),
          read<boolean>(a, saleAbi, "refunded", [who]),
          read<boolean>(a, saleAbi, "tokensClaimed", [who]),
          read<boolean>(a, saleAbi, "hasVetoed", [who]),
          read<boolean>(a, saleAbi, "vetoRefundClaimed", [who]),
          read<boolean>(d.MezoTierVault, vaultAbi, "lockedBy", [a, who]),
          read<boolean>(d.TeamBond, bondAbi, "slashClaimed", [a, who]),
        ]);
        if (contributed === 0n) return null;

        const isFinalized = sale.release.timelockEnd !== null;
        const settled = isFinalized || sale.state === "failed";
        let refundable = 0n;
        if (sale.state === "failed" && !refunded) refundable = contributed;
        if (sale.state === "vetoed" && !vetoRefunded && sale.raised > 0n) {
          const first = (sale.raised * BigInt(sale.release.firstTrancheBps)) / BPS;
          refundable = (contributed * (sale.raised - first)) / sale.raised;
        }
        const bondShare =
          sale.bond.status === "slashed" && !slashClaimed && sale.raised > 0n
            ? (sale.bond.amount * contributed) / sale.raised
            : 0n;

        return {
          sale,
          contributed,
          claimable: isFinalized && !claimed ? (contributed * ONE) / sale.price : 0n,
          claimed,
          refundable,
          refunded: refunded || vetoRefunded,
          bondShare,
          canVeto:
            isFinalized && sale.state !== "vetoed" && !vetoed && now() < (sale.release.timelockEnd ?? 0),
          vetoed,
          stakeLocked: locked,
          canUnlock: locked && settled,
        } satisfies Contribution;
      }),
    );
    return rows.filter((r): r is Contribution => r !== null);
  }

  return {
    listSales,
    async getSale(address) {
      const d = await load();
      const known = await read<boolean>(d.KilnFactory, factoryAbi, "isSale", [address]);
      return known ? readSale(address, d) : null;
    },
    getMyTier,
    getMyContributions,

    async stakeMezo(amount) {
      const d = await load();
      await ensureAllowance(d.mezo, d.MezoTierVault, amount);
      return send(d.MezoTierVault, vaultAbi, "stake", [amount]);
    },
    async unstakeMezo(amount) {
      const d = await load();
      return send(d.MezoTierVault, vaultAbi, "unstake", [amount]);
    },
    async unlockStake(sale, who) {
      const d = await load();
      return send(d.MezoTierVault, vaultAbi, "unlock", [sale, who]);
    },

    getBorrowPosition: readBorrowPosition,
    async borrowMusd(input) {
      const { w } = wallet();
      return borrowMusdOnMezo(w, input);
    },

    async contribute(sale, amount) {
      const d = await load();
      await ensureAllowance(d.musd, sale, amount);
      return send(sale, saleAbi, "contribute", [amount]);
    },
    async claim(sale) {
      return send(sale, saleAbi, "claim");
    },
    async refund(sale) {
      // failed sales refund directly, vetoed ones pay the unreleased share
      const state = await read<number>(sale, saleAbi, "state");
      return send(sale, saleAbi, SALE_STATES[state] === "vetoed" ? "claimVetoRefund" : "refund");
    },
    async claimBondShare(sale) {
      const d = await load();
      return send(d.TeamBond, bondAbi, "claimSlash", [sale]);
    },
    async finalizeSale(sale) {
      const state = await read<number>(sale, saleAbi, "state");
      return send(sale, saleAbi, SALE_STATES[state] === "failed" ? "reclaimOnFailure" : "finalize");
    },
    async vetoRelease(sale) {
      return send(sale, saleAbi, "veto");
    },
    async releaseTranche(sale) {
      return send(sale, saleAbi, "releaseRemainder");
    },

    async createSale(input: CreateSaleInput) {
      const d = await load();
      const { w, account } = wallet();

      // the factory pulls the sale tokens for the hard cap and the MEZO bond
      const decimals = await read<number>(input.saleToken, stdErc20Abi as Abi, "decimals");
      const tokensNeeded = (input.hardCap * 10n ** BigInt(decimals)) / input.price;
      await ensureAllowance(input.saleToken, d.KilnFactory, tokensNeeded);
      await ensureAllowance(d.mezo, d.KilnFactory, input.bondAmount);

      const config = {
        saleToken: input.saleToken,
        price: input.price,
        softCap: input.softCap,
        hardCap: input.hardCap,
        start: BigInt(input.start),
        end: BigInt(input.end),
        firstTrancheBps: BigInt(input.firstTrancheBps),
        timelock: BigInt(input.timelock),
        vetoBps: BigInt(input.vetoBps),
        bondAmount: input.bondAmount,
      };
      await pub.simulateContract({ address: d.KilnFactory, abi: factoryAbi, functionName: "createSale", args: [config], account });
      const hash = await w.writeContract({
        address: d.KilnFactory,
        abi: factoryAbi,
        functionName: "createSale",
        args: [config],
        account: w.account!,
        chain: mezoChain,
      });
      const receipt = await confirm(hash);

      for (const log of receipt.logs) {
        try {
          const ev = decodeEventLog({ abi: factoryAbi, data: log.data, topics: log.topics });
          if (ev.eventName === "SaleCreated") {
            const sale = (ev.args as unknown as { sale: Address }).sale;
            saveSaleMeta(sale, { name: input.name, symbol: input.symbol, tagline: input.tagline });
            break;
          }
        } catch {
          // log from another contract, e.g. a token Transfer
        }
      }
      return { hash };
    },
  };
}
