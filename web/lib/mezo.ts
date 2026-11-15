import {
  createPublicClient,
  defineChain,
  http,
  parseAbi,
  type Address,
  type PublicClient,
  type WalletClient,
} from "viem";
import type { BorrowPosition, BorrowQuote, PositionHealth, TxResult } from "./types";

// Addresses and parameters come from docs/mezo-integration.md section 4,
// all [verified-chain] on 2026-11-14. Function signatures were checked
// against mezo-org/musd source.

export const MEZO_CHAIN_ID = 31611;
export const MEZO_RPC = "https://rpc.test.mezo.org";

export const mezoChain = defineChain({
  id: MEZO_CHAIN_ID,
  name: "Mezo Testnet",
  nativeCurrency: { name: "Bitcoin", symbol: "BTC", decimals: 18 },
  rpcUrls: { default: { http: [MEZO_RPC] } },
  blockExplorers: {
    default: { name: "Mezo Explorer", url: "https://explorer.test.mezo.org" },
  },
  testnet: true,
});

export const MEZO = {
  musd: "0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503",
  borrowerOperations: "0xCdF7028ceAB81fA0C6971208e83fa7872994beE5",
  troveManager: "0xE47c80e8c23f6B4A1aE41c34837a0599D5D16bb0",
  sortedTroves: "0x722E4D24FD6Ff8b0AC679450F3D91294607268fA",
  hintHelpers: "0x4e4cBA3779d56386ED43631b4dCD6d8EacEcBCF6",
  priceFeed: "0x86bCF0841622a5dAC14A313a15f96A95421b9366",
  mezoToken: "0x7B7c000000000000000000000000000000000001",
} as const satisfies Record<string, Address>;

/** Protocol constants, see research doc section 1. */
export const MCR_PERCENT = 110;
export const GAS_COMPENSATION = 200n * 10n ** 18n;
export const MIN_NET_DEBT = 1800n * 10n ** 18n;
/** 0.1%, verified from borrowingRate() = 1e15 */
export const BORROWING_FEE = 10n ** 15n;
export const INTEREST_BPS = 100;
/** Below this ICR we warn, the research doc suggests 200%+ as a comfortable buffer */
export const SAFE_ICR = 200;
export const WATCH_ICR = 150;

export const borrowerOperationsAbi = parseAbi([
  "function openTrove(uint256 _debtAmount, address _upperHint, address _lowerHint) payable",
  "function adjustTrove(uint256 _collWithdrawal, uint256 _debtChange, bool _isDebtIncrease, address _upperHint, address _lowerHint) payable",
  "function minNetDebt() view returns (uint256)",
  "function getBorrowingFee(uint256 _debt) view returns (uint256)",
]);

const troveManagerAbi = parseAbi([
  "function getEntireDebtAndColl(address _borrower) view returns (uint256 coll, uint256 principal, uint256 interest, uint256 pendingCollateral, uint256 pendingPrincipal, uint256 pendingInterest)",
  "function getTroveStatus(address _borrower) view returns (uint8)",
]);

const hintHelpersAbi = parseAbi([
  "function getApproxHint(uint256 _CR, uint256 _numTrials, uint256 _inputRandomSeed) view returns (address hintAddress, uint256 diff, uint256 latestRandomSeed)",
]);

const sortedTrovesAbi = parseAbi([
  "function findInsertPosition(uint256 _NICR, address _prevId, address _nextId) view returns (address, address)",
]);

const priceFeedAbi = parseAbi(["function fetchPrice() view returns (uint256)"]);

export const erc20Abi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
]);

const TROVE_ACTIVE = 1;
const ONE = 10n ** 18n;

let cachedPublic: PublicClient | null = null;
/** Read client pinned to Mezo testnet, independent of the connected wallet. */
export function mezoPublicClient(): PublicClient {
  cachedPublic ??= createPublicClient({
    chain: mezoChain,
    transport: http(MEZO_RPC, { retryCount: 3, timeout: 10_000 }),
  }) as PublicClient;
  return cachedPublic;
}

export function healthOf(icr: number): PositionHealth {
  if (icr >= SAFE_ICR) return "healthy";
  if (icr >= WATCH_ICR) return "watch";
  return "danger";
}

/**
 * Collateral ratio math as the protocol does it: price is 18-decimal USD per BTC,
 * debt is MUSD (1 MUSD = 1 USD for the ratio).
 */
export function collateralRatio(collateral: bigint, debt: bigint, btcPrice: number): number {
  if (debt === 0n) return Infinity;
  const collUsd = (Number(collateral) / 1e18) * btcPrice;
  return (collUsd / (Number(debt) / 1e18)) * 100;
}

export function liquidationPriceOf(collateral: bigint, debt: bigint): number {
  if (collateral === 0n) return 0;
  return ((Number(debt) / 1e18) * MCR_PERCENT) / 100 / (Number(collateral) / 1e18);
}

/**
 * What a fresh borrow would look like. `existingDebt` and `existingCollateral`
 * are added in when the wallet already has a trove, because the position is
 * shared and ICR is judged on the total.
 */
