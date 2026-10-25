import Link from "next/link";
import AppSidebar from "../../components/AppSidebar";

const documents = [
  ["GST Certificate", "PDF · 18 Oct 2026", "REGISTERED", "v1"],
  ["Bank Statement · Sep 2026", "PDF · 17 Oct 2026", "REGISTERED", "v1"],
  ["Registration Certificate", "PDF · 16 Oct 2026", "REGISTERED", "v2 · Changed since verified"],
  ["Annual Return", "PDF · 15 Oct 2026", "PENDING REGISTRATION", "Retry registration"],
];

function Sidebar() { return <AppSidebar role="businessOwner" />; }

export default function DocumentsPage() {
  return <main className="business-app"><Sidebar /><section className="business-main">
    
    <header className="business-header"><div><p className="kicker">Business workspace / records</p><h1>Document vault</h1><p>Encrypted documents registered for consent-based sharing.</p></div><Link href="/business/documents/upload" className="dark-button">Upload document <span>+</span></Link></header>
    <div className="vault-summary"><article><span>ENCRYPTED BEFORE STORAGE</span><strong>Documents stay private by default.</strong><p>Files are stored outside the ledger; only integrity evidence is registered.</p></article><article><span>SHAREABLE STATUS</span><strong>REGISTERED required before sharing.</strong><p>Retry any document that remains pending registration.</p></article></div>
    <section className="vault-card"><div className="vault-card-head"><div><p className="kicker">Registered files</p><h2>Your business documents</h2></div><span className="vault-count">4 records</span></div><div className="vault-table-wrap"><table className="vault-table"><thead><tr><th>Document</th><th>Status</th><th>Version / state</th><th>Actions</th></tr></thead><tbody>{documents.map(([name, meta, status, version]) => <tr key={name}><td><strong>{name}</strong><small>{meta}</small></td><td><span className={status === "REGISTERED" ? "status registered" : "status pending"}>{status}</span></td><td>{version}</td><td><button>View</button><button>Replace</button>{status === "REGISTERED" && <button>Delete</button>}</td></tr>)}</tbody></table></div></section>
  </section></main>;
}
