import type { Address } from "viem";
import type {
  BorrowPosition,
  Contribution,
  CreateSaleInput,
  KilnClient,
  Sale,
  Tier,
  TxResult,
} from "@/lib/types";
import {
  collateralRatio,
  fetchBtcPrice,
  healthOf,
  liquidationPriceOf,
  readBorrowPosition,
  borrowMusdOnMezo,
} from "@/lib/mezo";
import type { WalletClient } from "viem";

const E = (n: number) => BigInt(Math.round(n * 1e6)) * 10n ** 12n;
const now = () => Math.floor(Date.now() / 1000);
const HOUR = 3600;
const DAY = 86400;
const addr = (n: number): Address => `0x${n.toString(16).padStart(40, "0")}` as Address;
const fakeHash = () =>
  `0x${Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join("")}` as `0x${string}`;
const wait = (ms = 450) => new Promise((r) => setTimeout(r, ms));

function sale(p: Partial<Sale> & Pick<Sale, "address" | "name" | "symbol">): Sale {
  return {
    tagline: "",
    team: addr(0xaa),
    saleToken: addr(0xbb),
    price: E(0.25),
    softCap: E(30_000),
    hardCap: E(120_000),
    raised: 0n,
    start: now() - DAY,
    end: now() + 3 * DAY,
    state: "live",
    bond: { amount: E(5_000), status: "escrowed" },
    release: {
      firstTrancheBps: 3000,
      timelock: 3 * DAY,
      timelockEnd: null,
      vetoBps: 3000,
      vetoWeight: 0n,
      remainderReleased: false,
    },
    ...p,
  };
}

// Edge cases on purpose: one ending soon, one failed, one vetoed, one in timelock.
function seedSales(): Sale[] {
  return [
    sale({
      address: addr(0x1001),
      name: "Aurora Labs",
      symbol: "AUR",
      tagline: "Intent-based routing for Bitcoin-backed credit",
      raised: E(74_400),
      end: now() + 2 * DAY + 5 * HOUR,
    }),
    sale({
      address: addr(0x1002),
      name: "Tidepool",
      symbol: "TIDE",
      tagline: "Streaming payroll in MUSD",
      price: E(0.1),
      raised: E(112_300),
      end: now() + 38 * 60,
    }),
    sale({
      address: addr(0x1003),
      name: "Ember Protocol",
      symbol: "EMBR",
      tagline: "Perps vault with BTC margin",
      start: now() + 2 * DAY,
      end: now() + 6 * DAY,
      state: "upcoming",
    }),
    sale({
      address: addr(0x1004),
      name: "Quarry",
      symbol: "QRY",
      tagline: "On-chain mining hashrate index",
      raised: E(11_200),
      start: now() - 6 * DAY,
      end: now() - DAY,
      state: "failed",
    }),
    sale({
      address: addr(0x1005),
      name: "Saltmarsh",
      symbol: "SALT",
      tagline: "Treasury tooling for DAOs",
      raised: E(86_000),
      start: now() - 12 * DAY,
      end: now() - 9 * DAY,
      state: "vetoed",
      bond: { amount: E(5_000), status: "slashed" },
      release: {
        firstTrancheBps: 3000,
        timelock: 3 * DAY,
        timelockEnd: now() - 6 * DAY,
        vetoBps: 3000,
        vetoWeight: E(31_400),
        remainderReleased: false,
      },
    }),
    sale({
      address: addr(0x1006),
      name: "Hearth",
      symbol: "HRTH",
      tagline: "Rent-to-own vaults on Mezo",
      raised: E(98_000),
      start: now() - 8 * DAY,
      end: now() - 5 * DAY,
      state: "finalized",
      release: {
        firstTrancheBps: 3000,
        timelock: 7 * DAY,
        timelockEnd: now() + 2 * DAY + 3 * HOUR,
        vetoBps: 3000,
        vetoWeight: E(12_500),
        remainderReleased: false,
      },
    }),
  ];
}

interface Holding {
  contributed: bigint;
  claimed: boolean;
  refunded: boolean;
  vetoed: boolean;
}

const sales = new Map(seedSales().map((s) => [s.address, s]));
const holdings = new Map<Address, Holding>([
  [addr(0x1001), { contributed: E(2_400), claimed: false, refunded: false, vetoed: false }],
  [addr(0x1004), { contributed: E(1_800), claimed: false, refunded: false, vetoed: false }],
  [addr(0x1005), { contributed: E(2_000), claimed: false, refunded: false, vetoed: true }],
  [addr(0x1006), { contributed: E(3_000), claimed: false, refunded: false, vetoed: false }],
]);

let staked = E(1_500);
const mezoBalance = () => E(4_000) - staked;

const TIERS = [
  { name: "None", min: 0, cap: 0 },
  { name: "Base", min: 0.000001, cap: 2_000 },
  { name: "Silver", min: 1_000, cap: 5_000 },
  { name: "Gold", min: 5_000, cap: 15_000 },
] as const;

function tierFor(stakedAmount: bigint): Tier {
  const s = Number(stakedAmount) / 1e18;
  let idx = 1;
  TIERS.forEach((t, i) => {
    if (s >= t.min && i > 0) idx = i;
  });
  const next = TIERS[idx + 1];
  return {
    name: TIERS[idx].name,
    staked: stakedAmount,
    cap: E(TIERS[idx].cap),
    nextTierAt: next ? E(next.min) : null,
    mezoBalance: mezoBalance(),
  };
}

