"use client";

// The last line of defence: app/error.tsx only catches throws inside the
// page, so an error in the root layout itself would still take the app down
// silently. Next replaces the whole root layout with this file when that
// happens, which is why it renders its own <html>/<body> -- and why it cannot
// use globals.css or any component from the design system: neither is loaded
// at this point. Every value here is therefore a literal, deliberately
// duplicating the tokens rather than referencing them, and the palette is the
// one thing in the codebase allowed to do that. Keep it in sync with --bg /
// --ink / --primary in app/globals.css if those ever change, the same way
// app/layout.tsx's themeColor is kept in sync by hand.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="th">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          padding: "24px",
          background: "#fff3e1",
          color: "#241536",
          fontFamily: '"Noto Sans Thai", -apple-system, "Segoe UI", sans-serif',
          lineHeight: 1.55,
          textAlign: "center",
        }}
      >
        <div style={{ maxWidth: 360 }}>
          <h1 style={{ fontSize: 21, fontWeight: 700, margin: "0 0 8px" }}>เปิดแอพไม่สำเร็จ</h1>
          <p style={{ fontSize: 15, color: "#6f5c82", margin: "0 0 20px" }}>
            ข้อมูลของคุณยังอยู่ครบบนเซิร์ฟเวอร์ ลองโหลดใหม่อีกครั้ง
          </p>
          <button
            onClick={reset}
            style={{
              font: "inherit",
              fontWeight: 600,
              cursor: "pointer",
              border: 0,
              borderRadius: 999,
              padding: "12px 24px",
              background: "#241536",
              color: "#fff3e1",
            }}
          >
            โหลดแอพใหม่
          </button>
          {error.digest && (
            <p style={{ fontSize: 13, color: "#9c8fb0", margin: "16px 0 0" }}>รหัสอ้างอิง {error.digest}</p>
          )}
        </div>
      </body>
    </html>
  );
}
