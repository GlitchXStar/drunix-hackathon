"use client";

import { useState, useEffect, useCallback } from "react";
import AppSidebar from "../components/AppSidebar";
import { useAuth, sidebarRole } from "../lib/auth-context";
import * as api from "../lib/api";

export default function LedgerExplorerPage() {
  const { user } = useAuth();
  const role = sidebarRole(user?.role || "KYC_OFFICER");

  const [status, setStatus] = useState<api.LedgerNetworkStatus | null>(null);
  const [transactions, setTransactions] = useState<api.LedgerTxRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTx, setSelectedTx] = useState<any | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [statusData, txsData] = await Promise.all([
        api.getLedgerStatus(),
        api.listLedgerTransactions(50),
      ]);
      setStatus(statusData);
      setTransactions(txsData || []);
      setError(null);
    } catch (err: any) {
      setError(err?.message || "Failed to connect to ledger network.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Auto-refresh interval
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      loadData();
    }, 4000);
    return () => clearInterval(interval);
  }, [autoRefresh, loadData]);

  const handleSelectTx = async (txId: string) => {
    setDetailLoading(true);
    try {
      const details = await api.getLedgerTransaction(txId);
      setSelectedTx(details);
    } catch (err: any) {
      setSelectedTx({
        txId,
        error: err?.message || "Failed to fetch transaction details",
      });
    } finally {
      setDetailLoading(false);
    }
  };

  const filteredTxs = transactions.filter((tx) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      tx.txId.toLowerCase().includes(q) ||
      tx.chaincodeFunction.toLowerCase().includes(q) ||
      tx.mspId.toLowerCase().includes(q) ||
      tx.status.toLowerCase().includes(q)
    );
  });

  return (
    <main className="business-app institution-app">
      <AppSidebar role={role as any} />
      <section className="business-main" style={{ maxWidth: "1280px" }}>
        <div className="business-prototype">
          Ledger Observability · Live Chaincode Transaction Stream · Invariants I-1 &amp; I-3 Compliant
        </div>

        <header className="business-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <p className="kicker">Drunix / Observability</p>
            <h1>Ledger Explorer</h1>
            <p>Inspect immutable ledger transactions, peer network health, and chaincode executions in real time.</p>
          </div>

          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", cursor: "pointer", color: "#555" }}>
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
              />
              Live polling (4s)
            </label>
            <button className="light-button" onClick={loadData} disabled={loading} style={{ fontSize: "12px", padding: "6px 14px" }}>
              {loading ? "Refreshing…" : "↻ Refresh"}
            </button>
          </div>
        </header>

        {error && (
          <div className="admin-alert" role="alert">
            <strong>Connection Notice:</strong> {error}
          </div>
        )}

        {/* Network & Provider Status Card */}
        <section className="vault-card" style={{ marginBottom: "24px" }}>
          <div className="vault-card-head" style={{ borderBottom: "1px solid #eee", paddingBottom: "16px" }}>
            <div>
              <p className="kicker" style={{ color: "#2e8b57" }}>● Live Network Telemetry</p>
              <h2>{status?.provider || "Connecting to Ledger Provider..."}</h2>
            </div>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              {status?.isSimulated ? (
                <span style={{ fontSize: "11px", background: "#f0f2f5", padding: "4px 8px", borderRadius: "4px", color: "#666", fontWeight: 600 }}>
                  Simulated Ledger — In-Memory Provider
                </span>
              ) : (
                <span style={{ fontSize: "11px", background: "#e6f7ff", padding: "4px 8px", borderRadius: "4px", color: "#0050b3", fontWeight: 600 }}>
                  Drunix Fabric Enterprise Network
                </span>
              )}
              <span
                style={{
                  fontSize: "12px",
                  fontWeight: 700,
                  padding: "4px 10px",
                  borderRadius: "20px",
                  background: status?.status === "ONLINE" ? "#e6f8ee" : "#fff1f0",
                  color: status?.status === "ONLINE" ? "#2e8b57" : "#cf1322",
                }}
              >
                {status?.status || "CONNECTING"}
              </span>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px", marginTop: "16px" }}>
            <div style={{ padding: "12px", background: "#fafafa", borderRadius: "6px", border: "1px solid #eee" }}>
              <span style={{ fontSize: "11px", color: "#888", textTransform: "uppercase", letterSpacing: "0.05em" }}>Channel ID</span>
              <p style={{ margin: "4px 0 0", fontFamily: "monospace", fontWeight: 600, fontSize: "13px" }}>{status?.channelId || "—"}</p>
            </div>
            <div style={{ padding: "12px", background: "#fafafa", borderRadius: "6px", border: "1px solid #eee" }}>
              <span style={{ fontSize: "11px", color: "#888", textTransform: "uppercase", letterSpacing: "0.05em" }}>Chaincode ID</span>
              <p style={{ margin: "4px 0 0", fontFamily: "monospace", fontWeight: 600, fontSize: "13px" }}>{status?.chaincodeId || "—"}</p>
            </div>
            <div style={{ padding: "12px", background: "#fafafa", borderRadius: "6px", border: "1px solid #eee" }}>
              <span style={{ fontSize: "11px", color: "#888", textTransform: "uppercase", letterSpacing: "0.05em" }}>Consensus Engine</span>
              <p style={{ margin: "4px 0 0", fontWeight: 600, fontSize: "13px" }}>{status?.consensusModel || "—"}</p>
            </div>
            <div style={{ padding: "12px", background: "#fafafa", borderRadius: "6px", border: "1px solid #eee" }}>
              <span style={{ fontSize: "11px", color: "#888", textTransform: "uppercase", letterSpacing: "0.05em" }}>Committed Transactions</span>
              <p style={{ margin: "4px 0 0", fontWeight: 700, fontSize: "18px", color: "#111" }}>{status?.totalTransactions ?? "—"}</p>
            </div>
          </div>

          {/* Active Network Peers */}
          {status?.peers && status.peers.length > 0 && (
            <div style={{ marginTop: "20px" }}>
              <h4 style={{ fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.05em", color: "#666", marginBottom: "10px" }}>
                Active Peer &amp; Endorsement Topology
              </h4>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "12px" }}>
                {status.peers.map((peer) => (
                  <div
                    key={peer.mspId}
                    style={{
                      padding: "10px 14px",
                      borderRadius: "6px",
                      border: "1px solid #e5e7eb",
                      background: "#fff",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <div>
                      <strong style={{ fontSize: "13px", display: "block" }}>{peer.name}</strong>
                      <span style={{ fontSize: "11px", color: "#666", fontFamily: "monospace" }}>{peer.mspId}</span>
                      <div style={{ fontSize: "11px", color: "#888", marginTop: "2px" }}>{peer.role}</div>
                    </div>
                    <span
                      style={{
                        fontSize: "10px",
                        fontWeight: 700,
                        padding: "2px 8px",
                        borderRadius: "12px",
                        background: peer.status === "ONLINE" ? "#e6f8ee" : "#fff1f0",
                        color: peer.status === "ONLINE" ? "#2e8b57" : "#cf1322",
                      }}
                    >
                      {peer.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Transaction Stream Section */}
        <section className="vault-card">
          <div className="vault-card-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <p className="kicker">Ledger Stream</p>
              <h2>On-Chain Transaction Log</h2>
            </div>
            <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
              <input
                type="text"
                placeholder="Filter by Function, Tx ID, or Org..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  padding: "6px 12px",
                  fontSize: "12px",
                  borderRadius: "6px",
                  border: "1px solid #ccc",
                  width: "260px",
                }}
              />
              <span className="vault-count">
                {filteredTxs.length} transaction{filteredTxs.length === 1 ? "" : "s"}
              </span>
            </div>
          </div>

          <div className="vault-table-wrap">
            <table className="vault-table">
              <thead>
                <tr>
                  <th>Transaction ID</th>
                  <th>Chaincode Function</th>
                  <th>Acting Organization</th>
                  <th>Latency</th>
                  <th>Committed Time (UTC)</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredTxs.map((tx) => (
                  <tr key={tx.id || tx.txId} style={{ cursor: "pointer" }} onClick={() => handleSelectTx(tx.txId)}>
                    <td>
                      <code style={{ fontSize: "12px", color: "#0050b3", fontWeight: 600 }}>{tx.txId}</code>
                    </td>
                    <td>
                      <span
                        style={{
                          fontWeight: 600,
                          fontSize: "12px",
                          padding: "2px 8px",
                          borderRadius: "4px",
                          background:
                            tx.chaincodeFunction === "CreateConsent"
                              ? "#e6f7ff"
                              : tx.chaincodeFunction === "RegisterDocument"
                              ? "#f9f0ff"
                              : tx.chaincodeFunction === "IssueAttestation"
                              ? "#fcffe6"
                              : tx.chaincodeFunction === "RecordAccessEvent"
                              ? "#f6ffed"
                              : "#f5f5f5",
                          color: "#111",
                        }}
                      >
                        {tx.chaincodeFunction}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontSize: "12px", fontFamily: "monospace" }}>{tx.mspId}</span>
                    </td>
                    <td>
                      <span style={{ fontSize: "11px", color: "#666" }}>{tx.latencyMs} ms</span>
                    </td>
                    <td>
                      <span style={{ fontSize: "12px" }}>
                        {new Date(tx.at).toLocaleDateString("en-IN", {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                      </span>
                    </td>
                    <td>
                      <span
                        className={
                          tx.status === "SUCCESS"
                            ? "status registered"
                            : "status expired"
                        }
                      >
                        {tx.status}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="light-button"
                        style={{ fontSize: "11px", padding: "4px 8px" }}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectTx(tx.txId);
                        }}
                      >
                        Inspect →
                      </button>
                    </td>
                  </tr>
                ))}

                {filteredTxs.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ textAlign: "center", padding: "32px", color: "#888" }}>
                      No ledger transactions found matching the filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Transaction Detail Modal */}
        {selectedTx && (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "rgba(0,0,0,0.5)",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              zIndex: 1000,
              padding: "20px",
            }}
            onClick={() => setSelectedTx(null)}
          >
            <div
              style={{
                backgroundColor: "#fff",
                borderRadius: "8px",
                maxWidth: "640px",
                width: "100%",
                padding: "24px",
                boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
                <div>
                  <p className="kicker" style={{ color: "#2e8b57" }}>Immutable Ledger Evidence</p>
                  <h2 style={{ margin: "2px 0 0", fontSize: "18px" }}>Transaction Detail</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedTx(null)}
                  style={{ background: "none", border: "none", fontSize: "20px", cursor: "pointer", color: "#999" }}
                >
                  ✕
                </button>
              </div>

              {detailLoading ? (
                <p>Loading transaction metadata…</p>
              ) : selectedTx.error ? (
                <div className="admin-alert">{selectedTx.error}</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px", fontSize: "13px" }}>
                  <div style={{ background: "#f8f9fa", padding: "12px", borderRadius: "6px" }}>
                    <div style={{ fontSize: "11px", color: "#666", textTransform: "uppercase" }}>Transaction Identifier</div>
                    <code style={{ fontSize: "13px", fontWeight: 700, wordBreak: "break-all" }}>{selectedTx.txId}</code>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                    <div>
                      <div style={{ fontSize: "11px", color: "#666" }}>Function</div>
                      <strong style={{ fontSize: "14px" }}>{selectedTx.chaincodeFunction}</strong>
                    </div>
                    <div>
                      <div style={{ fontSize: "11px", color: "#666" }}>Status / Validation</div>
                      <span className="status registered">{selectedTx.status} ({selectedTx.validationCode || "VALID"})</span>
                    </div>
                    <div>
                      <div style={{ fontSize: "11px", color: "#666" }}>Channel</div>
                      <code>{selectedTx.channel || "trustledgerchannel"}</code>
                    </div>
                    <div>
                      <div style={{ fontSize: "11px", color: "#666" }}>Chaincode</div>
                      <code>{selectedTx.chaincode || "trustledger"}</code>
                    </div>
                    <div>
                      <div style={{ fontSize: "11px", color: "#666" }}>Execution Latency</div>
                      <span>{selectedTx.latencyMs} ms</span>
                    </div>
                    <div>
                      <div style={{ fontSize: "11px", color: "#666" }}>Committed At (UTC)</div>
                      <span>{selectedTx.timestamp ? new Date(selectedTx.timestamp).toISOString() : "—"}</span>
                    </div>
                  </div>

                  {/* Security Invariant Guarantee */}
                  <div style={{ padding: "12px", background: "#f6ffed", border: "1px solid #b7eb8f", borderRadius: "6px", marginTop: "8px", fontSize: "11px", color: "#389e0d" }}>
                    <strong>Privacy &amp; Invariants Guaranteed (I-3 &amp; I-6):</strong>
                    <div style={{ marginTop: "4px" }}>
                      Zero plain document bytes, encryption keys, OTPs, or PII are stored on the ledger. Only cryptographic commitments, consent IDs, and state transitions are recorded.
                    </div>
                  </div>
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "20px" }}>
                <button type="button" className="dark-button" onClick={() => setSelectedTx(null)}>
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
