export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex items-start justify-between">
        <div>
          <div className="h-7 w-48 bg-slate-200 rounded" />
          <div className="h-4 w-64 bg-slate-200 rounded mt-2" />
        </div>
        <div className="text-right">
          <div className="h-8 w-10 bg-slate-200 rounded ml-auto" />
          <div className="h-3 w-16 bg-slate-200 rounded mt-1 ml-auto" />
        </div>
      </div>
      <div className="h-2 bg-slate-200 rounded-full" />
      <div className="bg-slate-200 rounded-xl h-80" />
      <div className="bg-slate-200 rounded-xl h-20" />
    </div>
  );
}
