import type { Metadata } from "next";
import "./globals.css";
import "./a11y.css";
import "./fixes.css";

export const metadata: Metadata = {
  title: "TrustLedger | Consent-based MSME verification",
  description: "TrustLedger — Consent-Based MSME Verification & Credit Risk Assessment on Drunix.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
