"use client";

export default function DocumentViewer() {
  return <section className="document-viewer" onContextMenu={(event) => event.preventDefault()}>
    <div className="viewer-toolbar"><span>GST Certificate.pdf</span><span>View-only · no download</span></div>
    <div className="document-placeholder" aria-label="Watermarked document preview"><div className="watermark">BANK A · TRUSTLEDGER · VR-2026-0184</div><p>GST REGISTRATION CERTIFICATE</p><h2>Zenith Fabrication Works Pvt Ltd</h2><div className="document-lines"><i /><i /><i /><i /><i /></div><small>This watermarked preview deters unauthorized copying. Document views are strictly logged and audited.</small></div>
    <div className="viewer-footer"><span>Page 1 of 1</span><span>Integrity root <code>0xa91c...7e20</code></span></div>
  </section>;
}
