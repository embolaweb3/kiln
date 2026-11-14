/** Turns viem/wagmi/wallet errors into something a contributor can act on. */
export function friendlyError(e: unknown): { message: string; kind: "rejected" | "rpc" | "other" } {
  const err = e as { name?: string; code?: number; shortMessage?: string; message?: string; cause?: { code?: number } };
  const text = `${err?.name ?? ""} ${err?.shortMessage ?? ""} ${err?.message ?? ""}`;

  if (
    err?.code === 4001 ||
    err?.cause?.code === 4001 ||
    /UserRejected|User rejected|User denied|rejected the request|ACTION_REJECTED/i.test(text)
  ) {
    return { message: "You declined the request in your wallet. Nothing was sent.", kind: "rejected" };
  }
  if (/HttpRequestError|fetch failed|Failed to fetch|NetworkError|timed out|TimeoutError|RPC/i.test(text)) {
    return {
      message: "Could not reach the Mezo RPC. Check your connection and try again.",
      kind: "rpc",
    };
  }
  if (/insufficient funds/i.test(text)) {
    return { message: "Not enough BTC in the wallet to cover this and the network fee.", kind: "other" };
  }
  return { message: err?.shortMessage ?? err?.message ?? "Something went wrong.", kind: "other" };
}
