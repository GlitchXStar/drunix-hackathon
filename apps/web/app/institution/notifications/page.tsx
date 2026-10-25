import AppSidebar from "../../components/AppSidebar";

const notes = [
  ["New verification request", "Zenith Fabrication Works received Bank A request VR-2026-0184.", "18 Oct 2026 · 10:05 IST", "REQUEST"],
  ["Consent partially approved", "Two requested evidence items are available in the approved session.", "18 Oct 2026 · 10:14 IST", "CONSENT"],
  ["Session opened", "P. Deshmukh opened a consented view-only session.", "18 Oct 2026 · 10:24 IST", "ACCESS"],
  ["Consent expires soon", "VR-2026-0184 expires in under 24 hours.", "18 Oct 2026 · 10:25 IST", "EXPIRY"],
];

export default function NotificationsPage() {
  return <main className="business-app institution-app"><AppSidebar role="institutionAdmin" /><section className="business-main"><header className="business-header"><div><p className="kicker">Bank A / notification center</p><h1>Notifications</h1><p>Review tenant-level consent, request and session events relevant to your institution.</p></div><button className="light-button" type="button">Mark all as read</button></header><section className="notification-filters"><button className="active" type="button">All <span>4</span></button><button type="button">Requests</button><button type="button">Consents</button><button type="button">Access</button><button type="button">Expiry</button></section><section className="notification-list">{notes.map(([title, copy, time, type], index) => <article className={index < 2 ? "unread" : ""} key={title}><div className="notification-dot" /><div><p className="kicker">{type}</p><strong>{title}</strong><p>{copy}</p><time>{time}</time></div><button type="button">Mark read</button></article>)}</section><section className="notification-note"><p className="kicker">Privacy notice</p><h2>Events, not private contents.</h2><p>Notifications identify relevant workflow events only. They do not include document pages, bank statements, OTPs, or information beyond what the recipient is already permitted to see.</p></section></section></main>;
}
