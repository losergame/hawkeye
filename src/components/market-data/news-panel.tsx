import { ExternalLink } from "lucide-react";

import { InsightIcon, Panel, ScrollBody, SectionHeader, SignalDot } from "@/components/shared/ui";
import { marketNews } from "@/lib/mock-data";
import type { StockProfile } from "@/lib/types";

export function NewsPanel({ selected }: { selected: StockProfile }) {
  const newsItems = [...selected.news, ...marketNews].slice(0, 10);

  return (
    <Panel tight className="flex min-h-[200px] max-h-[300px] flex-col self-start">
      <SectionHeader eyebrow="Market news" title={`${selected.symbol} and broad tape`} action={<InsightIcon type="alert" />} />
      <ScrollBody className="grid gap-2">
        {newsItems.map((item) => {
          const content = (
            <>
              <SignalDot stance={item.sentiment} />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-semibold leading-5 text-white">{item.headline}</p>
                  {item.url ? <ExternalLink className="mt-0.5 size-3.5 shrink-0 text-cyan-200" /> : null}
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {item.source} <span className="px-1 text-slate-600">•</span> {item.publishedAt}
                </p>
              </div>
            </>
          );

          return item.url ? (
            <a
              key={`${item.source}-${item.headline}`}
              href={item.url}
              target="_blank"
              rel="noreferrer"
              className="flex items-start gap-3 rounded-lg border border-white/10 bg-white/[0.04] p-2.5 transition hover:border-cyan-300/25 hover:bg-cyan-300/[0.07]"
            >
              {content}
            </a>
          ) : (
            <div key={`${item.source}-${item.headline}`} className="flex items-start gap-3 rounded-lg border border-white/10 bg-white/[0.04] p-2.5">
              {content}
            </div>
          );
        })}
      </ScrollBody>
    </Panel>
  );
}
