"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { APP_NAME } from "@/lib/constants";
import { readLocalPrivacyAck, writeLocalPrivacyAck } from "@/lib/privacy";
import { supabase } from "@/lib/supabase";
import { SignInPanel } from "@/components/auth";
import { PrivacyPolicyContent } from "@/components/privacy";
import { SheetClose, SheetFrame, useDismiss } from "@/components/primitives";

// The sign-in page, /login (app/login/page.tsx): the one door into the app.
// The landing page's "เข้าสู่ระบบ" and "เริ่มใช้งาน" both lead here. Its own
// URL rather than a block at the foot of the landing, so it is a place --
// the browser's back button returns to the landing, and a link can point
// straight at it. Signing in (Google or the emailed link) comes back to "/",
// where page.tsx picks up the session.

// Before sign-in the acknowledgement can only live in this device's storage
// (lib/privacy.ts); page.tsx copies it to the server record once signed in.
// Read through useSyncExternalStore so the server render (nothing
// acknowledged) and the first client render agree, and so a write here is
// picked up without a second source of truth in state.
const ackListeners = new Set<() => void>();

function writeAck() {
  writeLocalPrivacyAck();
  ackListeners.forEach((listener) => listener());
}

function subscribeAck(listener: () => void) {
  ackListeners.add(listener);
  return () => ackListeners.delete(listener);
}

export function LoginScreen() {
  const storedAck = useSyncExternalStore(subscribeAck, readLocalPrivacyAck, () => false);
  // Covers storage that refuses the write: acknowledged for this visit anyway.
  const [ackThisVisit, setAckThisVisit] = useState(false);
  const acknowledged = storedAck || ackThisVisit;
  const [policyOpen, setPolicyOpen] = useState(false);
  const policyDismiss = useDismiss(policyOpen, () => setPolicyOpen(false));

  // Already signed in (a bookmark, the back button after signing in): there
  // is nothing to do here, so go to the app.
  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) window.location.replace("/");
    });
  }, []);

  function acknowledge() {
    setAckThisVisit(true);
    writeAck();
    policyDismiss.requestClose();
  }

  return (
    <main className="shell login-page">
      <header className="landing-nav is-solid">
        <Link className="landing-brand" href="/" aria-label={`กลับไปหน้าแรกของ ${APP_NAME}`}>
          <ChevronLeft size={20} aria-hidden="true" />
          <i className="brand-mark" aria-hidden="true" />
          <b className="brand-name">{APP_NAME}</b>
        </Link>
      </header>
      <section className="login-page-body">
        <SignInPanel acknowledged={acknowledged} onReadPolicy={() => setPolicyOpen(true)} />
      </section>

      {policyDismiss.mounted && (
        <SheetFrame className="edit-sheet privacy-sheet" onClose={policyDismiss.requestClose} closing={policyDismiss.closing}>
          <div className="sheet-head">
            <div>
              <p className="eyebrow">{APP_NAME}</p>
              <h2>นโยบายความเป็นส่วนตัว</h2>
            </div>
            <SheetClose onClick={policyDismiss.requestClose} />
          </div>
          <PrivacyPolicyContent />
          <button type="button" className="primary privacy-accept" onClick={acknowledge}>
            อ่านแล้ว รับทราบ
          </button>
        </SheetFrame>
      )}
    </main>
  );
}
