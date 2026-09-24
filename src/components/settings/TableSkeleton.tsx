import { Skeleton } from "@/components/ui/skeleton";

/** Laadtoestand voor de lijsten in Instellingen en Regels: de vorm van de
 *  tabel blijft staan, zodat de inhoud er niet in springt. */
export function TableSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div aria-busy="true" aria-live="polite">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 border-b border-border px-3 py-3 last:border-b-0"
        >
          <Skeleton className="h-4 w-4 flex-none rounded-full" />
          <Skeleton className="h-3.5 w-1/4" />
          <Skeleton className="h-3.5 flex-1" />
          <Skeleton className="h-3.5 w-16 flex-none" />
        </div>
      ))}
    </div>
  );
}
