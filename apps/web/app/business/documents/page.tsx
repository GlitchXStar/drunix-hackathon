import Link from "next/link";

const documents = [
  ["GST Certificate", "PDF · 18 Oct 2026", "REGISTERED", "v1"],
  ["Bank Statement · Sep 2026", "PDF · 17 Oct 2026", "REGISTERED", "v1"],
  ["Registration Certificate", "PDF · 16 Oct 2026", "REGISTERED", "v2 · Changed since verified"],
  ["Annual Return", "PDF · 15 Oct 2026", "PENDING REGISTRATION", "Retry registration"],
];

function Sidebar() {
  return <aside className="business-sidebar">
    <Link href="/" className="brand"><span className="brand-mark">◉</span>TrustLedger</Link>
    <p className="business-role">Business workspace<br /><strong>Business owner</strong></p>
    <nav className="business-nav" aria-label="Business navigation">
      <Link href="/business/profile">Business profile</Link><Link className="active" href="/business/documents">Document vault</Link>
      <Link href="/business/share-codes">Share codes</Link><Link href="/business/requests">Requests</Link><Link href="/business/consents">Consents</Link>
      <Link href="/business/access-history">Access history</Link><Link href="/business/verification-history">Verification history</Link><Link href="/business/notifications">Notifications</Link>
    </nav>
    <div className="business-user"><span>ZF</span><div><strong>Zenith Fabrication Works</strong><small>MSME profile · active</small></div></div>
  </aside>;
}

export default function DocumentsPage() {
  return <main className="business-app"><Sidebar /><section className="business-main">
    <div className="business-prototype">Prototype · synthetic data only · do not upload real documents</div>
    <header className="business-header"><div><p className="kicker">Business workspace / records</p><h1>Document vault</h1><p>Encrypted documents registered for consent-based sharing.</p></div><Link href="/business/documents/upload" className="dark-button">Upload document <span>+</span></Link></header>
    <div className="vault-summary"><article><span>ENCRYPTED BEFORE STORAGE</span><strong>Documents stay private by default.</strong><p>Files are stored outside the ledger; only integrity evidence is registered.</p></article><article><span>SHAREABLE STATUS</span><strong>REGISTERED required before sharing.</strong><p>Retry any document that remains pending registration.</p></article></div>
    <section className="vault-card"><div className="vault-card-head"><div><p className="kicker">Registered files</p><h2>Your business documents</h2></div><span className="vault-count">4 records</span></div><div className="vault-table-wrap"><table className="vault-table"><thead><tr><th>Document</th><th>Status</th><th>Version / state</th><th>Actions</th></tr></thead><tbody>{documents.map(([name, meta, status, version]) => <tr key={name}><td><strong>{name}</strong><small>{meta}</small></td><td><span className={status === "REGISTERED" ? "status registered" : "status pending"}>{status}</span></td><td>{version}</td><td><button>View</button><button>Replace</button>{status === "REGISTERED" && <button>Delete</button>}</td></tr>)}</tbody></table></div></section>
    <section className="vault-lower"><div className="drop-zone"><span>↑</span><h2>Add a document</h2><p>Drop a file here, or choose a file to upload.</p><button className="light-button">Choose file</button><small>PDF, PNG or JPEG · up to 10 MB · server validation occurs before encryption and ledger registration.</small></div><aside className="sharing-status"><p className="kicker">Sharing status</p><h2>Control what becomes available.</h2><p>Only documents marked <strong>REGISTERED</strong> can be attached to a consented request. Pending records remain private.</p><Link href="/business/share-codes">Manage share codes →</Link></aside></section>
  </section></main>;
}
