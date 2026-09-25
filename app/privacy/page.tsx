import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { APP_NAME } from "@/lib/constants";
import { PrivacyPolicyContent } from "@/components/privacy";

// The policy as its own URL: what Google's OAuth consent screen links to, and
// where "ของฉัน" sends a signed-in user to read it again. The landing page
// shows the same PrivacyPolicyContent in a sheet. The boot splash (layout.tsx)
// is hidden by CSS here (body:has(.privacy-page)), since the app page that
// normally removes it never runs on this route.
export const metadata: Metadata = {
  title: `นโยบายความเป็นส่วนตัว - ${APP_NAME}`,
};

export default function PrivacyPage() {
  return (
    <main className="shell privacy-page">
      <div className="privacy-page-column">
        <header className="privacy-page-head">
          <Link className="privacy-back" href="/" aria-label={`กลับไปที่ ${APP_NAME}`}>
            <ChevronLeft size={20} aria-hidden="true" />
            <i className="brand-mark" aria-hidden="true" />
            <b className="brand-name">{APP_NAME}</b>
          </Link>
        </header>
        <h1>นโยบายความเป็นส่วนตัว</h1>
        <PrivacyPolicyContent />
      </div>
    </main>
  );
}
