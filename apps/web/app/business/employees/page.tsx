"use client";

import { useState, useEffect } from "react";
import AppSidebar from "../../components/AppSidebar";

interface Employee {
  id: string;
  name: string;
  email: string;
  role: string;
  status: "ACTIVE" | "INVITED";
  scope: string;
}

function Side() {
  return <AppSidebar role="businessOwner" />;
}

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    role: "BUSINESS_EMPLOYEE",
    status: "ACTIVE" as "ACTIVE" | "INVITED",
    scope: "Upload and list metadata",
  });
  const [error, setError] = useState("");

  useEffect(() => {
    try {
      const saved = localStorage.getItem("trustledger_employees");
      if (saved) {
        setEmployees(JSON.parse(saved));
      }
    } catch {
      // Ignore storage errors
    }
  }, []);

  const handleAddEmployee = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim()) {
      setError("Please fill in both name and email.");
      return;
    }

    const newEmp: Employee = {
      id: Date.now().toString(),
      name: form.name.trim(),
      email: form.email.trim(),
      role: form.role,
      status: form.status,
      scope: form.scope || "Upload and list metadata",
    };

    const updated = [...employees, newEmp];
    setEmployees(updated);
    try {
      localStorage.setItem("trustledger_employees", JSON.stringify(updated));
    } catch {
      // Ignore storage errors
    }

    setForm({
      name: "",
      email: "",
      role: "BUSINESS_EMPLOYEE",
      status: "ACTIVE",
      scope: "Upload and list metadata",
    });
    setError("");
    setIsModalOpen(false);
  };

  const activeCount = employees.filter((e) => e.status === "ACTIVE").length;
  const pendingCount = employees.filter((e) => e.status === "INVITED").length;

  return (
    <main className="business-app">
      <Side />
      <section className="business-main">
        <header className="business-header">
          <div>
            <p className="kicker">Business workspace / team</p>
            <h1>Business employees</h1>
            <p>
              Invite teammates to help maintain business records without transferring owner controls.
            </p>
          </div>
          <button
            type="button"
            className="dark-button"
            onClick={() => {
              setError("");
              setIsModalOpen(true);
            }}
          >
            Invite employee <span>+</span>
          </button>
        </header>

        <section className="employee-overview">
          <article>
            <span>BUSINESS OWNERS</span>
            <strong>01</strong>
            <p>Can manage consent, sharing and employee access.</p>
          </article>
          <article>
            <span>ACTIVE EMPLOYEES</span>
            <strong>{String(activeCount).padStart(2, "0")}</strong>
            <p>Can upload and list document metadata.</p>
          </article>
          <article>
            <span>PENDING INVITES</span>
            <strong>{String(pendingCount).padStart(2, "0")}</strong>
            <p>Invitation has not been accepted.</p>
          </article>
        </section>

        <section className="employee-table">
          <div className="section-card-head">
            <div>
              <p className="kicker">Business member directory</p>
              <h2>Team access</h2>
            </div>
            <span>
              {employees.length} visible {employees.length === 1 ? "record" : "records"}
            </span>
          </div>
          <div className="vault-table-wrap">
            <table className="vault-table">
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Scope</th>
                </tr>
              </thead>
              <tbody>
                {employees.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ textAlign: "center", padding: "48px 20px" }}>
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          gap: "8px",
                          color: "#777770",
                        }}
                      >
                        <svg
                          width="36"
                          height="36"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          style={{ opacity: 0.5 }}
                        >
                          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                          <circle cx="9" cy="7" r="4" />
                          <line x1="19" y1="8" x2="19" y2="14" />
                          <line x1="22" y1="11" x2="16" y2="11" />
                        </svg>
                        <strong style={{ color: "#252522", fontSize: "13px" }}>
                          No employees added yet
                        </strong>
                        <span style={{ fontSize: "11px" }}>
                          Click &ldquo;Invite employee +&rdquo; above to add members to your workspace.
                        </span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  employees.map((emp) => (
                    <tr key={emp.id || emp.email}>
                      <td>
                        <strong>{emp.name}</strong>
                        <small>{emp.email}</small>
                      </td>
                      <td>
                        <code className="role-code">{emp.role}</code>
                      </td>
                      <td>
                        <span
                          className={
                            emp.status === "ACTIVE" ? "status registered" : "status pending"
                          }
                        >
                          {emp.status}
                        </span>
                      </td>
                      <td>{emp.scope}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="business-role-boundary">
          <div>
            <p className="kicker">Owner-only controls</p>
            <h2>Consent stays with the owner.</h2>
          </div>
          <p>
            Business employees may upload and list document metadata. They cannot create share codes,
            approve institution requests, revoke consent, delete documents, replace documents, or
            manage other employees.
          </p>
        </section>
      </section>

      {isModalOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0, 0, 0, 0.6)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: "20px",
          }}
          onClick={() => setIsModalOpen(false)}
        >
          <div
            style={{
              background: "#fff",
              color: "#111",
              borderRadius: "10px",
              width: "100%",
              maxWidth: "460px",
              padding: "28px",
              boxShadow: "0 20px 40px rgba(0,0,0,0.3)",
              border: "1px solid #d3d3cc",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                marginBottom: "20px",
              }}
            >
              <div>
                <p className="kicker" style={{ margin: "0 0 4px" }}>
                  Team access
                </p>
                <h2
                  style={{
                    margin: 0,
                    fontSize: "20px",
                    fontWeight: 600,
                    letterSpacing: "-0.03em",
                  }}
                >
                  Invite employee
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                style={{
                  background: "transparent",
                  border: 0,
                  fontSize: "18px",
                  cursor: "pointer",
                  color: "#888",
                  padding: "4px",
                }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddEmployee} style={{ display: "grid", gap: "14px" }}>
              {error && (
                <div
                  style={{
                    background: "#fee",
                    color: "#c00",
                    padding: "8px 12px",
                    borderRadius: "6px",
                    fontSize: "12px",
                  }}
                >
                  {error}
                </div>
              )}
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "10px",
                    fontWeight: 600,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    color: "#555",
                    marginBottom: "6px",
                  }}
                >
                  Full Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Nisha Kulkarni"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                  style={{
                    width: "100%",
                    height: "40px",
                    padding: "0 12px",
                    border: "1px solid #ccc",
                    borderRadius: "6px",
                    fontSize: "13px",
                    boxSizing: "border-box",
                  }}
                />
              </div>
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "10px",
                    fontWeight: 600,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    color: "#555",
                    marginBottom: "6px",
                  }}
                >
                  Work Email
                </label>
                <input
                  type="email"
                  placeholder="nisha@zenith.demo"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  required
                  style={{
                    width: "100%",
                    height: "40px",
                    padding: "0 12px",
                    border: "1px solid #ccc",
                    borderRadius: "6px",
                    fontSize: "13px",
                    boxSizing: "border-box",
                  }}
                />
              </div>
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "10px",
                    fontWeight: 600,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    color: "#555",
                    marginBottom: "6px",
                  }}
                >
                  Role
                </label>
                <select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                  style={{
                    width: "100%",
                    height: "40px",
                    padding: "0 12px",
                    border: "1px solid #ccc",
                    borderRadius: "6px",
                    fontSize: "13px",
                    boxSizing: "border-box",
                    background: "#fff",
                  }}
                >
                  <option value="BUSINESS_EMPLOYEE">BUSINESS_EMPLOYEE</option>
                </select>
              </div>
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "10px",
                    fontWeight: 600,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    color: "#555",
                    marginBottom: "6px",
                  }}
                >
                  Initial Status
                </label>
                <select
                  value={form.status}
                  onChange={(e) =>
                    setForm({ ...form, status: e.target.value as "ACTIVE" | "INVITED" })
                  }
                  style={{
                    width: "100%",
                    height: "40px",
                    padding: "0 12px",
                    border: "1px solid #ccc",
                    borderRadius: "6px",
                    fontSize: "13px",
                    boxSizing: "border-box",
                    background: "#fff",
                  }}
                >
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="INVITED">INVITED (Pending)</option>
                </select>
              </div>
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "10px",
                    fontWeight: 600,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    color: "#555",
                    marginBottom: "6px",
                  }}
                >
                  Permissions / Scope
                </label>
                <input
                  type="text"
                  value={form.scope}
                  onChange={(e) => setForm({ ...form, scope: e.target.value })}
                  placeholder="Upload and list metadata"
                  style={{
                    width: "100%",
                    height: "40px",
                    padding: "0 12px",
                    border: "1px solid #ccc",
                    borderRadius: "6px",
                    fontSize: "13px",
                    boxSizing: "border-box",
                  }}
                />
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: "10px",
                  marginTop: "10px",
                }}
              >
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  style={{
                    padding: "9px 16px",
                    border: "1px solid #ccc",
                    borderRadius: "6px",
                    background: "#fff",
                    cursor: "pointer",
                    fontSize: "13px",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="dark-button"
                  style={{
                    padding: "9px 18px",
                    borderRadius: "6px",
                    cursor: "pointer",
                    fontSize: "13px",
                  }}
                >
                  Add employee
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
