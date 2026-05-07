export default function AssetDetailLoading() {
  return (
    <div className="space-y-6 max-w-2xl animate-pulse">
      {/* Back link */}
      <div className="h-5 w-20 bg-paper-soft rounded" />

      {/* Hero card */}
      <div className="bg-paper-deep border border-rule rounded-md p-6 space-y-6">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5">
              <div className="h-7 w-16 bg-paper-soft rounded-lg" />
              <div className="h-5 w-14 bg-paper-soft rounded" />
              <div className="h-5 w-20 bg-paper-soft rounded" />
            </div>
            <div className="h-4 w-40 bg-paper-soft rounded" />
          </div>
          <div className="h-6 w-24 bg-paper-soft rounded-lg" />
        </div>
        <div className="flex items-end justify-between">
          <div className="space-y-2">
            <div className="h-3 w-20 bg-paper-soft rounded" />
            <div className="h-9 w-40 bg-paper-soft rounded-lg" />
          </div>
          <div className="space-y-1 text-right">
            <div className="h-3 w-24 bg-paper-soft rounded" />
            <div className="h-6 w-28 bg-paper-soft rounded" />
            <div className="h-4 w-16 bg-paper-soft rounded ml-auto" />
          </div>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="bg-paper-deep border border-rule rounded-md p-3.5 space-y-2"
          >
            <div className="h-2.5 w-16 bg-paper-soft rounded" />
            <div className="h-5 w-24 bg-paper-soft rounded" />
          </div>
        ))}
      </div>

      {/* Comparison bars */}
      <div className="bg-paper-deep border border-rule rounded-md p-5 space-y-4">
        <div className="h-4 w-36 bg-paper-soft rounded" />
        <div className="space-y-3">
          <div className="space-y-1.5">
            <div className="flex justify-between">
              <div className="h-3 w-20 bg-paper-soft rounded" />
              <div className="h-3 w-16 bg-paper-soft rounded" />
            </div>
            <div className="h-3 w-3/4 bg-paper-soft rounded-full" />
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between">
              <div className="h-3 w-24 bg-paper-soft rounded" />
              <div className="h-3 w-16 bg-paper-soft rounded" />
            </div>
            <div className="h-3 w-5/6 bg-paper-soft rounded-full" />
          </div>
        </div>
        <div className="h-10 w-full bg-paper-soft rounded-md" />
      </div>

      {/* Details section */}
      <div className="bg-paper-deep border border-rule rounded-md p-5 space-y-3">
        <div className="h-4 w-16 bg-paper-soft rounded" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex justify-between py-1.5">
            <div className="h-3.5 w-24 bg-paper-soft rounded" />
            <div className="h-3.5 w-28 bg-paper-soft rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
