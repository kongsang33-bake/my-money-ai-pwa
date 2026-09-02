"use client";

import { useEffect } from "react";

// Route-level error boundary. Until this file existed the app had none at
// all, and the failure mode was worse than a blank page: the boot splash in
// app/layout.tsx is removed by an effect inside app/page.tsx, so a throw
// during that page's render meant the effect never ran and the user sat on a
// frozen splash logo with no way forward. On an installed PWA there is not
// even a visible reload button to fall back on.
//
// That is not a hypothetical for this codebase. Every money value on screen
// goes through formatMoney(value.toLocaleString(...)), which throws outright
// on an undefined field -- one shape mismatch between a row and the type it
// is read as takes the whole app down.
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The splash sits above everything at z-index and is normally torn down
    // by app/page.tsx -- which is exactly the code that just failed.
    const splash = document.getElementById("app-splash");
    if (splash) splash.style.display = "none";
  }, []);

  return (
    <main className="shell">
      <div className="auth-screen">
        <section className="auth-card">
          <span className="auth-mark" aria-hidden="true">
            !
          </span>
          <h1>แอพสะดุดไปชั่วขณะ</h1>
          <p className="auth-copy">
            ข้อมูลของคุณยังอยู่ครบและไม่ได้รับผลกระทบ — ที่ค้างคือหน้าจอเท่านั้น
            ลองเปิดใหม่อีกครั้งได้เลย
          </p>
          <div className="error-actions">
            <button onClick={reset}>ลองแสดงผลใหม่</button>
            <button onClick={() => window.location.reload()}>โหลดแอพใหม่</button>
          </div>
          {/* Next's digest, not the message or stack: enough for the user to
              quote when reporting, without putting internals on screen. */}
          {error.digest && <p className="error-digest">รหัสอ้างอิง {error.digest}</p>}
        </section>
      </div>
    </main>
  );
}
