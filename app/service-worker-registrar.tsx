"use client";

import { useEffect } from "react";

// Skipped outside production: the service worker's own caching fights
// Turbopack's dev-server HMR (see CLAUDE.md's warning about stale dev CSS),
// so registering it while developing would make that problem worse, not
// better.
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);

  return null;
}
