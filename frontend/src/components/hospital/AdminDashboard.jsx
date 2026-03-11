import React, { useState, useEffect } from "react";
import { listHospitalUsers, createHospitalUser, deleteHospitalUser, aiActivitySummary } from "../../services/hospitalApi";

const ROLES = ["doctor", "nurse", "pharmacist", "admin"];
const ROLE_COLORS = { admin: "hosp-role-admin", doctor: "hosp-role-doctor", nurse: "hosp-role-nurse", pharmacist: "hosp-role-pharmacist" };

const emptyForm = { username: "", password: "", name: "", role: "doctor", specialization: "" };

export default function AdminDashboard({ user }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [confirmingId, setConfirmingId] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [aiSummary, setAiSummary] = useState(null);
  const [aiStats, setAiStats] = useState(null);
  const [loadingAi, setLoadingAi] = useState(false);

  useEffect(() => { fetchUsers(); }, []);

  const handleAiSummary = async () => {
    setLoadingAi(true); setAiSummary(null); setAiStats(null); setError("");
    try {
      const data = await aiActivitySummary();
      setAiSummary(data.summary);
      setAiStats(data.stats);
    } catch (err) {
      setError(err.response?.data?.detail || "AI summary unavailable.");
    } finally {
      setLoadingAi(false);
    }
  };

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const data = await listHospitalUsers();
      setUsers(data);
    } catch {
      setError("Failed to load users.");
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.username || !form.password || !form.name || !form.role) {
      setError("All fields except specialization are required."); return;
    }
    setSaving(true); setError("");
    try {
      await createHospitalUser(form);
      setSuccess("Staff member created.");
      setShowForm(false);
      setForm(emptyForm);
      fetchUsers();
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to create user.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (userId) => {
    try {
      await deleteHospitalUser(userId);
      setConfirmingId(null);
      setSuccess("User deleted.");
      fetchUsers();
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to delete user.");
      setConfirmingId(null);
    }
  };

  return (
    <div className="hosp-dashboard">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h2 className="hosp-dashboard-title">Staff Management</h2>
        <button className="hosp-btn hosp-btn-primary" onClick={() => { setShowForm(!showForm); setError(""); }}>
          {showForm ? "Cancel" : "+ Add Staff"}
        </button>
      </div>

      <div className="hosp-single-scroll">
      {error && <div className="hosp-banner hosp-banner-error">⚠ {error}</div>}
      {success && <div className="hosp-banner hosp-banner-success">✓ {success}</div>}

      {/* AI Activity Summary */}
      <div className="hosp-ai-trigger-row">
        <button className="hosp-btn hosp-btn-sm hosp-btn-ai" onClick={handleAiSummary} disabled={loadingAi}>
          {loadingAi ? "Generating…" : "🤖 AI Activity Summary"}
        </button>
        {aiStats && (
          <span className="hosp-ai-stats-pill">
            {aiStats.total_patients} patients · {aiStats.total_visits} visits · {aiStats.pending_prescriptions} pending Rx
          </span>
        )}
      </div>
      {aiSummary && (
        <div className="hosp-ai-panel">
          <p className="hosp-ai-panel-title">🤖 AI Summary</p>
          <p className="hosp-ai-panel-body">{aiSummary}</p>
        </div>
      )}

      {showForm && (
        <form className="hosp-inline-form" onSubmit={handleCreate}>
          <p className="hosp-inline-form-title">New Staff Member</p>
          <div className="hosp-form-grid">
            <div className="hosp-field">
              <label>Username *</label>
              <input value={form.username} onChange={e => setForm(f => ({...f, username: e.target.value}))} placeholder="e.g. dr_mehta" />
            </div>
            <div className="hosp-field">
              <label>Password *</label>
              <input type="password" value={form.password} onChange={e => setForm(f => ({...f, password: e.target.value}))} placeholder="min 6 chars" />
            </div>
            <div className="hosp-field">
              <label>Full Name *</label>
              <input value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} placeholder="e.g. Dr. Anjali Mehta" />
            </div>
            <div className="hosp-field">
              <label>Role *</label>
              <select value={form.role} onChange={e => setForm(f => ({...f, role: e.target.value}))}>
                {ROLES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
              </select>
            </div>
            {form.role === "doctor" && (
              <div className="hosp-field">
                <label>Specialization</label>
                <input value={form.specialization} onChange={e => setForm(f => ({...f, specialization: e.target.value}))} placeholder="e.g. Cardiology" />
              </div>
            )}
          </div>
          <div className="hosp-form-actions">
            <button type="submit" className="hosp-btn hosp-btn-primary" disabled={saving}>
              {saving ? "Creating…" : "Create Staff"}
            </button>
            <button type="button" className="hosp-btn" onClick={() => { setShowForm(false); setForm(emptyForm); }}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p style={{ color: "var(--text-muted)" }}>Loading…</p>
      ) : (
        <div className="hosp-table-wrap">
          <table className="hosp-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Username</th>
                <th>Role</th>
                <th>Specialization</th>
                <th>Added</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u._id}>
                  <td style={{ fontWeight: 600 }}>{u.name}</td>
                  <td style={{ color: "var(--text-muted)", fontFamily: "monospace" }}>{u.username}</td>
                  <td>
                    <span className={`hosp-role-badge ${ROLE_COLORS[u.role] || ""}`}>
                      {u.role}
                    </span>
                  </td>
                  <td style={{ color: "var(--text-muted)" }}>{u.specialization || "—"}</td>
                  <td style={{ color: "var(--text-muted)", fontSize: "0.76rem" }}>
                    {u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}
                  </td>
                  <td>
                    {u._id === user.id ? (
                      <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>You</span>
                    ) : confirmingId === u._id ? (
                      <div className="hosp-confirm-row">
                        <span className="hosp-confirm-text">Delete?</span>
                        <button className="hosp-confirm-yes" onClick={() => handleDelete(u._id)}>✓</button>
                        <button className="hosp-confirm-no" onClick={() => setConfirmingId(null)}>✕</button>
                      </div>
                    ) : (
                      <button className="hosp-btn hosp-btn-danger hosp-btn-sm" onClick={() => setConfirmingId(u._id)}>
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {users.length === 0 && (
            <div className="hosp-empty">
              <div className="hosp-empty-icon">👥</div>
              No staff members yet. Add one above.
            </div>
          )}
        </div>
      )}
      </div>{/* hosp-single-scroll */}
    </div>
  );
}
