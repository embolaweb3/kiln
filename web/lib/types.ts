import type { Address, Hash } from "viem";

/** All token amounts are 18-decimal bigints. Timestamps are unix seconds. */

export type SaleState =
  | "upcoming"
  | "live"
  | "ended" // past end, waiting for finalize
  | "failed" // ended below soft cap, contributors can refund
  | "finalized"
  | "vetoed"; // contributors vetoed the remaining release

export type BondStatus = "escrowed" | "released" | "slashed";

export interface Sale {
  address: Address;
  name: string;
  symbol: string;
  tagline: string;
  team: Address;
  saleToken: Address;
  /** MUSD per sale token */
  price: bigint;
  softCap: bigint;
  hardCap: bigint;
  raised: bigint;
  start: number;
  end: number;
  state: SaleState;
  bond: { amount: bigint; status: BondStatus };
  release: {
    firstTrancheBps: number;
    /** seconds after finalize during which contributors can veto */
    timelock: number;
    /** unix time the timelock ends, null until finalized */
    timelockEnd: number | null;
    vetoBps: number;
    /** contribution weight that has vetoed so far */
    vetoWeight: bigint;
    remainderReleased: boolean;
  };
}

export interface Tier {
  name: "None" | "Base" | "Silver" | "Gold";
  staked: bigint;
  /** max MUSD this wallet may contribute to one sale */
  cap: bigint;
  /** MEZO needed to reach the next tier, null at the top */
  nextTierAt: bigint | null;
  mezoBalance: bigint;
}

export type PositionHealth = "none" | "healthy" | "watch" | "danger";

export interface BorrowPosition {
  active: boolean;
  collateral: bigint; // BTC, 18 decimals
  /** principal plus accrued interest, excludes nothing: this is what the trove owes */
  debt: bigint;
  /** collateral ratio in percent, e.g. 182.4 */
  icr: number;
  btcPrice: number;
  /** BTC price at which the trove hits MCR */
  liquidationPrice: number;
  /** percent the BTC price can fall before liquidation */
  liquidationDistance: number;
  health: PositionHealth;
  musdBalance: bigint;
}

export interface Contribution {
  sale: Sale;
  contributed: bigint;
  /** sale tokens the wallet can claim now */
  claimable: bigint;
  claimed: boolean;
  /** MUSD refundable (failed or vetoed sale) */
  refundable: bigint;
  refunded: boolean;
  canVeto: boolean;
  vetoed: boolean;
}

export interface CreateSaleInput {
  name: string;
  symbol: string;
  saleToken: Address;
  price: bigint;
  softCap: bigint;
  hardCap: bigint;
  start: number;
  end: number;
  firstTrancheBps: number;
  timelock: number;
  vetoBps: number;
  bondAmount: bigint;
}

export interface BorrowQuote {
  /** MUSD the wallet receives */
  amount: bigint;
  fee: bigint;
  gasCompensation: bigint;
  /** amount + fee + gas compensation */
  totalDebt: bigint;
  collateral: bigint;
  icr: number;
  liquidationPrice: number;
  liquidationDistance: number;
}

export interface TxResult {
  hash: Hash;
}

export interface KilnClient {
  listSales(): Promise<Sale[]>;
  getSale(address: Address): Promise<Sale | null>;
  getMyTier(wallet: Address): Promise<Tier>;
  getMyContributions(wallet: Address): Promise<Contribution[]>;
  stakeMezo(amount: bigint): Promise<TxResult>;
  unstakeMezo(amount: bigint): Promise<TxResult>;
  getBorrowPosition(wallet: Address): Promise<BorrowPosition>;
  /** Opens a trove on Mezo, or draws more MUSD if one is already open. */
  borrowMusd(input: { musd: bigint; collateral: bigint }): Promise<TxResult>;
  contribute(sale: Address, amount: bigint): Promise<TxResult>;
  claim(sale: Address): Promise<TxResult>;
  refund(sale: Address): Promise<TxResult>;
  createSale(input: CreateSaleInput): Promise<TxResult>;
  vetoRelease(sale: Address): Promise<TxResult>;
  releaseTranche(sale: Address): Promise<TxResult>;
}
