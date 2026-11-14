import { CardSkeleton, Skeleton } from "./ui";

/** Shown while the wallet tree loads, so the first paint isn't blank. */
export function ShellSkeleton() {
  return (
    <>
      <div className="nav-wrap">
        <nav className="nav">
          <span className="brand"><span className="brand-dot" />Kiln</span>
          <Skeleton h={34} w={220} />
          <Skeleton h={40} w={130} />
        </nav>
      </div>
      <main className="container" aria-busy="true">
        <div className="page-head">
          <Skeleton h={12} w={90} />
          <Skeleton h={34} w="60%" />
          <Skeleton h={16} w="45%" />
        </div>
        <div className="grid cols-2">
          <CardSkeleton />
          <CardSkeleton />
        </div>
      </main>
    </>
  );
}
