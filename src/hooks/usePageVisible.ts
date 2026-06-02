"use client";

import { useEffect, useState } from "react";

/** Returns true when the browser tab is in the foreground. */
export function usePageVisible(): boolean {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const onVisChange = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisChange);
    return () => document.removeEventListener("visibilitychange", onVisChange);
  }, []);

  return visible;
}