export function quoteBorrow(args: {
  musd: bigint;
  collateral: bigint;
  btcPrice: number;
  existingDebt?: bigint;
  existingCollateral?: bigint;
}): BorrowQuote {
  const fee = (args.musd * BORROWING_FEE) / ONE;
  const opening = (args.existingDebt ?? 0n) === 0n;
  const gas = opening ? GAS_COMPENSATION : 0n;
  const totalDebt = (args.existingDebt ?? 0n) + args.musd + fee + gas;
  const collateral = (args.existingCollateral ?? 0n) + args.collateral;
  const icr = collateralRatio(collateral, totalDebt, args.btcPrice);
  const liqPrice = liquidationPriceOf(collateral, totalDebt);
  return {
    amount: args.musd,
    fee,
    gasCompensation: gas,
    totalDebt,
    collateral,
    icr,
    liquidationPrice: liqPrice,
    liquidationDistance: args.btcPrice > 0 ? (1 - liqPrice / args.btcPrice) * 100 : 0,
  };
}

/** BTC needed to open `musd` at a target ICR, rounded up so the target is met. */
export function collateralForIcr(musd: bigint, btcPrice: number, targetIcr: number): bigint {
  const fee = (musd * BORROWING_FEE) / ONE;
  const debt = Number(musd + fee + GAS_COMPENSATION) / 1e18;
  const btc = (debt * targetIcr) / 100 / btcPrice;
  return BigInt(Math.ceil(btc * 1e8)) * 10n ** 10n;
}

export async function fetchBtcPrice(client = mezoPublicClient()): Promise<number> {
  const p = await client.readContract({
    address: MEZO.priceFeed,
    abi: priceFeedAbi,
    functionName: "fetchPrice",
  });
  return Number(p) / 1e18;
}

export async function readBorrowPosition(wallet: Address): Promise<BorrowPosition> {
  const client = mezoPublicClient();
  const [status, entire, btcPrice, musdBalance] = await Promise.all([
    client.readContract({
      address: MEZO.troveManager,
      abi: troveManagerAbi,
      functionName: "getTroveStatus",
      args: [wallet],
    }),
    client.readContract({
      address: MEZO.troveManager,
      abi: troveManagerAbi,
      functionName: "getEntireDebtAndColl",
      args: [wallet],
    }),
    fetchBtcPrice(client),
    client.readContract({
      address: MEZO.musd,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [wallet],
    }),
  ]);

  const [coll, principal, interest, pendingColl, pendingPrincipal, pendingInterest] = entire;
  const active = status === TROVE_ACTIVE;
  const collateral = coll + pendingColl;
  const debt = principal + interest + pendingPrincipal + pendingInterest;

  if (!active) {
    return {
      active: false,
      collateral: 0n,
      debt: 0n,
      icr: 0,
      btcPrice,
      liquidationPrice: 0,
      liquidationDistance: 0,
      health: "none",
      musdBalance,
    };
  }

  const icr = collateralRatio(collateral, debt, btcPrice);
  const liquidationPrice = liquidationPriceOf(collateral, debt);
  return {
    active,
    collateral,
    debt,
    icr,
    btcPrice,
    liquidationPrice,
    liquidationDistance: (1 - liquidationPrice / btcPrice) * 100,
    health: healthOf(icr),
    musdBalance,
  };
}

async function insertHints(totalDebt: bigint, collateral: bigint): Promise<[Address, Address]> {
  const client = mezoPublicClient();
  // nominal ICR is coll * 1e20 / debt, LiquityMath.NICR_PRECISION
  const nicr = (collateral * 10n ** 20n) / totalDebt;
  const [hint] = await client.readContract({
    address: MEZO.hintHelpers,
    abi: hintHelpersAbi,
    functionName: "getApproxHint",
    args: [nicr, 15n, 42n],
  });
  const [upper, lower] = await client.readContract({
    address: MEZO.sortedTroves,
    abi: sortedTrovesAbi,
    functionName: "findInsertPosition",
    args: [nicr, hint, hint],
  });
  return [upper, lower];
}

/**
 * Opens a trove, or adjusts the existing one since Mezo allows a single trove
 * per address. Goes straight to BorrowerOperations, no Kiln contract involved.
 */
export async function borrowMusdOnMezo(
  wallet: WalletClient,
  input: { musd: bigint; collateral: bigint },
): Promise<TxResult> {
  const account = wallet.account;
  if (!account) throw new Error("Wallet not connected");
  const position = await readBorrowPosition(account.address);
  const quote = quoteBorrow({
    musd: input.musd,
    collateral: input.collateral,
    btcPrice: position.btcPrice,
    existingDebt: position.debt,
    existingCollateral: position.collateral,
  });

  if (!position.active && input.musd < MIN_NET_DEBT) {
    throw new Error("Below the minimum net debt of 1,800 MUSD");
  }
  const [upper, lower] = await insertHints(quote.totalDebt, quote.collateral);

  const common = { account, chain: mezoChain, address: MEZO.borrowerOperations, abi: borrowerOperationsAbi } as const;
  const hash = position.active
    ? await wallet.writeContract({
        ...common,
        functionName: "adjustTrove",
        args: [0n, input.musd, true, upper, lower],
        value: input.collateral,
      })
    : await wallet.writeContract({
        ...common,
        functionName: "openTrove",
        args: [input.musd, upper, lower],
        value: input.collateral,
      });
  return { hash };
}
