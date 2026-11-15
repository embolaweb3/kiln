// Read-side helpers for a MUSD trove on Mezo testnet (chain 31611).
// Self-contained on purpose: copy this file into the frontend, it only needs viem.
// Names and return shapes are taken from mezo-org/musd solidity/contracts.
import { parseAbi, type Address, type PublicClient } from "viem";

export const ADDRESSES = {
  borrowerOperations: "0xCdF7028ceAB81fA0C6971208e83fa7872994beE5",
  troveManager: "0xE47c80e8c23f6B4A1aE41c34837a0599D5D16bb0",
  sortedTroves: "0x722E4D24FD6Ff8b0AC679450F3D91294607268fA",
  hintHelpers: "0x4e4cBA3779d56386ED43631b4dCD6d8EacEcBCF6",
  priceFeed: "0x86bCF0841622a5dAC14A313a15f96A95421b9366",
  musd: "0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503",
} as const satisfies Record<string, Address>;

export const WAD = 10n ** 18n;
export const MCR = 11n * 10n ** 17n; // 110%, LiquityBase.MCR
export const CCR = 15n * 10n ** 17n; // 150%, recovery mode threshold
export const GAS_COMPENSATION = 200n * WAD; // LiquityBase.MUSD_GAS_COMPENSATION

export const troveManagerAbi = parseAbi([
  "function getEntireDebtAndColl(address) view returns (uint256 coll, uint256 principal, uint256 interest, uint256 pendingCollateral, uint256 pendingPrincipal, uint256 pendingInterest)",
  "function getCurrentICR(address borrower, uint256 price) view returns (uint256)",
  "function getTroveStatus(address) view returns (uint8)",
  "function getTroveInterestRate(address) view returns (uint16)",
  "function getTroveMaxBorrowingCapacity(address) view returns (uint256)",
  "function getTCR(uint256 price) view returns (uint256)",
  "function checkRecoveryMode(uint256 price) view returns (bool)",
  "function getTroveOwnersCount() view returns (uint256)",
]);

export const priceFeedAbi = parseAbi(["function fetchPrice() view returns (uint256)"]);

export const hintHelpersAbi = parseAbi([
  "function getApproxHint(uint256 _CR, uint256 _numTrials, uint256 _inputRandomSeed) view returns (address hintAddress, uint256 diff, uint256 latestRandomSeed)",
  "function computeNominalCR(uint256 _coll, uint256 _debt) pure returns (uint256)",
]);

export const sortedTrovesAbi = parseAbi([
  "function findInsertPosition(uint256 _NICR, address _prevId, address _nextId) view returns (address, address)",
]);

export const borrowerOperationsAbi = parseAbi([
  "function openTrove(uint256 _debtAmount, address _upperHint, address _lowerHint) payable",
  "function addColl(address _upperHint, address _lowerHint) payable",
  "function withdrawColl(uint256 _amount, address _upperHint, address _lowerHint)",
  "function withdrawMUSD(uint256 _amount, address _upperHint, address _lowerHint)",
  "function repayMUSD(uint256 _amount, address _upperHint, address _lowerHint)",
  "function adjustTrove(uint256 _collWithdrawal, uint256 _debtChange, bool _isDebtIncrease, address _upperHint, address _lowerHint) payable",
  "function closeTrove()",
  "function minNetDebt() view returns (uint256)",
  "function borrowingRate() view returns (uint256)",
  "function getBorrowingFee(uint256 _debt) view returns (uint256)",
]);

// Order matches ITroveManager.Status.
export const TroveStatus = ["nonExistent", "active", "closedByOwner", "closedByLiquidation", "closedByRedemption"] as const;

