import { AlertTriangle } from "lucide-react";

import { Panel } from "@/components/shared/ui";

export function DisclaimerCard() {
  return (
    <Panel tight className="border-amber-300/20 bg-amber-300/[0.055]">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 rounded-lg border border-amber-300/20 bg-amber-300/10 p-2 text-amber-100">
          <AlertTriangle className="size-4" />
        </span>
        <div>
          <p className="text-sm font-semibold text-amber-50">Educational scanner only</p>
          <p className="mt-1 text-sm leading-6 text-amber-100/80">
            These trade setups are for educational analysis only and are not financial advice. Always do your own research and manage risk.
          </p>
        </div>
      </div>
    </Panel>
  );
}
