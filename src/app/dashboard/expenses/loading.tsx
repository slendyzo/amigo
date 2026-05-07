export default function Loading() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-7 w-40 bg-paper-soft rounded" />
        <div className="flex gap-2">
          <div className="h-9 w-28 bg-paper-soft rounded-lg" />
          <div className="h-9 w-28 bg-paper-soft rounded-lg" />
        </div>
      </div>
      <div className="h-10 w-full bg-paper-soft rounded-lg" />
      <div className="space-y-2">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="h-14 bg-paper-soft rounded-lg" />
        ))}
      </div>
    </div>
  );
}
