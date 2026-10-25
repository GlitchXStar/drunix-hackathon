"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "../lib/auth-context";
import * as api from "../lib/api";
import { memo, useState, useEffect, useMemo } from "react";

export type WorkspaceRole =
  | "businessOwner"
  | "kycOfficer"
  | "loanOfficer"
  | "complianceOfficer"
  | "institutionAdmin"
  | "superAdmin";

type NavigationItem = { label: string; href: string; exact?: boolean };
type SidebarProfile = {
  context: string;
  name: string;
  initials: string;
  footer: string;
  items: NavigationItem[];
};

const profiles: Record<WorkspaceRole, SidebarProfile> = {
  businessOwner: {
    context: "Business workspace",
    name: "Business owner",
    initials: "MSME",
    footer: "Business Workspace",
    items: [
      { label: "Business profile", href: "/business/profile" },
      { label: "Document vault", href: "/business/documents" },
      { label: "Share codes", href: "/business/share-codes" },
      { label: "Requests", href: "/business/requests" },
      { label: "Consents", href: "/business/consents" },
      { label: "Access history", href: "/business/access-history" },
      { label: "Verification history", href: "/business/verification-history" },
      { label: "Notifications", href: "/business/notifications" },
      { label: "Employees", href: "/business/employees" },
      { label: "Ledger Explorer", href: "/ledger" },
    ],
  },
  kycOfficer: {
    context: "Bank A · institutional desk",
    name: "KYC Officer",
    initials: "BA",
    footer: "Node-01 · Bank A",
    items: [
      { label: "Redeem share code", href: "/institution/redeem" },
      { label: "Verification requests", href: "/institution/requests" },
      { label: "Activate session", href: "/institution/session-activation" },
      { label: "Consented sessions", href: "/institution/access-session" },
      { label: "KYC review", href: "/institution/kyc-review" },
      { label: "Registry attestations", href: "/institution/attestations", exact: true },
      { label: "Issue attestation", href: "/institution/attestations/issue" },
      { label: "Manage attestations", href: "/institution/attestations/manage" },
      { label: "Attestation lookup", href: "/institution/attestations/lookup" },
      { label: "Ledger Explorer", href: "/ledger" },
    ],
  },
  loanOfficer: {
    context: "Bank A · institutional desk",
    name: "Loan Officer",
    initials: "BA",
    footer: "Node-01 · Bank A",
    items: [
      { label: "Financial profile", href: "/institution/financial-profile" },
      { label: "Risk assessment", href: "/institution/risk-assessment", exact: true },
      { label: "Assessment review", href: "/institution/risk-review" },
      { label: "Finalise assessment", href: "/institution/risk-assessment/finalise" },
      { label: "Ledger Explorer", href: "/ledger" },
    ],
  },
  complianceOfficer: {
    context: "Bank A · compliance desk",
    name: "Compliance Officer",
    initials: "BA",
    footer: "Node-01 · Bank A",
    items: [
      { label: "Compliance review", href: "/institution/compliance-review" },
      { label: "Institution audit", href: "/institution/audit" },
      { label: "Attestation lookup", href: "/institution/attestations/lookup" },
      { label: "Ledger Explorer", href: "/ledger" },
    ],
  },
  institutionAdmin: {
    context: "Bank A · tenant administration",
    name: "Institution Admin",
    initials: "BA",
    footer: "Bank A tenant",
    items: [
      { label: "Employees", href: "/institution/employees", exact: true },
      { label: "Tenant settings", href: "/institution/settings" },
      { label: "User-management audit", href: "/institution/employees/audit" },
      { label: "Notifications", href: "/institution/notifications" },
      { label: "Ledger Explorer", href: "/ledger" },
    ],
  },
  superAdmin: {
    context: "Platform operations",
    name: "Super administrator",
    initials: "TL",
    footer: "TrustLedger platform",
    items: [
      { label: "Operations overview", href: "/admin", exact: true },
      { label: "Institutions", href: "/admin/institutions" },
      { label: "Users & roles", href: "/admin/users" },
      { label: "Platform audit", href: "/admin/audit" },
      { label: "Policy controls", href: "/admin/policies" },
      { label: "Service health", href: "/admin/health" },
      { label: "Ledger Explorer", href: "/ledger" },
    ],
  },
};

function computeInitials(name: string, fallback: string): string {
  if (!name) return fallback;
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  if (parts.length === 1 && parts[0].length >= 2) {
    return parts[0].substring(0, 2).toUpperCase();
  }
  return fallback;
}

function AppSidebarComponent({ role }: { role: WorkspaceRole }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const profile = profiles[role] || profiles.businessOwner;

  const isBusinessRole =
    role === "businessOwner" ||
    user?.role === "BUSINESS_OWNER" ||
    user?.role === "BUSINESS_EMPLOYEE";

  const [businessName, setBusinessName] = useState<string | null>(user?.businessName || null);

  useEffect(() => {
    if (user?.businessName) {
      setBusinessName(user.businessName);
      return;
    }
    if (isBusinessRole && user?.businessId) {
      let cancelled = false;
      api.getBusinessProfile()
        .then((res) => {
          if (!cancelled && res?.legalName) {
            setBusinessName(res.legalName);
          }
        })
        .catch(() => {});
      return () => {
        cancelled = true;
      };
    }
  }, [isBusinessRole, user?.businessId, user?.businessName]);

  const footerName = useMemo(() => {
    if (isBusinessRole) {
      return businessName || user?.businessName || (user?.email ? user.email.split("@")[0] : profile.footer);
    }
    return user?.institutionName || profile.footer;
  }, [isBusinessRole, businessName, user?.businessName, user?.institutionName, user?.email, profile.footer]);

  const initials = useMemo(() => {
    if (isBusinessRole && footerName && footerName !== profile.footer) {
      return computeInitials(footerName, "MSME");
    }
    if (!isBusinessRole && user?.institutionName) {
      return computeInitials(user.institutionName, profile.initials);
    }
    return profile.initials;
  }, [isBusinessRole, footerName, user?.institutionName, profile.initials, profile.footer]);

  const topContext = useMemo(() => {
    if (isBusinessRole) return profile.context;
    if (user?.institutionName) return `${user.institutionName} · Desk`;
    return profile.context;
  }, [isBusinessRole, user?.institutionName, profile.context]);

  return (
    <aside className="business-sidebar institution-sidebar">
      <Link href="/" prefetch={false} className="brand">
        <span className="brand-mark">◉</span>TrustLedger
      </Link>
      <p className="business-role">
        {topContext}
        <br />
        <strong>{user ? (user.email || profile.name) : "Not signed in"}</strong>
      </p>
      <nav className="business-nav">
        {profile.items.map((item) => {
          const active = item.exact
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch={false}
              className={active ? "active" : undefined}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="business-user">
        <span>{initials}</span>
        <div>
          <strong title={footerName}>{footerName}</strong>
          <small>{user?.role || "Not authenticated"}</small>
        </div>
      </div>
      <div style={{ padding: "0.5rem 1rem 1rem" }}>
        {user ? (
          <button
            type="button"
            onClick={() => logout()}
            className="text-button"
            style={{ fontSize: "0.8rem", color: "var(--color-muted)", cursor: "pointer" }}
          >
            Sign out ⎋
          </button>
        ) : (
          <Link
            href="/login"
            className="text-button"
            style={{ fontSize: "0.8rem", color: "#dededb", cursor: "pointer" }}
          >
            Sign in →
          </Link>
        )}
      </div>
    </aside>
  );
}

const AppSidebar = memo(AppSidebarComponent);
export default AppSidebar;

