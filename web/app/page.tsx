"use client";

import { useKiln } from "@/components/kiln-context";
import { SaleCard } from "@/components/sale-card";
import { CardSkeleton, EmptyState, ErrorState, useReveal } from "@/components/ui";
import { useAsync } from "@/hooks/use-async";
import Link from "next/link";

export default function SalesPage() {
  const kiln = useKiln();
  const { data, error, loading, reload } = useAsync(() => kiln.listSales(), [kiln]);
  const ref = useReveal<HTMLDivElement>(data);

  return (
    <div ref={ref}>
      <div className="page-head">
        <span className="eyebrow">Token sales</span>
        <h1>Join sales without selling your BTC.</h1>
        <p className="muted" style={{ maxWidth: 560 }}>
          Borrow MUSD against BTC on Mezo, stake MEZO for a bigger allocation, and contribute. Every team escrows a MEZO bond.
        </p>
      </div>

      {error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : loading ? (
        <div className="grid cols-2">{[0, 1, 2, 3].map((i) => <CardSkeleton key={i} />)}</div>
      ) : data && data.length === 0 ? (
        <EmptyState
          title="No sales yet"
          body="Be the first team to launch on Kiln. You escrow a MEZO bond and set the caps."
          action={<Link href="/create" className="btn sm">Create a sale</Link>}
        />
      ) : (
        <div className="grid cols-2">{data?.map((s) => <SaleCard key={s.address} sale={s} />)}</div>
      )}
    </div>
  );
}
