"use client";

import { useState, useCallback } from "react";
import AppSidebar from "../../components/AppSidebar";
import { useAuth, sidebarRole } from "../../lib/auth-context";
import { useApi } from "../../lib/hooks";
import * as api from "../../lib/api";

export default function NotificationsPage() {
  const { user } = useAuth();
  const role = sidebarRole(user?.role || "INSTITUTION_ADMIN");
  const { data: notifications, loading, error, refetch } = useApi(() => api.listNotifications());
  const [markingId, setMarkingId] = useState<string | null>(null);

  const handleMarkRead = useCallback(async (id: string) => {
    setMarkingId(id);
    try {
      await api.markNotificationRead(id);
      refetch();
    } catch {
      /* ignore */
    } finally {
      setMarkingId(null);
    }
  }, [refetch]);

  const items = notifications || [];

  return (
    <main className="business-app institution-app">
      <AppSidebar role={role as any} />
      <section className="business-main">
        <div className="business-prototype">
          Prototype · synthetic data only · notifications contain no document content
        </div>
        <header className="business-header">
          <div>
            <p className="kicker">Institution / notification center</p>
            <h1>Notifications</h1>
            <p>Review tenant-level consent, request and session events relevant to your institution.</p>
          </div>
        </header>

        {error && (
          <div className="admin-alert" role="alert">
            <strong>Notice</strong>
            {error}
          </div>
        )}

        <section className="notification-list">
          {items.map((note) => (
            <article className={!note.read ? "unread" : ""} key={note.id}>
              <div className="notification-dot" />
              <div>
                <p className="kicker">{note.type}</p>
                <strong>{note.title}</strong>
                <p>{note.body}</p>
                <time>{new Date(note.createdAt).toLocaleString("en-IN")}</time>
              </div>
              {!note.read && (
                <button
                  type="button"
                  disabled={markingId === note.id}
                  onClick={() => handleMarkRead(note.id)}
                >
                  {markingId === note.id ? "…" : "Mark read"}
                </button>
              )}
            </article>
          ))}
          {!loading && items.length === 0 && (
            <p style={{ textAlign: "center", padding: "3rem 0", color: "var(--color-muted)" }}>
              No notifications yet.
            </p>
          )}
        </section>

        <section className="notification-note">
          <p className="kicker">Privacy notice</p>
          <h2>Events, not private contents.</h2>
          <p>
            Notifications identify relevant workflow events only. They do not include document pages, bank statements, OTPs, or information beyond what the recipient is already permitted to see.
          </p>
        </section>
      </section>
    </main>
  );
}
