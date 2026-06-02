"use client";

import { useCallback, useEffect, useState } from "react";
import type { ActivePresetInfo } from "@/app/api/presets/active/route";

export type { ActivePresetInfo };

interface UseActivePresetReturn {
  preset:    ActivePresetInfo | null;
  loading:   boolean;
  disabling: boolean;
  reload:    () => Promise<void>;
  disable:   () => Promise<void>;
}

export function useActivePreset(): UseActivePresetReturn {
  const [preset, setPreset]     = useState<ActivePresetInfo | null>(null);
  const [loading, setLoading]   = useState(true);
  const [disabling, setDisabling] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch("/api/presets/active", { cache: "no-store" });
      const data = (await res.json()) as ActivePresetInfo;
      setPreset(data);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  const disable = useCallback(async () => {
    setDisabling(true);
    try {
      await fetch("/api/presets/active", { method: "DELETE" });
      await reload();
    } catch { /* silent */ }
    finally { setDisabling(false); }
  }, [reload]);

  return { preset, loading, disabling, reload, disable };
}
