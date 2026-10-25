"use client";

import Link from "next/link";
import { useState, useCallback } from "react";
import AppSidebar from "../../components/AppSidebar";
import { useAuth, sidebarRole } from "../../lib/auth-context";
import { useApi } from "../../lib/hooks";
import * as api from "../../lib/api";

export default function BusinessNotificationsPage() {
  const { user } = useAuth();
  const role = sidebarRole(user?.role || "BUSINESS_OWNER");
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
    <main className="business-app">
      <AppSidebar role={role as any} />
      <section className="business-main">
        <div className="business-prototype">
          Prototype · synthetic data only · notifications contain no document content
        </div>
        <header className="business-header">
          <div>
            <p className="kicker">Business workspace / notification center</p>
            <h1>Notifications</h1>
            <p>Stay informed about requests, consents, evidence access and verification changes.</p>
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
          <h2>Useful updates without private file contents.</h2>
          <p>
            Notifications tell you about actions affecting your business. They do not include document pages, OTP values, passwords, or other sensitive contents.
          </p>
        </section>
      </section>
    </main>
  );
}
