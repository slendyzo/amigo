export default function PortfolioLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="h-8 w-32 bg-[var(--surface-3)] rounded-lg" />
        <div className="flex items-center gap-2">
          <div className="h-9 w-36 bg-[var(--surface-3)] rounded-lg hidden sm:block" />
          <div className="h-9 w-24 bg-[var(--surface-3)] rounded-lg" />
        </div>
      </div>

      {/* Summary card skeleton */}
      <div className="bg-[var(--surface)] border border-[var(--line)] rounded-2xl p-6 space-y-4">
        <div className="h-3 w-20 bg-[var(--surface-3)] rounded" />
        <div className="h-10 w-48 bg-[var(--surface-3)] rounded-lg" />
        <div className="flex items-center gap-3">
          <div className="h-8 w-36 bg-[var(--surface-3)] rounded-xl" />
          <div className="h-4 w-24 bg-[var(--surface-3)] rounded" />
        </div>
      </div>

      {/* Allocation chart skeleton */}
      <div className="bg-[var(--surface)] border border-[var(--line)] rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="h-4 w-20 bg-[var(--surface-3)] rounded" />
          <div className="flex gap-1">
            <div className="h-7 w-16 bg-[var(--surface-3)] rounded-md" />
            <div className="h-7 w-20 bg-[var(--surface-3)] rounded-md" />
            <div className="h-7 w-16 bg-[var(--surface-3)] rounded-md" />
          </div>
        </div>
        <div className="h-[240px] flex items-center justify-center">
          <div className="w-[180px] h-[180px] rounded-full border-[24px] border-[var(--surface-3)]" />
        </div>
      </div>

      {/* Performance chart skeleton */}
      <div className="bg-[var(--surface)] border border-[var(--line)] rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="h-4 w-24 bg-[var(--surface-3)] rounded" />
          <div className="flex gap-1">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-7 w-10 bg-[var(--surface-3)] rounded-full" />
            ))}
          </div>
        </div>
        <div className="h-[280px] bg-[var(--surface-2)] rounded-xl" />
      </div>

      {/* Asset list skeleton */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="h-5 w-16 bg-[var(--surface-3)] rounded" />
          <div className="h-3 w-12 bg-[var(--surface-3)] rounded" />
        </div>
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="bg-[var(--surface)] border border-[var(--line)] rounded-xl p-4 space-y-3"
          >
            <div className="flex items-start justify-between">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="h-5 w-12 bg-[var(--surface-3)] rounded" />
                  <div className="h-4 w-14 bg-[var(--surface-3)] rounded" />
                </div>
                <div className="h-3 w-28 bg-[var(--surface-3)] rounded" />
              </div>
              <div className="space-y-1 text-right">
                <div className="h-4 w-20 bg-[var(--surface-3)] rounded" />
                <div className="h-3 w-12 bg-[var(--surface-3)] rounded ml-auto" />
              </div>
            </div>
            <div className="h-1 w-full bg-[var(--surface-2)] rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
