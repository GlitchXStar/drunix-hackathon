import Link from "next/link";

function Sidebar() {
  return <aside className="business-sidebar">
    <Link href="/" className="brand"><span className="brand-mark">◉</span>TrustLedger</Link>
    <p className="business-role">Business workspace<br /><strong>Business owner</strong></p>
    <nav className="business-nav" aria-label="Business navigation">
      <Link href="#">Overview</Link><Link href="/business/documents">Document vault</Link>
      <Link className="active" href="/business/share-codes">Share codes</Link><Link href="#">Requests</Link><Link href="#">Consents</Link>
      <Link href="#">Access history</Link><Link href="#">Verification history</Link><Link href="#">Notifications</Link>
    </nav>
    <div className="business-user"><span>ZF</span><div><strong>Zenith Fabrication Works</strong><small>MSME profile · active</small></div></div>
  </aside>;
}

export default function ShareCodesPage() {
  return <main className="business-app"><Sidebar /><section className="business-main">
    <div className="business-prototype">Prototype · synthetic data only · profile sharing is consent-controlled</div>
    <header className="business-header"><div><p className="kicker">Business workspace / sharing</p><h1>Profile share codes</h1><p>Give an institution time-limited access to your verified business profile.</p></div></header>
    <div className="share-grid"><section className="share-card create-code"><p className="kicker">Create a profile share code</p><h2>Share context, not your files.</h2><p>A code creates limited PROFILE consent for one redeemer. It never exposes a document download by itself.</p><div className="share-steps"><span className="active"><b>01</b> Choose duration</span><span><b>02</b> Confirm owner OTP</span><span><b>03</b> Reveal code once</span></div><label htmlFor="duration">Code duration</label><select id="duration" defaultValue="60"><option value="60">60 minutes</option><option value="240">4 hours</option><option value="1440">24 hours (maximum)</option></select><p className="helper">Each code is one-time use. The business owner must confirm it by OTP before it can be revealed.</p><button className="dark-button">Continue to OTP <span>→</span></button></section>
    <aside className="institution-view"><p className="kicker">What an institution can see</p><h2>Only the profile you consent to.</h2><ul><li><b>✓</b> Legal business name and basic profile</li><li><b>✓</b> Verification attestations with active consent</li><li><b>×</b> Documents or file contents</li><li><b>×</b> Bank A private KYC notes</li><li><b>×</b> Financial risk assessments</li></ul><p>Redemption creates an audit event and notifies the business owner.</p></aside></div>
    <section className="otp-card"><div><p className="kicker">Step 02 / owner confirmation</p><h2>Confirm with OTP</h2><p>Enter the one-time password sent to the registered business owner. The code is not generated until confirmation succeeds.</p><div className="otp-boxes" aria-label="One time password"><span>•</span><span>•</span><span>•</span><span>•</span><span>•</span><span>•</span></div><div className="otp-meta"><span>Expires in <strong>04:42</strong></span><span>5 attempts remaining</span></div></div><div className="otp-actions"><button className="dark-button">Confirm and reveal code</button><button className="text-button">Cancel</button><p>Resend available in 00:28</p></div></section>
    <section className="codes-history"><div><p className="kicker">Recent activity</p><h2>Profile share code history</h2></div><div className="history-list"><article><span className="status expired">EXPIRED</span><div><strong>Profile verification</strong><small>18 Oct 2026 · Not redeemed</small></div><em>Expired after 60 minutes</em></article><article><span className="status registered">REDEEMED</span><div><strong>Profile verification</strong><small>17 Oct 2026 · Redeemed by Bank A</small></div><em>Audit trail recorded</em></article><article><span className="status cancelled">CANCELLED</span><div><strong>Profile verification</strong><small>16 Oct 2026 · Cancelled by owner</small></div><em>No future access</em></article></div><p className="revoke-warning">Expiry and revocation stop future access through TrustLedger. They cannot recall a copy already downloaded.</p></section>
  </section></main>;
}
