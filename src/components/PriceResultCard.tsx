import type { PriceResult } from "@/lib/price-lookup.functions";
import { ExternalLink } from "lucide-react";

export function PriceResultCard({ result }: { result: PriceResult }) {
  return (
    <div className="w-full rounded-3xl border border-border bg-card p-5 shadow-lg">
      <div className="flex gap-4">
        {result.imageUrl ? (
          <img
            src={result.imageUrl}
            alt={result.productName}
            className="h-24 w-24 flex-shrink-0 rounded-2xl border border-border object-cover"
            onError={(e) => (e.currentTarget.style.display = "none")}
          />
        ) : (
          <div className="flex h-24 w-24 flex-shrink-0 items-center justify-center rounded-2xl border border-border bg-muted text-xs text-muted-foreground">
            No image
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-display text-lg font-semibold text-foreground">
            {result.productName}
          </h2>
          <div className="mt-1 font-display text-2xl font-bold text-primary">
            {result.priceEstimate}
          </div>
          <div className="mt-0.5 text-xs uppercase tracking-wider text-muted-foreground">
            Estimated · {result.currency}
          </div>
        </div>
      </div>
      <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
        {result.summary}
      </p>
      {result.sources.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {result.sources.map((s, i) => (
            <a
              key={i}
              href={s.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex max-w-full items-center gap-1 truncate rounded-full border border-border bg-secondary px-3 py-1 text-xs text-secondary-foreground transition hover:border-primary hover:text-primary"
            >
              <ExternalLink className="h-3 w-3 flex-shrink-0" />
              <span className="truncate">{new URL(s.url).hostname}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
