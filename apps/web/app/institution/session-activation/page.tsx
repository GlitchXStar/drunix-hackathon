import Link from "next/link";

function Side() {
  return <aside className="business-sidebar institution-sidebar">
    <Link href="/" className="brand"><span className="brand-mark">◎</span>TrustLedger</Link>
    <p className="business-role">Bank A · institutional desk<br /><strong>P. Deshmukh · KYC Officer</strong></p>
    <nav className="business-nav"><Link href="/institution/redeem">Redeem share code</Link><Link href="/institution/requests/new">New verification request</Link><Link href="/institution/requests/VR-2026-0184">Verification ledger</Link><Link className="active" href="/institution/session-activation">Activate session</Link><Link href="/institution/attestations">Attestation review</Link><Link href="/institution/risk-review">Decision support</Link></nav>
    <div className="business-user"><span>BA</span><div><strong>Node-01 · Institution</strong><small>HSM session · 03h 48m remaining</small></div></div>
  </aside>;
}

export default function SessionActivationPage() {
  return <main className="business-app institution-app"><Side /><section className="business-main">
    <div className="business-prototype">Prototype · synthetic data only · OTP values are never stored or shown in this application</div>
    <header className="business-header"><div><p className="kicker">Consented session / VR-2026-0184</p><h1>Activate document session</h1><p>Confirm your officer session before opening the owner-approved evidence.</p></div><span className="status pending">PENDING OTP</span></header>
    <div className="session-activation-layout"><section className="otp-activation-card"><p className="kicker">Officer confirmation</p><h2>Enter your 6-digit code</h2><p className="activation-copy">A one-time code was sent through Bank A&apos;s approved delivery channel. It is bound to this session and cannot activate another request.</p><form><fieldset className="otp-fieldset"><legend className="sr-only">Six digit one-time password</legend><div className="activation-otp-inputs">{[1, 2, 3, 4, 5, 6].map((digit) => <input key={digit} inputMode="numeric" maxLength={1} aria-label={`OTP digit ${digit}`} />)}</div></fieldset><div className="otp-meta"><span>Expires in <strong>04:38</strong></span><span><strong>5</strong> attempts remaining</span></div><Link className="dark-button activation-button" href="/institution/access-session">Activate restricted session <span>→</span></Link></form><p className="otp-help">A code can be used once. If it expires or is entered incorrectly too many times, start a new session instead.</p></section><aside className="session-scope-card"><p className="kicker">Session boundary</p><h2>Only approved evidence.</h2><dl><div><dt>Business</dt><dd>Zenith Fabrication Works</dd></div><div><dt>Purpose</dt><dd>KYC / underwriting</dd></div><div><dt>Files available</dt><dd>2 of 3 requested</dd></div><div><dt>Max duration</dt><dd>30 minutes</dd></div></dl><p>Activation records a session-opened event. Future access stops if the owner revokes consent or the session expires.</p></aside></div>
    <section className="activation-notice"><strong>Access is not approval.</strong> This session provides time-bound, view-only evidence. Bank A remains responsible for its own KYC and lending decisions.</section>
  </section></main>;
}
