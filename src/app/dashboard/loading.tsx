export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex items-start justify-between">
        <div>
          <div className="h-7 w-48 bg-[var(--surface-3)] rounded" />
          <div className="h-4 w-32 bg-[var(--surface-3)] rounded mt-2" />
        </div>
        <div className="flex gap-2">
          <div className="h-9 w-24 bg-[var(--surface-3)] rounded-lg" />
          <div className="h-9 w-24 bg-[var(--surface-3)] rounded-lg" />
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-24 bg-[var(--surface-3)] rounded-xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="h-64 bg-[var(--surface-3)] rounded-xl" />
        <div className="h-64 bg-[var(--surface-3)] rounded-xl" />
      </div>
      <div className="h-48 bg-[var(--surface-3)] rounded-xl" />
    </div>
  );
}
