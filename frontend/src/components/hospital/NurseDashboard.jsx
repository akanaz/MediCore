import React, { useState, useEffect } from "react";
import { listPatients, createPatient, getPatient, aiRiskAssessment, getPatientLabReports } from "../../services/hospitalApi";
import { CATEGORY_COLORS } from "../../utils/bodyRegions";

const emptyPatient = { name: "", age: "", sex: "male", phone: "", blood_type: "", known_conditions: "", allergies: "", current_medications: "" };

const splitCSV = (s) => s.split(",").map(x => x.trim()).filter(Boolean);

export default function NurseDashboard() {
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);       // patient detail
  const [detail, setDetail] = useState(null);           // { patient, records }
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyPatient);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => { fetchPatients(); }, []);

  const fetchPatients = async () => {
    setLoading(true);
    try { setPatients(await listPatients()); }
    catch { setError("Failed to load patients."); }
    finally { setLoading(false); }
  };

  const handleSelect = async (p) => {
    setSelected(p);
    setShowForm(false);
    setDetail(null);
    try {
      const d = await getPatient(p._id);
      setDetail(d);
    } catch { setDetail({ patient: p, records: [] }); }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.name || !form.age) { setError("Name and age are required."); return; }
    setSaving(true); setError("");
    try {
      await createPatient({
        name: form.name.trim(),
        age: parseInt(form.age),
        sex: form.sex,
        phone: form.phone.trim(),
        blood_type: form.blood_type.trim(),
        known_conditions: splitCSV(form.known_conditions),
        allergies: splitCSV(form.allergies),
        current_medications: splitCSV(form.current_medications),
      });
      setSuccess("Patient created."); setShowForm(false); setForm(emptyPatient);
      fetchPatients();
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to create patient.");
    } finally { setSaving(false); }
  };

  const filtered = patients.filter(p =>
    p.name?.toLowerCase().includes(search.toLowerCase()) ||
    p.patient_id?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="hosp-dashboard">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h2 className="hosp-dashboard-title">Patients</h2>
        <button className="hosp-btn hosp-btn-primary" onClick={() => { setShowForm(!showForm); setSelected(null); setError(""); }}>
          {showForm ? "Cancel" : "+ New Patient"}
        </button>
      </div>

      {error && <div className="hosp-banner hosp-banner-error">⚠ {error}</div>}
      {success && <div className="hosp-banner hosp-banner-success">✓ {success}</div>}

      <div className="hosp-two-panel">
        {/* Left: patient list */}
        <div className="hosp-panel-left">
          <div className="hosp-panel-header" style={{ flexDirection: "column", gap: 6, alignItems: "stretch" }}>
            <span>All Patients ({patients.length})</span>
            <input
              className="hosp-field input"
              style={{ background: "var(--bg-primary)", border: "1px solid var(--border-color)", borderRadius: 6, padding: "4px 8px", color: "var(--text-primary)", fontSize: "0.76rem", fontFamily: "var(--font)", outline: "none" }}
              placeholder="Search name / ID…"
              value={search} onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="hosp-panel-list">
            {loading ? <p style={{ padding: "12px", color: "var(--text-muted)", fontSize: "0.80rem" }}>Loading…</p> : (
              filtered.length === 0 ? (
                <div className="hosp-empty"><div className="hosp-empty-icon">🧑‍⚕️</div>No patients found.</div>
              ) : filtered.map(p => (
                <div
                  key={p._id}
                  className={`hosp-list-row ${selected?._id === p._id ? "active" : ""}`}
                  onClick={() => handleSelect(p)}
                >
                  <span className="hosp-list-row-title">{p.name}</span>
                  <span className="hosp-list-row-sub">{p.patient_id} · {p.age}y · {p.sex}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right: form or detail */}
        <div className="hosp-panel-right">
          {showForm ? (
            <form className="hosp-inline-form" onSubmit={handleCreate} style={{ background: "none", border: "none", padding: 0 }}>
              <p className="hosp-inline-form-title" style={{ fontSize: "1rem", marginBottom: 12 }}>New Patient</p>
              <div className="hosp-form-grid">
                <div className="hosp-field">
                  <label>Full Name *</label>
                  <input value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} placeholder="John Doe" />
                </div>
                <div className="hosp-field">
                  <label>Age *</label>
                  <input type="number" min="0" max="150" value={form.age} onChange={e => setForm(f => ({...f, age: e.target.value}))} placeholder="35" />
                </div>
                <div className="hosp-field">
                  <label>Sex</label>
                  <select value={form.sex} onChange={e => setForm(f => ({...f, sex: e.target.value}))}>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div className="hosp-field">
                  <label>Phone</label>
                  <input value={form.phone} onChange={e => setForm(f => ({...f, phone: e.target.value}))} placeholder="+91-9876543210" />
                </div>
                <div className="hosp-field">
                  <label>Blood Type</label>
                  <select value={form.blood_type} onChange={e => setForm(f => ({...f, blood_type: e.target.value}))}>
                    <option value="">Unknown</option>
                    {["A+","A-","B+","B-","AB+","AB-","O+","O-"].map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <div className="hosp-field" style={{ marginTop: 8 }}>
                <label>Known Conditions <span style={{ color: "var(--text-muted)" }}>(comma separated)</span></label>
                <input value={form.known_conditions} onChange={e => setForm(f => ({...f, known_conditions: e.target.value}))} placeholder="Hypertension, Diabetes" />
              </div>
              <div className="hosp-field" style={{ marginTop: 8 }}>
                <label>Allergies</label>
                <input value={form.allergies} onChange={e => setForm(f => ({...f, allergies: e.target.value}))} placeholder="Penicillin, Sulfa" />
              </div>
              <div className="hosp-field" style={{ marginTop: 8 }}>
                <label>Current Medications</label>
                <input value={form.current_medications} onChange={e => setForm(f => ({...f, current_medications: e.target.value}))} placeholder="Amlodipine 5mg, Metformin" />
              </div>
              <div className="hosp-form-actions" style={{ marginTop: 14 }}>
                <button type="submit" className="hosp-btn hosp-btn-primary" disabled={saving}>
                  {saving ? "Saving…" : "Save Patient"}
                </button>
                <button type="button" className="hosp-btn" onClick={() => { setShowForm(false); setForm(emptyPatient); }}>
                  Cancel
                </button>
              </div>
            </form>
          ) : selected && detail ? (
            <PatientDetail detail={detail} />
          ) : (
            <div className="hosp-empty">
              <div className="hosp-empty-icon">🩺</div>
              Select a patient from the list or create a new one.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PatientDetail({ detail }) {
  const { patient: p, records } = detail;
  const tags = (arr) => arr?.length ? arr.join(", ") : "None";

  const [riskResult, setRiskResult] = useState(null);
  const [loadingRisk, setLoadingRisk] = useState(false);
  const [riskError, setRiskError] = useState("");
  const [labReports, setLabReports] = useState([]);
  const [loadingLab, setLoadingLab] = useState(false);
  const [labLoaded, setLabLoaded] = useState(false);
  const [activeTab, setActiveTab] = useState("visits");

  const handleRiskAssessment = async () => {
    setLoadingRisk(true); setRiskResult(null); setRiskError("");
    try {
      const recentDx = records.slice(0, 5).map(r => r.diagnosis);
      const res = await aiRiskAssessment({
        age: p.age, sex: p.sex, blood_type: p.blood_type || "",
        known_conditions: p.known_conditions || [],
        allergies: p.allergies || [],
        current_medications: p.current_medications || [],
        recent_diagnoses: recentDx,
      });
      setRiskResult(res.assessment);
    } catch {
      setRiskError("AI risk assessment unavailable.");
    } finally { setLoadingRisk(false); }
  };

  const handleLabTab = async () => {
    setActiveTab("lab");
    if (!labLoaded) {
      setLoadingLab(true);
      try {
        const data = await getPatientLabReports(p._id);
        setLabReports(data);
        setLabLoaded(true);
      } catch { setLabReports([]); }
      finally { setLoadingLab(false); }
    }
  };

  return (
    <div>
      {/* Patient info card */}
      <div className="hosp-card" style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 10 }}>
          <div>
            <h3 className="hosp-card-title" style={{ fontSize: "1rem", marginBottom: 2 }}>{p.name}</h3>
            <p className="hosp-card-sub" style={{ marginBottom: 0 }}>{p.patient_id} · Registered {p.created_at ? new Date(p.created_at).toLocaleDateString() : ""}</p>
          </div>
          <button className="hosp-btn hosp-btn-sm hosp-btn-ai" onClick={handleRiskAssessment} disabled={loadingRisk}>
            {loadingRisk ? "Analysing…" : "🤖 Risk Assessment"}
          </button>
        </div>
        <div className="hosp-info-grid">
          <div className="hosp-info-item"><span className="hosp-info-label">Age</span><span className="hosp-info-value">{p.age}</span></div>
          <div className="hosp-info-item"><span className="hosp-info-label">Sex</span><span className="hosp-info-value">{p.sex}</span></div>
          <div className="hosp-info-item"><span className="hosp-info-label">Blood Type</span><span className="hosp-info-value">{p.blood_type || "Unknown"}</span></div>
          <div className="hosp-info-item"><span className="hosp-info-label">Phone</span><span className="hosp-info-value">{p.phone || "—"}</span></div>
          <div className="hosp-info-item" style={{ gridColumn: "1 / -1" }}><span className="hosp-info-label">Conditions</span><span className="hosp-info-value">{tags(p.known_conditions)}</span></div>
          <div className="hosp-info-item" style={{ gridColumn: "1 / -1" }}><span className="hosp-info-label">Allergies</span><span className="hosp-info-value">{tags(p.allergies)}</span></div>
          <div className="hosp-info-item" style={{ gridColumn: "1 / -1" }}><span className="hosp-info-label">Medications</span><span className="hosp-info-value">{tags(p.current_medications)}</span></div>
        </div>
        {riskError && <p style={{ fontSize: "0.76rem", color: "#f85149", margin: "6px 0 0" }}>⚠ {riskError}</p>}
        {riskResult && (
          <div className="hosp-ai-panel" style={{ marginTop: 10 }}>
            <p className="hosp-ai-panel-title">🤖 AI Risk Assessment</p>
            <p className="hosp-ai-panel-body">{riskResult}</p>
          </div>
        )}
      </div>

      {/* Sub-tabs: Visits / Lab Reports */}
      <div className="hosp-tabs" style={{ marginBottom: 12 }}>
        <button className={`hosp-tab ${activeTab === "visits" ? "active" : ""}`} onClick={() => setActiveTab("visits")}>
          Visit History ({records.length})
        </button>
        <button className={`hosp-tab ${activeTab === "lab" ? "active" : ""}`} onClick={handleLabTab}>
          Lab Reports {labLoaded ? `(${labReports.length})` : ""}
        </button>
      </div>

      {activeTab === "visits" && (
        records.length === 0 ? (
          <div className="hosp-empty" style={{ padding: "20px 0" }}>
            <div className="hosp-empty-icon">📋</div>No visits recorded yet.
          </div>
        ) : records.map(r => <VisitRecordCard key={r._id} record={r} />)
      )}

      {activeTab === "lab" && (
        loadingLab ? (
          <p style={{ color: "var(--text-muted)", fontSize: "0.82rem" }}>Loading…</p>
        ) : labReports.length === 0 ? (
          <div className="hosp-empty" style={{ padding: "20px 0" }}>
            <div className="hosp-empty-icon">🔬</div>No lab reports uploaded yet.
          </div>
        ) : labReports.map(rep => (
          <div key={rep._id} className="hosp-record-card" style={{ marginBottom: 10 }}>
            <div className="hosp-record-header">
              <div className="hosp-record-header-left">{rep.report_title}</div>
              <div className="hosp-record-header-right">
                {rep.report_type?.replace("_", " ")} · {rep.uploaded_at ? new Date(rep.uploaded_at).toLocaleDateString() : ""}
              </div>
            </div>
            {rep.ai_analysis && (
              <div className="hosp-record-body">
                <div className="hosp-ai-panel">
                  <p className="hosp-ai-panel-title">🤖 AI Analysis</p>
                  <p className="hosp-ai-panel-body">{rep.ai_analysis}</p>
                </div>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}

function VisitRecordCard({ record: r }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="hosp-record-card">
      <div className="hosp-record-header" onClick={() => setOpen(o => !o)} style={{ cursor: "pointer" }}>
        <div className="hosp-record-header-left">
          {new Date(r.visit_date).toLocaleDateString()} — {r.diagnosis}
        </div>
        <div className="hosp-record-header-right">{r.doctor_name} {open ? "▲" : "▼"}</div>
      </div>
      {open && (
        <div className="hosp-record-body">
          {r.body_annotations?.length > 0 && (
            <div>
              <p className="hosp-section-heading" style={{ marginBottom: 6 }}>Body Annotations</p>
              <div className="hosp-annotation-list">
                {r.body_annotations.map((a, i) => (
                  <div key={i} className="hosp-annotation-item">
                    <div className="hosp-annotation-dot" style={{ background: CATEGORY_COLORS[a.region_category] || "#58a6ff" }} />
                    <div className="hosp-annotation-text">
                      <div className="hosp-annotation-label">{a.region_label}</div>
                      <div className="hosp-annotation-desc">{a.description}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {r.notes && (
            <div>
              <p className="hosp-section-heading" style={{ marginBottom: 4 }}>Notes</p>
              <p style={{ fontSize: "0.82rem", color: "var(--text-secondary)", margin: 0 }}>{r.notes}</p>
            </div>
          )}
          {r.prescriptions?.length > 0 && (
            <div>
              <p className="hosp-section-heading" style={{ marginBottom: 6 }}>Prescriptions</p>
              <div className="hosp-rx-list">
                {r.prescriptions.map((rx, i) => (
                  <div key={i} className={`hosp-rx-row ${rx.dispensed ? "dispensed" : ""}`}>
                    <span className="hosp-rx-medicine">{rx.medicine}</span>
                    <span className="hosp-rx-details">{rx.dosage} · {rx.duration}</span>
                    <span className={`hosp-rx-status ${rx.dispensed ? "dispensed" : "pending"}`}>
                      {rx.dispensed ? `Dispensed by ${rx.dispensed_by_name}` : "Pending"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {r.next_visit_date && (
            <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", margin: 0 }}>
              Next visit: <strong style={{ color: "var(--accent-green)" }}>{new Date(r.next_visit_date).toLocaleDateString()}</strong>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
