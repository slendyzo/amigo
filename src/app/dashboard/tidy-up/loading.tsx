export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex items-start justify-between">
        <div>
          <div className="h-7 w-48 bg-paper-soft rounded" />
          <div className="h-4 w-64 bg-paper-soft rounded mt-2" />
        </div>
        <div className="text-right">
          <div className="h-8 w-10 bg-paper-soft rounded ml-auto" />
          <div className="h-3 w-16 bg-paper-soft rounded mt-1 ml-auto" />
        </div>
      </div>
      <div className="h-2 bg-paper-soft rounded-full" />
      <div className="bg-paper-soft rounded-md h-80" />
      <div className="bg-paper-soft rounded-md h-20" />
    </div>
  );
}
