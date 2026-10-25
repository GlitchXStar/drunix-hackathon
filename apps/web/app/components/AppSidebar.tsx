"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type WorkspaceRole = "businessOwner" | "kycOfficer" | "loanOfficer" | "complianceOfficer" | "institutionAdmin" | "superAdmin";

type NavigationItem = { label: string; href: string; exact?: boolean };
type SidebarProfile = { context: string; name: string; initials: string; footer: string; items: NavigationItem[] };

const profiles: Record<WorkspaceRole, SidebarProfile> = {
  businessOwner: { context: "Business workspace", name: "Business owner", initials: "ZF", footer: "Zenith Fabrication Works", items: [
    { label: "Business profile", href: "/business/profile" }, { label: "Document vault", href: "/business/documents" }, { label: "Share codes", href: "/business/share-codes" }, { label: "Requests", href: "/business/requests" }, { label: "Consents", href: "/business/consents" }, { label: "Access history", href: "/business/access-history" }, { label: "Verification history", href: "/business/verification-history" }, { label: "Notifications", href: "/business/notifications" }, { label: "Employees", href: "/business/employees" },
  ] },
  kycOfficer: { context: "Bank A · institutional desk", name: "P. Deshmukh · KYC Officer", initials: "BA", footer: "Node-01 · Institution", items: [
    { label: "Redeem share code", href: "/institution/redeem" }, { label: "Verification requests", href: "/institution/requests" }, { label: "Activate session", href: "/institution/session-activation" }, { label: "Consented sessions", href: "/institution/access-session" }, { label: "KYC review", href: "/institution/kyc-review" }, { label: "Registry attestations", href: "/institution/attestations", exact: true }, { label: "Issue attestation", href: "/institution/attestations/issue" }, { label: "Manage attestations", href: "/institution/attestations/manage" }, { label: "Attestation lookup", href: "/institution/attestations/lookup" },
  ] },
  loanOfficer: { context: "Bank A · institutional desk", name: "A. Kapoor · Loan Officer", initials: "BA", footer: "Node-01 · Institution", items: [
    { label: "Financial profile", href: "/institution/financial-profile" }, { label: "Risk assessment", href: "/institution/risk-assessment", exact: true }, { label: "Assessment review", href: "/institution/risk-review" }, { label: "Finalise assessment", href: "/institution/risk-assessment/finalise" },
  ] },
  complianceOfficer: { context: "Bank A · compliance desk", name: "N. Shah · Compliance Officer", initials: "BA", footer: "Node-01 · Institution", items: [
    { label: "Compliance review", href: "/institution/compliance-review" }, { label: "Institution audit", href: "/institution/audit" }, { label: "Attestation lookup", href: "/institution/attestations/lookup" },
  ] },
  institutionAdmin: { context: "Bank A · tenant administration", name: "R. Menon · Institution Admin", initials: "BA", footer: "Bank A tenant", items: [
    { label: "Employees", href: "/institution/employees", exact: true }, { label: "Tenant settings", href: "/institution/settings" }, { label: "User-management audit", href: "/institution/employees/audit" }, { label: "Notifications", href: "/institution/notifications" },
  ] },
  superAdmin: { context: "Platform operations", name: "Super administrator", initials: "TL", footer: "TrustLedger platform", items: [
    { label: "Operations overview", href: "/admin", exact: true }, { label: "Institutions", href: "/admin/institutions" }, { label: "Users & roles", href: "/admin/users" }, { label: "Platform audit", href: "/admin/audit" }, { label: "Policy controls", href: "/admin/policies" }, { label: "Service health", href: "/admin/health" },
  ] },
};

export default function AppSidebar({ role }: { role: WorkspaceRole }) {
  const pathname = usePathname();
  const profile = profiles[role];
  return <aside className="business-sidebar institution-sidebar"><Link href="/" className="brand"><span className="brand-mark">◉</span>TrustLedger</Link><p className="business-role">{profile.context}<br /><strong>{profile.name}</strong></p><nav className="business-nav">{profile.items.map((item) => { const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`); return <Link key={item.href} href={item.href} className={active ? "active" : undefined}>{item.label}</Link>; })}</nav><div className="business-user"><span>{profile.initials}</span><div><strong>{profile.footer}</strong><small>Workspace</small></div></div></aside>;
}
