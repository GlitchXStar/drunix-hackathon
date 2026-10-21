const journey = [
  ["01", "Register & secure", "An MSME uploads encrypted business documents."],
  ["02", "Create a share code", "The owner confirms a short-lived profile share code with OTP."],
  ["03", "Request with purpose", "An institution requests only the document types it needs."],
  ["04", "Approve a subset", "The business chooses documents, duration and download rights."],
  ["05", "Verify in a session", "An OTP-bound officer session shows watermarked pages."],
  ["06", "Reuse trusted proof", "A permitted attestation reduces repeated verification."],
];

const protections = [
  ["Ledger-first access", "Every document and session release checks live consent state. If the ledger is unavailable, access is denied."],
  ["Encrypted before storage", "Files are encrypted before storage; raw documents, keys and OTPs are never recorded on-chain."],
  ["Bound sessions & OTPs", "Server-side sessions and single-use OTPs are tied to the right person and action."],
  ["Expiry, revocation & audit", "Future access ends immediately when consent expires or is revoked, with each material action audited."],
  ["Prototype architecture", "Prototype key handling and the single-backend multi-organisation ledger setup stand in for production designs."],
];

export default function Home() {
  return (
    <main>
      <div className="prototype-bar">Prototype · Synthetic data only · NPCI × Drunix Hackathon demonstration</div>
      <header className="nav"><a className="brand" href="#top"><span className="brand-mark">◒</span>TrustLedger</a><nav><a href="#how">How it works</a><a href="#msmes">For MSMEs</a><a href="#institutions">For institutions</a></nav><a className="button small" href="/login">Sign in <span>→</span></a></header>

      <section className="hero" id="top">
        <video className="hero-video" autoPlay muted loop playsInline poster=""><source src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260818_072341_50851634-bbc3-4c33-9acc-7647d4db44aa.mp4" type="video/mp4" /></video>
        <div className="hero-overlay" />
        <div className="hero-grid" aria-hidden="true" />
        <div className="hero-content">
          <p className="eyebrow"><i /> NPCI × Drunix Hackathon · Financial Inclusion</p>
          <h1>Trust, verified once.<br /><em>Shared with consent.</em></h1>
          <p className="lede">TrustLedger lets MSMEs control document sharing, lets institutions verify with confidence, and records consent and attestations on Drunix—without placing personal data on-chain.</p>
          <div className="actions"><a className="button" href="/register">Create business account <span>→</span></a><a className="button ghost" href="#how">See how consent works <span>↓</span></a></div>
          <div className="chips"><span><b />Consent controlled</span><span><b />Ledger verified</span><span><b />Privacy first</span></div>
        </div>
        <p className="scroll-hint">Scroll to trace the verification journey <span>↓</span></p>
      </section>

      <section className="section value" id="msmes"><p className="kicker">A shared verification layer</p><h2>A trusted path between<br />MSMEs and institutions.</h2><div className="value-grid">
        <article><span>01</span><h3>MSME control</h3><p>Approve only the documents, duration and download rights you choose.</p></article>
        <article><span>02</span><h3>Institution confidence</h3><p>View consented documents, record KYC and issue reusable attestations.</p></article>
        <article><span>03</span><h3>Shared trust</h3><p>Anchor minimal consent and attestation records on Drunix—not raw documents or OTPs.</p></article>
      </div></section>

      <section className="section journey" id="how"><div className="section-heading"><p className="kicker">The consent lifecycle</p><h2>One controlled<br />verification journey.</h2><p>A continuous path from business approval to institution confidence.</p></div><div className="timeline">{journey.map(([number, title, text]) => <article key={number}><span className="number">{number}</span><span className="node" /><h3>{title}</h3><p>{text}</p></article>)}</div></section>

      <section className="section security" id="security"><div className="section-heading"><p className="kicker">Security by design</p><h2>Built to fail closed,<br /><em>designed to protect.</em></h2></div><div className="protection-grid">{protections.map(([title, text], index) => <article key={title}><span className="protection-index">0{index + 1}</span><h3>{title}</h3><p>{text}</p></article>)}</div><p className="prototype-note"><strong>Prototype disclosure.</strong> Development OTP outbox, synthetic data and prototype key handling are demonstration systems—not production controls.</p></section>

      <section className="section context" id="institutions"><div className="context-copy"><p className="kicker">Context, not automation</p><h2>Verification and risk,<br />kept in context.</h2><p>Attestations show an issuer, status and whether the documents have changed since verification. Risk assessments use validated structured financial features only and are clearly labelled synthetic.</p><p>Neither result is an identity verification, automatic KYC outcome, or lending decision.</p></div><div className="inspector" aria-label="Attestation inspector preview"><div className="inspector-top"><span>ATTESTATION INSPECTOR</span><b>VERIFIED</b></div><div className="inspector-main"><p className="muted">ISSUER</p><h3>Bank A <small>Sandbox verifier</small></h3><div className="line" /><p className="muted">BUSINESS</p><h3>Zenith Fabrication Works</h3><dl><div><dt>Type</dt><dd>KYC BASIC</dd></div><div><dt>Documents</dt><dd>Hash snapshot matches</dd></div><div><dt>Drunix anchor</dt><dd className="mono">dx-882914-attest</dd></div></dl><div className="risk-row"><span>SYNTHETIC RISK PROFILE</span><strong>Decision support only</strong></div></div></div></section>

      <section className="section faq" aria-labelledby="faq-heading"><div className="section-heading"><p className="kicker">Answers</p><h2 id="faq-heading">Frequently answered<br />questions.</h2></div><div className="faq-list"><details open><summary>What happens when consent expires or is revoked?<span>+</span></summary><p>Future access is denied immediately across all active viewing sessions.</p></details><details><summary>Can an institution download a document?<span>+</span></summary><p>Download requires both an explicit request and the MSME owner&apos;s approval.</p></details><details><summary>What is stored on Drunix?<span>+</span></summary><p>Only minimal pseudonymous consent receipts and attestation references—not raw documents, OTPs or direct personal identifiers.</p></details><details><summary>Is the risk score a lending decision?<span>+</span></summary><p>No. It is synthetic decision support based on structured financial features only.</p></details></div></section>

      <section className="final" id="prototype"><p className="kicker">Prototype walkthrough</p><h2>Build trust without asking<br />MSMEs to start over.</h2><p>See how consent-based sharing can replace repetitive document collection while keeping access controlled and auditable.</p><div className="actions"><a className="button" href="/login">Sign in to your workspace <span>→</span></a><a className="button ghost" href="#security">Read the security model <span>→</span></a></div></section>

      <footer><a className="brand" href="#top"><span className="brand-mark">◒</span>TrustLedger</a><span>NPCI × Drunix Hackathon</span><div><a href="#msmes">MSME journey</a><a href="#institutions">Institution journey</a><a href="#security">Security model</a></div><p>Prototype. Synthetic data only. No claim of production readiness.</p></footer>
    </main>
  );
}