export type Position = {
  status: (typeof TroveStatus)[number];
  /** Native BTC collateral, 18 decimals, includes pending redistribution gains. */
  collateral: bigint;
  /** principal + accrued interest + pending, includes the 200 MUSD gas compensation. 18 decimals. */
  debt: bigint;
  principal: bigint;
  interest: bigint;
  /** Annual rate in basis points, fixed at open (100 = 1%). */
  interestRateBps: number;
  /** BTC/USD, 18 decimals. */
  price: bigint;
  /** Collateral ratio as a WAD fraction, 1.5e18 = 150%. Max uint256 when debt is zero. */
  icr: bigint;
  /** Price at which ICR hits MCR (liquidatable below this), 18 decimals USD per BTC. */
  liquidationPrice: bigint;
  /** How far BTC can fall before liquidation, as a WAD fraction (0.35e18 = 35%). 0 if already at or under. */
  liquidationDistance: bigint;
  /** Debt you must hold in MUSD to close: debt minus the refunded gas compensation. */
  repayToClose: bigint;
};

/** Price at which ICR == MCR for a given collateral and debt. */
export function liquidationPriceOf(collateral: bigint, debt: bigint): bigint {
  if (collateral === 0n) return 0n;
  return (MCR * debt) / collateral;
}

/** Fraction of the current price BTC can drop before liquidation (WAD). */
export function liquidationDistanceOf(price: bigint, liqPrice: bigint): bigint {
  if (price === 0n || liqPrice >= price) return 0n;
  return ((price - liqPrice) * WAD) / price;
}

/** Collateral needed (wei) to open at a target ICR for a given composite debt. */
export function collateralForIcr(compositeDebt: bigint, targetIcr: bigint, price: bigint): bigint {
  // round up so the resulting ICR is not below target
  return (compositeDebt * targetIcr + price - 1n) / price;
}

export async function getPosition(client: PublicClient, borrower: Address): Promise<Position> {
  const tm = { address: ADDRESSES.troveManager, abi: troveManagerAbi } as const;
  const [status, entire, rate, price] = await Promise.all([
    client.readContract({ ...tm, functionName: "getTroveStatus", args: [borrower] }),
    client.readContract({ ...tm, functionName: "getEntireDebtAndColl", args: [borrower] }),
    client.readContract({ ...tm, functionName: "getTroveInterestRate", args: [borrower] }),
    client.readContract({ address: ADDRESSES.priceFeed, abi: priceFeedAbi, functionName: "fetchPrice" }),
  ]);
  // The first three values already include the pending redistribution amounts
  // (TroveManager adds them before returning), so don't add them again.
  const [collateral, principal, interest] = entire;
  const debt = principal + interest;
  const icr = await client.readContract({ ...tm, functionName: "getCurrentICR", args: [borrower, price] });
  const liquidationPrice = liquidationPriceOf(collateral, debt);
  return {
    status: TroveStatus[status] ?? "nonExistent",
    collateral,
    debt,
    principal,
    interest,
    interestRateBps: rate,
    price,
    icr,
    liquidationPrice,
    liquidationDistance: liquidationDistanceOf(price, liquidationPrice),
    repayToClose: debt > GAS_COMPENSATION ? debt - GAS_COMPENSATION : 0n,
  };
}

/**
 * Hints for openTrove / adjust calls. Uses the same two-step recipe as Liquity:
 * getApproxHint on the target nominal ICR, then SortedTroves.findInsertPosition.
 * Returns [upperHint, lowerHint].
 */
export async function getHints(
  client: PublicClient,
  collateral: bigint,
  compositeDebt: bigint,
  numTrials = 15n * 20n,
  seed = 42n,
): Promise<[Address, Address]> {
  const nicr = await client.readContract({
    address: ADDRESSES.hintHelpers,
    abi: hintHelpersAbi,
    functionName: "computeNominalCR",
    args: [collateral, compositeDebt],
  });
  const [hint] = await client.readContract({
    address: ADDRESSES.hintHelpers,
    abi: hintHelpersAbi,
    functionName: "getApproxHint",
    args: [nicr, numTrials, seed],
  });
  const [upper, lower] = await client.readContract({
    address: ADDRESSES.sortedTroves,
    abi: sortedTrovesAbi,
    functionName: "findInsertPosition",
    args: [nicr, hint, hint],
  });
  return [upper, lower];
}
