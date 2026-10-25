import Link from "next/link";
import AppSidebar from "../../components/AppSidebar";

const requests = [
  ["VR-2026-0184", "Zenith Fabrication Works", "KYC and loan underwriting", "PARTIALLY APPROVED", "2 of 3 files"],
  ["VR-2026-0176", "Mitra Agro Foods", "Regulatory KYC", "PENDING", "Awaiting owner"],
  ["VR-2026-0161", "Northstar Components", "KYC refresh", "EXPIRED", "No action"],
];

function Side() { return <AppSidebar role="kycOfficer" />; }

export default function RequestsPage() { return <main className="business-app institution-app"><Side /><section className="business-main"><header className="business-header"><div><p className="kicker">KYC Officer / verification desk</p><h1>Verification requests</h1><p>Track purpose-bound requests and open sessions only after the owner&apos;s consent is active.</p></div><Link className="dark-button" href="/institution/requests/new">New request <span>→</span></Link></header><section className="officer-table-card"><div className="section-card-head"><div><p className="kicker">Bank A queue</p><h2>Current requests</h2></div><span>3 shown · active records</span></div><div className="vault-table-wrap"><table className="vault-table"><thead><tr><th>Request</th><th>Business</th><th>Purpose</th><th>Status</th><th>Scope</th><th>Action</th></tr></thead><tbody>{requests.map(([id, business, purpose, status, scope]) => <tr key={id}><td><strong>{id}</strong><small>Created 18 Oct 2026</small></td><td>{business}</td><td>{purpose}</td><td><span className={`status ${status === "PARTIALLY APPROVED" ? "pending" : status === "PENDING" ? "pending" : "expired"}`}>{status}</span></td><td>{scope}</td><td>{id === "VR-2026-0184" ? <Link className="table-link" href="/institution/requests/VR-2026-0184">View request</Link> : <span className="table-muted">No active session</span>}</td></tr>)}</tbody></table></div></section><section className="activation-notice"><strong>Consent boundary:</strong> request status alone does not grant document access. A separate officer OTP activates a restricted session for the approved scope.</section></section></main>; }
