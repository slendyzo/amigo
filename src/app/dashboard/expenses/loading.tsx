export default function Loading() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-7 w-40 bg-[var(--surface-3)] rounded" />
        <div className="flex gap-2">
          <div className="h-9 w-28 bg-[var(--surface-3)] rounded-lg" />
          <div className="h-9 w-28 bg-[var(--surface-3)] rounded-lg" />
        </div>
      </div>
      <div className="h-10 w-full bg-[var(--surface-3)] rounded-lg" />
      <div className="space-y-2">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="h-14 bg-[var(--surface-3)] rounded-lg" />
        ))}
      </div>
    </div>
  );
}
