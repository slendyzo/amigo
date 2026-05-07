export default function PortfolioLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="h-8 w-32 bg-slate-200 rounded-lg" />
        <div className="flex items-center gap-2">
          <div className="h-9 w-36 bg-slate-200 rounded-lg hidden sm:block" />
          <div className="h-9 w-24 bg-slate-200 rounded-lg" />
        </div>
      </div>

      {/* Summary card skeleton */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
        <div className="h-3 w-20 bg-slate-200 rounded" />
        <div className="h-10 w-48 bg-slate-200 rounded-lg" />
        <div className="flex items-center gap-3">
          <div className="h-8 w-36 bg-slate-200 rounded-xl" />
          <div className="h-4 w-24 bg-slate-200 rounded" />
        </div>
      </div>

      {/* Allocation chart skeleton */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="h-4 w-20 bg-slate-200 rounded" />
          <div className="flex gap-1">
            <div className="h-7 w-16 bg-slate-200 rounded-md" />
            <div className="h-7 w-20 bg-slate-200 rounded-md" />
            <div className="h-7 w-16 bg-slate-200 rounded-md" />
          </div>
        </div>
        <div className="h-[240px] flex items-center justify-center">
          <div className="w-[180px] h-[180px] rounded-full border-[24px] border-slate-200" />
        </div>
      </div>

      {/* Performance chart skeleton */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="h-4 w-24 bg-slate-200 rounded" />
          <div className="flex gap-1">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-7 w-10 bg-slate-200 rounded-full" />
            ))}
          </div>
        </div>
        <div className="h-[280px] bg-slate-100 rounded-xl" />
      </div>

      {/* Asset list skeleton */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="h-5 w-16 bg-slate-200 rounded" />
          <div className="h-3 w-12 bg-slate-200 rounded" />
        </div>
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="bg-white border border-slate-200 rounded-xl p-4 space-y-3"
          >
            <div className="flex items-start justify-between">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="h-5 w-12 bg-slate-200 rounded" />
                  <div className="h-4 w-14 bg-slate-200 rounded" />
                </div>
                <div className="h-3 w-28 bg-slate-200 rounded" />
              </div>
              <div className="space-y-1 text-right">
                <div className="h-4 w-20 bg-slate-200 rounded" />
                <div className="h-3 w-12 bg-slate-200 rounded ml-auto" />
              </div>
            </div>
            <div className="h-1 w-full bg-slate-100 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
