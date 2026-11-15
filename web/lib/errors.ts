import { BaseError } from "viem";

// Contract custom errors (Sale, KilnFactory, MezoTierVault, TeamBond) in plain words.
const CONTRACT_ERRORS: Record<string, string> = {
  NotStarted: "This sale has not started yet.",
  SaleClosed: "This sale is closed.",
  HardCapExceeded: "That would go over the sale's hard cap.",
  WalletCapExceeded: "That is above your tier cap. Stake more MEZO to raise it.",
  FeeOnTransferToken: "This token takes a fee on transfer, which Kiln does not support.",
  SaleNotFailed: "This sale did not fail.",
  AlreadyRefunded: "You have already been refunded.",
  NothingContributed: "You have no contribution in this sale.",
  AlreadyFinalized: "This sale is already finalized.",
  SoftCapNotMet: "The sale did not reach its soft cap.",
  SaleNotEnded: "The sale has not ended yet.",
  NotFinalized: "The sale is not finalized yet.",
  AlreadyClaimed: "Already claimed.",
  AlreadyVetoed: "A veto was already cast, or the release was already decided.",
  TimelockOver: "The veto window is over.",
  TimelockActive: "The release timelock is still running.",
  VetoNotTriggered: "No veto passed on this sale.",
  AlreadyReleased: "Already released.",
  NothingToRefund: "Nothing to refund.",
  StakeLocked: "Your stake is locked by a sale that has not been unlocked. Unlock it on My positions first.",
  InsufficientStake: "You do not have that much MEZO staked.",
  NotLocked: "Nothing is locked for this sale.",
  SaleNotSettled: "That sale has not settled yet, so the stake stays locked.",
  ZeroAmount: "Enter an amount above zero.",
  BondTooSmall: "The MEZO bond is below the minimum.",
  StartInPast: "The start time is in the past.",
  DurationOutOfBounds: "The sale length is outside the allowed range.",
  TimelockOutOfBounds: "The timelock is outside the allowed range.",
  SoftCapTooLow: "The soft cap is too low compared to the hard cap.",
  FirstTrancheTooHigh: "The first tranche is above the allowed maximum.",
  VetoThresholdOutOfBounds: "The veto threshold is outside the allowed range.",
  NotSlashed: "This bond was not slashed.",
  NothingToClaim: "Nothing to claim.",
};

/** Set by the app when the connected wallet is a Passport Bitcoin wallet. */
let passportWallet = false;
export function setPassportWallet(v: boolean) {
  passportWallet = v;
}

function revertName(e: unknown): string | undefined {
  if (!(e instanceof BaseError)) return undefined;
  const found = e.walk((x) => (x as { data?: { errorName?: string } }).data?.errorName !== undefined);
  return (found as { data?: { errorName?: string } } | null)?.data?.errorName;
}

export type FriendlyKind = "rejected" | "rpc" | "wallet" | "other";

/** Turns viem/wagmi/wallet errors into something a contributor can act on. */
export function friendlyError(e: unknown): { message: string; kind: FriendlyKind } {
  const err = e as { name?: string; code?: number; shortMessage?: string; message?: string; cause?: { code?: number } };
  const text = `${err?.name ?? ""} ${err?.shortMessage ?? ""} ${err?.message ?? ""}`;

  if (err?.name === "KilnNotDeployedError") return { message: err.message ?? "", kind: "other" };

  if (
    err?.code === 4001 ||
    err?.cause?.code === 4001 ||
    /UserRejected|User rejected|User denied|rejected the request|ACTION_REJECTED/i.test(text)
  ) {
    return { message: "You declined the request in your wallet. Nothing was sent.", kind: "rejected" };
  }

  const name = revertName(e);
  if (name && CONTRACT_ERRORS[name]) return { message: CONTRACT_ERRORS[name], kind: "other" };

  if (/HttpRequestError|fetch failed|Failed to fetch|NetworkError|timed out|TimeoutError|RPC/i.test(text)) {
    return { message: "Could not reach the Mezo RPC. Check your connection and try again.", kind: "rpc" };
  }
  if (/insufficient funds/i.test(text)) {
    return { message: "Not enough BTC in the wallet to cover this and the network fee.", kind: "other" };
  }
  if (/transfer amount exceeds (balance|allowance)|insufficient (allowance|balance)|ERC20InsufficientAllowance|ERC20InsufficientBalance/i.test(text)) {
    return { message: "Token balance or approval was too low for this transaction.", kind: "other" };
  }

  // The wallet connected but the write still failed, and we couldn't name a
  // contract reason. For Passport wallets the smart-account path (it, not your
  // Bitcoin address, calls transferFrom) hasn't been proven with Kiln yet.
  if (passportWallet) {
    return {
      message:
        "Your Bitcoin wallet is connected, but its Mezo smart account could not complete this transaction. Passport accounts are not fully tested with Kiln yet. Try again, or connect an EVM wallet instead.",
      kind: "wallet",
    };
  }
  return { message: err?.shortMessage ?? err?.message ?? "Something went wrong.", kind: "other" };
}
