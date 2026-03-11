import React, { useState, useEffect } from "react";
import { listPatients, getPatient, createMedicalRecord, getDoctorSchedule, aiDiagnosisAssist, getPatientLabReports } from "../../services/hospitalApi";
import DoctorBodyAnnotator from "./DoctorBodyAnnotator";

const emptyRecord = { next_visit_date: "", diagnosis: "", notes: "", prescriptions: [] };
const emptyRx = { medicine: "", dosage: "", duration: "" };

export default function DoctorDashboard({ user }) {
  const [tab, setTab] = useState("patients");
  const [patients, setPatients] = useState([]);
  const [schedule, setSchedule] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [showRecordForm, setShowRecordForm] = useState(false);
  const [record, setRecord] = useState(emptyRecord);
  const [annotations, setAnnotations] = useState([]);
  const [rxRow, setRxRow] = useState(emptyRx);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [search, setSearch] = useState("");
  const [aiSuggestion, setAiSuggestion] = useState(null);
  const [loadingAi, setLoadingAi] = useState(false);
  const [labReports, setLabReports] = useState([]);
  const [labLoaded, setLabLoaded] = useState(false);

  useEffect(() => {
    fetchPatients();
    fetchSchedule();
  }, []);

  const fetchPatients = async () => {
    setLoading(true);
    try { setPatients(await listPatients()); }
    catch { setError("Failed to load patients."); }
    finally { setLoading(false); }
  };

  const fetchSchedule = async () => {
    try { setSchedule(await getDoctorSchedule()); }
    catch { /* non-critical */ }
  };

  const handleSelect = async (p) => {
    setSelected(p); setShowRecordForm(false); setDetail(null);
    setRecord(emptyRecord); setAnnotations([]);
    setAiSuggestion(null); setLabReports([]); setLabLoaded(false);
    try { setDetail(await getPatient(p._id)); }
    catch { setDetail({ patient: p, records: [] }); }
  };

  const handleAiAssist = async () => {
    if (!detail) return;
    setLoadingAi(true); setAiSuggestion(null);
    try {
      const p = detail.patient;
      const res = await aiDiagnosisAssist({
        age: p.age, sex: p.sex,
        known_conditions: p.known_conditions || [],
        allergies: p.allergies || [],
        current_medications: p.current_medications || [],
        annotations: annotations.map(a => ({ region_label: a.region_label, description: a.description })),
        notes: record.notes,
      });
      setAiSuggestion(res.suggestion);
    } catch { setAiSuggestion("AI service unavailable. Please try again."); }
    finally { setLoadingAi(false); }
  };

  const handleLoadLabReports = async () => {
    if (labLoaded || !selected) return;
    try {
      const data = await getPatientLabReports(selected._id);
      setLabReports(data); setLabLoaded(true);
    } catch { setLabLoaded(true); }
  };

  const handleAddRx = () => {
    if (!rxRow.medicine.trim()) return;
    setRecord(r => ({ ...r, prescriptions: [...r.prescriptions, { ...rxRow }] }));
    setRxRow(emptyRx);
  };

  const handleSubmitRecord = async (e) => {
    e.preventDefault();
    if (!record.diagnosis.trim()) { setError("Diagnosis is required."); return; }
    setSaving(true); setError("");
    try {
      await createMedicalRecord({
        patient_id: selected._id,
        next_visit_date: record.next_visit_date || null,
        body_annotations: annotations,
        diagnosis: record.diagnosis,
        notes: record.notes,
        prescriptions: record.prescriptions,
      });
      setSuccess("Visit record saved.");
      setShowRecordForm(false);
      setRecord(emptyRecord); setAnnotations([]);
      const d = await getPatient(selected._id);
      setDetail(d);
      fetchSchedule();
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to save record.");
    } finally { setSaving(false); }
  };

  // Group schedule by date
  const scheduleByDate = schedule.reduce((acc, r) => {
    const d = new Date(r.next_visit_date).toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "short", day: "numeric" });
    if (!acc[d]) acc[d] = [];
    acc[d].push(r);
    return acc;
  }, {});

  const filtered = patients.filter(p =>
    p.name?.toLowerCase().includes(search.toLowerCase()) ||
    p.patient_id?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="hosp-dashboard">
      <h2 className="hosp-dashboard-title">Doctor Dashboard</h2>

      {error && <div className="hosp-banner hosp-banner-error">⚠ {error}</div>}
      {success && <div className="hosp-banner hosp-banner-success">✓ {success}</div>}

      <div className="hosp-tabs">
        <button className={`hosp-tab ${tab === "patients" ? "active" : ""}`} onClick={() => setTab("patients")}>
          Patients
        </button>
        <button className={`hosp-tab ${tab === "schedule" ? "active" : ""}`} onClick={() => setTab("schedule")}>
          My Schedule {schedule.length > 0 && `(${schedule.length})`}
        </button>
      </div>

      {tab === "patients" && (
        <div className="hosp-two-panel">
          {/* Left panel */}
          <div className="hosp-panel-left">
            <div className="hosp-panel-header" style={{ flexDirection: "column", gap: 6, alignItems: "stretch" }}>
              <span>All Patients ({patients.length})</span>
              <input
                style={{ background: "var(--bg-primary)", border: "1px solid var(--border-color)", borderRadius: 6, padding: "4px 8px", color: "var(--text-primary)", fontSize: "0.76rem", fontFamily: "var(--font)", outline: "none" }}
                placeholder="Search…"
                value={search} onChange={e => setSearch(e.target.value)}
              />
            </div>
            <div className="hosp-panel-list">
              {loading ? <p style={{ padding: "12px", color: "var(--text-muted)", fontSize: "0.80rem" }}>Loading…</p> :
                filtered.map(p => (
                  <div key={p._id} className={`hosp-list-row ${selected?._id === p._id ? "active" : ""}`} onClick={() => handleSelect(p)}>
                    <span className="hosp-list-row-title">{p.name}</span>
                    <span className="hosp-list-row-sub">{p.patient_id} · {p.age}y · {p.sex}</span>
                  </div>
                ))
              }
            </div>
          </div>

          {/* Right panel */}
          <div className="hosp-panel-right">
            {!selected ? (
              <div className="hosp-empty"><div className="hosp-empty-icon">🩺</div>Select a patient to view details or add a visit record.</div>
            ) : !detail ? (
              <p style={{ color: "var(--text-muted)" }}>Loading…</p>
            ) : (
              <div>
                {/* Patient summary */}
                <div className="hosp-card" style={{ marginBottom: 14 }}>
                  <h3 className="hosp-card-title">{detail.patient.name}</h3>
                  <p className="hosp-card-sub">{detail.patient.patient_id} · {detail.patient.age}y · {detail.patient.sex} · {detail.patient.blood_type || "Blood type unknown"}</p>
                  {detail.patient.known_conditions?.length > 0 && (
                    <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", margin: 0 }}>Conditions: {detail.patient.known_conditions.join(", ")}</p>
                  )}
                  {detail.patient.allergies?.length > 0 && (
                    <p style={{ fontSize: "0.78rem", color: "#f0883e", margin: "4px 0 0" }}>Allergies: {detail.patient.allergies.join(", ")}</p>
                  )}
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <p className="hosp-section-heading" style={{ margin: 0 }}>Visit History ({detail.records.length})</p>
                  <button
                    className="hosp-btn hosp-btn-primary hosp-btn-sm"
                    onClick={() => { setShowRecordForm(f => !f); setRecord(emptyRecord); setAnnotations([]); }}
                  >
                    {showRecordForm ? "Cancel" : "+ Add Visit Record"}
                  </button>
                </div>

                {showRecordForm && (
                  <form className="hosp-inline-form" onSubmit={handleSubmitRecord}>
                    <p className="hosp-inline-form-title">New Visit Record — {detail.patient.name}</p>

                    <p className="hosp-section-heading" style={{ marginBottom: 6 }}>3D Body Annotations</p>
                    <DoctorBodyAnnotator annotations={annotations} onChange={setAnnotations} />

                    {/* AI Diagnosis Assist */}
                    <div className="hosp-ai-trigger-row" style={{ marginTop: 10 }}>
                      <button type="button" className="hosp-btn hosp-btn-sm hosp-btn-ai" onClick={handleAiAssist} disabled={loadingAi}>
                        {loadingAi ? "Analysing…" : "🤖 AI Diagnosis Assist"}
                      </button>
                      <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                        Uses patient profile + annotations + notes
                      </span>
                    </div>
                    {aiSuggestion && (
                      <div className="hosp-ai-panel">
                        <p className="hosp-ai-panel-title">🤖 AI Differential Diagnoses</p>
                        <p className="hosp-ai-panel-body">{aiSuggestion}</p>
                      </div>
                    )}

                    <div className="hosp-form-grid" style={{ marginTop: 12 }}>
                      <div className="hosp-field" style={{ gridColumn: "1 / -1" }}>
                        <label>Diagnosis *</label>
                        <input value={record.diagnosis} onChange={e => setRecord(r => ({...r, diagnosis: e.target.value}))} placeholder="e.g. Viral upper respiratory infection" />
                      </div>
                      <div className="hosp-field" style={{ gridColumn: "1 / -1" }}>
                        <label>Notes</label>
                        <textarea rows={2} value={record.notes} onChange={e => setRecord(r => ({...r, notes: e.target.value}))} placeholder="Additional clinical notes…" />
                      </div>
                      <div className="hosp-field">
                        <label>Next Visit Date</label>
                        <input type="date" value={record.next_visit_date} onChange={e => setRecord(r => ({...r, next_visit_date: e.target.value}))} />
                      </div>
                    </div>

                    {/* Prescription builder */}
                    <p className="hosp-section-heading" style={{ marginTop: 12, marginBottom: 6 }}>Prescriptions</p>
                    {record.prescriptions.length > 0 && (
                      <div className="hosp-rx-list" style={{ marginBottom: 8 }}>
                        {record.prescriptions.map((rx, i) => (
                          <div key={i} className="hosp-rx-row">
                            <span className="hosp-rx-medicine">{rx.medicine}</span>
                            <span className="hosp-rx-details">{rx.dosage} · {rx.duration}</span>
                            <button type="button" className="hosp-annotation-remove" onClick={() => setRecord(r => ({...r, prescriptions: r.prescriptions.filter((_,j) => j !== i)}))}>✕</button>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="hosp-rx-add-row">
                      <div className="hosp-field">
                        <label>Medicine</label>
                        <input value={rxRow.medicine} onChange={e => setRxRow(r => ({...r, medicine: e.target.value}))} placeholder="e.g. Amoxicillin 500mg" />
                      </div>
                      <div className="hosp-field">
                        <label>Dosage</label>
                        <input value={rxRow.dosage} onChange={e => setRxRow(r => ({...r, dosage: e.target.value}))} placeholder="3x daily" />
                      </div>
                      <div className="hosp-field">
                        <label>Duration</label>
                        <input value={rxRow.duration} onChange={e => setRxRow(r => ({...r, duration: e.target.value}))} placeholder="7 days" />
                      </div>
                      <div className="hosp-field">
                        <label>&nbsp;</label>
                        <button type="button" className="hosp-btn hosp-btn-sm" onClick={handleAddRx}>+ Add</button>
                      </div>
                    </div>

                    <div className="hosp-form-actions" style={{ marginTop: 14 }}>
                      <button type="submit" className="hosp-btn hosp-btn-primary" disabled={saving}>
                        {saving ? "Saving…" : "Save Visit Record"}
                      </button>
                    </div>
                  </form>
                )}

                {/* Previous records */}
                {detail.records.map(r => (
                  <CollapsibleRecord key={r._id} record={r} />
                ))}

                {/* Lab Reports section */}
                <div style={{ marginTop: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                    <p className="hosp-section-heading" style={{ margin: 0 }}>Lab Reports {labLoaded ? `(${labReports.length})` : ""}</p>
                    {!labLoaded && (
                      <button className="hosp-btn hosp-btn-sm" onClick={handleLoadLabReports}>Load Lab Reports</button>
                    )}
                  </div>
                  {labLoaded && labReports.length === 0 && (
                    <p style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>No lab reports uploaded for this patient.</p>
                  )}
                  {labReports.map(rep => (
                    <div key={rep._id} className="hosp-record-card" style={{ marginBottom: 8 }}>
                      <div className="hosp-record-header">
                        <div className="hosp-record-header-left">{rep.report_title}</div>
                        <div className="hosp-record-header-right">
                          {rep.report_type?.replace("_", " ")} · {rep.uploaded_by_name} · {rep.uploaded_at ? new Date(rep.uploaded_at).toLocaleDateString() : ""}
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
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "schedule" && (
        <div className="hosp-single-scroll" style={{ maxWidth: 700 }}>
          {Object.keys(scheduleByDate).length === 0 ? (
            <div className="hosp-empty"><div className="hosp-empty-icon">📅</div>No upcoming scheduled visits.</div>
          ) : Object.entries(scheduleByDate).map(([date, recs]) => (
            <div key={date} className="hosp-schedule-group">
              <div className="hosp-schedule-date">{date} — {recs.length} patient{recs.length !== 1 ? "s" : ""}</div>
              {recs.map(r => (
                <div key={r._id} className="hosp-schedule-item">
                  <span className="hosp-schedule-item-name">{r.patient_name}</span>
                  <span className="hosp-schedule-item-diag">{r.diagnosis}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CollapsibleRecord({ record: r }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="hosp-record-card">
      <div className="hosp-record-header" onClick={() => setOpen(o => !o)} style={{ cursor: "pointer" }}>
        <div className="hosp-record-header-left">{new Date(r.visit_date).toLocaleDateString()} — {r.diagnosis}</div>
        <div className="hosp-record-header-right">{open ? "▲" : "▼"}</div>
      </div>
      {open && (
        <div className="hosp-record-body">
          {r.body_annotations?.length > 0 && (
            <div>
              <p className="hosp-section-heading" style={{ marginBottom: 6 }}>Annotations</p>
              <div className="hosp-annotation-list">
                {r.body_annotations.map((a, i) => (
                  <div key={i} className="hosp-annotation-item">
                    <div className="hosp-annotation-dot" style={{ background: "#58a6ff" }} />
                    <div className="hosp-annotation-text">
                      <div className="hosp-annotation-label">{a.region_label}</div>
                      {a.description && <div className="hosp-annotation-desc">{a.description}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {r.notes && <p style={{ fontSize: "0.80rem", color: "var(--text-secondary)", margin: 0 }}>{r.notes}</p>}
          {r.prescriptions?.length > 0 && (
            <div className="hosp-rx-list">
              {r.prescriptions.map((rx, i) => (
                <div key={i} className={`hosp-rx-row ${rx.dispensed ? "dispensed" : ""}`}>
                  <span className="hosp-rx-medicine">{rx.medicine}</span>
                  <span className="hosp-rx-details">{rx.dosage} · {rx.duration}</span>
                  <span className={`hosp-rx-status ${rx.dispensed ? "dispensed" : "pending"}`}>{rx.dispensed ? "Dispensed" : "Pending"}</span>
                </div>
              ))}
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