function claimableOf(s: Sale, h: Holding): bigint {
  if (s.state !== "finalized" || h.claimed) return 0n;
  return (h.contributed * 10n ** 18n) / s.price;
}

function refundableOf(s: Sale, h: Holding): bigint {
  if (h.refunded) return 0n;
  if (s.state === "failed") return h.contributed;
  if (s.state === "vetoed") return h.contributed;
  return 0n;
}

const tx = async (): Promise<TxResult> => {
  await wait();
  return { hash: fakeHash() };
};

const positionOverride = process.env.NEXT_PUBLIC_FIXTURE_POSITION;

async function fixturePosition(): Promise<BorrowPosition | null> {
  // Only used to demo edge cases. Without it the real Mezo read runs.
  if (positionOverride !== "near-liquidation" && positionOverride !== "healthy") return null;
  const btcPrice = await fetchBtcPrice().catch(() => 65_000);
  const collateral = E(0.5);
  const debt = positionOverride === "healthy" ? E(10_000) : E(Math.round((0.5 * btcPrice) / 1.17));
  const icr = collateralRatio(collateral, debt, btcPrice);
  const liq = liquidationPriceOf(collateral, debt);
  return {
    active: true,
    collateral,
    debt,
    icr,
    btcPrice,
    liquidationPrice: liq,
    liquidationDistance: (1 - liq / btcPrice) * 100,
    health: healthOf(icr),
    musdBalance: E(1_900),
  };
}

export function createFixtureClient(getWallet: () => WalletClient | undefined): KilnClient {
  const ensureOpen = (a: Address) => {
    const s = sales.get(a);
    if (!s) throw new Error("Sale not found");
    return s;
  };
  const hold = (a: Address) => {
    const h = holdings.get(a) ?? { contributed: 0n, claimed: false, refunded: false, vetoed: false };
    holdings.set(a, h);
    return h;
  };

  return {
    async listSales() {
      await wait(250);
      return [...sales.values()];
    },
    async getSale(a) {
      await wait(150);
      return sales.get(a) ?? null;
    },
    async getMyTier() {
      await wait(150);
      return tierFor(staked);
    },
    async getMyContributions(): Promise<Contribution[]> {
      await wait(250);
      return [...holdings.entries()].flatMap(([a, h]) => {
        const s = sales.get(a);
        if (!s || h.contributed === 0n) return [];
        return [
          {
            sale: s,
            contributed: h.contributed,
            claimable: claimableOf(s, h),
            claimed: h.claimed,
            refundable: refundableOf(s, h),
            refunded: h.refunded,
            canVeto:
              s.state === "finalized" &&
              !h.vetoed &&
              s.release.timelockEnd !== null &&
              s.release.timelockEnd > now(),
            vetoed: h.vetoed,
          },
        ];
      });
    },
    async stakeMezo(amount) {
      const r = await tx();
      staked += amount;
      return r;
    },
    async unstakeMezo(amount) {
      const r = await tx();
      staked = amount > staked ? 0n : staked - amount;
      return r;
    },
    async getBorrowPosition(wallet) {
      return (await fixturePosition()) ?? readBorrowPosition(wallet);
    },
    async borrowMusd(input) {
      // real Mezo call even in fixture mode
      const w = getWallet();
      if (!w) throw new Error("Wallet not connected");
      return borrowMusdOnMezo(w, input);
    },
    async contribute(a, amount) {
      const s = ensureOpen(a);
      if (s.state !== "live") throw new Error("Sale is not live");
      const cap = tierFor(staked).cap;
      const h = hold(a);
      if (h.contributed + amount > cap) throw new Error("Above your tier cap");
      if (s.raised + amount > s.hardCap) throw new Error("Above the hard cap");
      const r = await tx();
      h.contributed += amount;
      s.raised += amount;
      return r;
    },
    async claim(a) {
      const r = await tx();
      hold(a).claimed = true;
      return r;
    },
    async refund(a) {
      const r = await tx();
      hold(a).refunded = true;
      return r;
    },
    async createSale(input: CreateSaleInput) {
      const r = await tx();
      const address = addr(0x2000 + sales.size);
      sales.set(
        address,
        sale({
          address,
          name: input.name,
          symbol: input.symbol,
          saleToken: input.saleToken,
          price: input.price,
          softCap: input.softCap,
          hardCap: input.hardCap,
          start: input.start,
          end: input.end,
          state: input.start > now() ? "upcoming" : "live",
          bond: { amount: input.bondAmount, status: "escrowed" },
          release: {
            firstTrancheBps: input.firstTrancheBps,
            timelock: input.timelock,
            timelockEnd: null,
            vetoBps: input.vetoBps,
            vetoWeight: 0n,
            remainderReleased: false,
          },
        }),
      );
      return r;
    },
    async vetoRelease(a) {
      const s = ensureOpen(a);
      const h = hold(a);
      const r = await tx();
      h.vetoed = true;
      s.release.vetoWeight += h.contributed;
      return r;
    },
    async releaseTranche(a) {
      const s = ensureOpen(a);
      const r = await tx();
      s.release.remainderReleased = true;
      return r;
    },
  };
}
