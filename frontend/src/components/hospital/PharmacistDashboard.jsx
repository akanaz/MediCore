import React, { useState, useEffect } from "react";
import { listDoctors, getPrescriptionsByDoctor, dispenseMedicine, aiDrugInteractions } from "../../services/hospitalApi";

export default function PharmacistDashboard({ user }) {
  const [doctors, setDoctors] = useState([]);
  const [selectedDoctor, setSelectedDoctor] = useState(null);
  const [groups, setGroups] = useState([]);       // [{patient_id, patient_name, records:[]}]
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [loadingDoctors, setLoadingDoctors] = useState(true);
  const [loadingRx, setLoadingRx] = useState(false);
  const [dispensing, setDispensing] = useState(null);  // "recordId-medIndex"
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [interactionResult, setInteractionResult] = useState(null);
  const [loadingInteraction, setLoadingInteraction] = useState(false);

  useEffect(() => {
    listDoctors()
      .then(setDoctors)
      .catch(() => setError("Failed to load doctors."))
      .finally(() => setLoadingDoctors(false));
  }, []);

  const handleSelectDoctor = async (doc) => {
    setSelectedDoctor(doc);
    setSelectedGroup(null);
    setGroups([]);
    setLoadingRx(true);
    try {
      const data = await getPrescriptionsByDoctor(doc._id);
      setGroups(data);
    } catch {
      setError("Failed to load prescriptions.");
    } finally {
      setLoadingRx(false);
    }
  };

  const handleDispense = async (recordId, medIndex) => {
    const key = `${recordId}-${medIndex}`;
    setDispensing(key); setError("");
    try {
      await dispenseMedicine(recordId, medIndex);
      setSuccess("Medicine marked as dispensed.");
      setTimeout(() => setSuccess(""), 3000);
      // Refresh prescriptions for selected doctor
      const data = await getPrescriptionsByDoctor(selectedDoctor._id);
      setGroups(data);
      // Keep selected group updated
      if (selectedGroup) {
        const updated = data.find(g => g.patient_id === selectedGroup.patient_id);
        setSelectedGroup(updated || null);
      }
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to dispense.");
    } finally {
      setDispensing(null);
    }
  };

  const handleCheckInteractions = async () => {
    if (!selectedGroup) return;
    const allMeds = selectedGroup.records.flatMap(r =>
      r.prescriptions.map(rx => rx.medicine)
    ).filter(Boolean);
    if (allMeds.length === 0) { setError("No medicines to check."); return; }
    setLoadingInteraction(true); setInteractionResult(null); setError("");
    try {
      const res = await aiDrugInteractions(allMeds);
      setInteractionResult(res.analysis);
    } catch {
      setError("AI drug interaction check unavailable.");
    } finally { setLoadingInteraction(false); }
  };

  // Count pending prescriptions for a group
  const pendingCount = (g) =>
    g.records.reduce((sum, r) => sum + r.prescriptions.filter(rx => !rx.dispensed).length, 0);

  return (
    <div className="hosp-dashboard">
      <h2 className="hosp-dashboard-title">Pharmacy</h2>

      {error && <div className="hosp-banner hosp-banner-error">⚠ {error}</div>}
      {success && <div className="hosp-banner hosp-banner-success">✓ {success}</div>}

      <div className="hosp-two-panel">

        {/* Left: Doctor selector + patient list */}
        <div className="hosp-panel-left">
          <div className="hosp-panel-header">Select Doctor</div>
          <div className="hosp-panel-list">
            {loadingDoctors ? (
              <p style={{ padding: 12, color: "var(--text-muted)", fontSize: "0.80rem" }}>Loading…</p>
            ) : doctors.length === 0 ? (
              <div className="hosp-empty">No doctors found.</div>
            ) : doctors.map(doc => (
              <div
                key={doc._id}
                className={`hosp-list-row ${selectedDoctor?._id === doc._id ? "active" : ""}`}
                onClick={() => handleSelectDoctor(doc)}
              >
                <span className="hosp-list-row-title">{doc.name}</span>
                <span className="hosp-list-row-sub">{doc.specialization || "General"}</span>
              </div>
            ))}
          </div>

          {selectedDoctor && (
            <>
              <div className="hosp-panel-header" style={{ borderTop: "1px solid var(--border-color)" }}>
                Patients under {selectedDoctor.name.replace("Dr. ", "")}
              </div>
              <div className="hosp-panel-list">
                {loadingRx ? (
                  <p style={{ padding: 12, color: "var(--text-muted)", fontSize: "0.80rem" }}>Loading…</p>
                ) : groups.length === 0 ? (
                  <div className="hosp-empty" style={{ padding: "16px 12px" }}>No prescriptions found.</div>
                ) : groups.map(g => {
                  const pending = pendingCount(g);
                  return (
                    <div
                      key={g.patient_id}
                      className={`hosp-list-row ${selectedGroup?.patient_id === g.patient_id ? "active" : ""}`}
                      onClick={() => setSelectedGroup(g)}
                    >
                      <span className="hosp-list-row-title">{g.patient_name}</span>
                      <span className="hosp-list-row-sub">
                        {pending > 0
                          ? <span style={{ color: "#f0883e" }}>{pending} pending</span>
                          : <span style={{ color: "#3fb950" }}>All dispensed</span>
                        }
                      </span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Right: Prescriptions */}
        <div className="hosp-panel-right">
          {!selectedDoctor ? (
            <div className="hosp-empty">
              <div className="hosp-empty-icon">💊</div>
              Select a doctor on the left to view their patients' prescriptions.
            </div>
          ) : !selectedGroup ? (
            <div className="hosp-empty">
              <div className="hosp-empty-icon">🧑‍⚕️</div>
              Select a patient to view prescriptions.
            </div>
          ) : (
            <div>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 4 }}>
                <h3 style={{ fontSize: "1rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
                  {selectedGroup.patient_name}
                </h3>
                <button className="hosp-btn hosp-btn-sm hosp-btn-ai" onClick={handleCheckInteractions} disabled={loadingInteraction}>
                  {loadingInteraction ? "Checking…" : "🤖 Drug Interactions"}
                </button>
              </div>
              {interactionResult && (
                <div className="hosp-ai-panel" style={{ margin: "8px 0 12px" }}>
                  <p className="hosp-ai-panel-title">🤖 Drug Interaction Analysis</p>
                  <p className="hosp-ai-panel-body">{interactionResult}</p>
                </div>
              )}
              <p style={{ fontSize: "0.76rem", color: "var(--text-muted)", margin: "0 0 14px" }}>
                Prescriptions by {selectedDoctor.name}
              </p>

              {selectedGroup.records.map(record => (
                <div key={record._id} className="hosp-record-card" style={{ marginBottom: 12 }}>
                  <div className="hosp-record-header">
                    <div className="hosp-record-header-left">
                      Visit: {new Date(record.visit_date).toLocaleDateString()}
                    </div>
                    <div className="hosp-record-header-right">{record.diagnosis}</div>
                  </div>
                  <div className="hosp-record-body">
                    {record.prescriptions.length === 0 ? (
                      <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", margin: 0 }}>No medicines prescribed.</p>
                    ) : (
                      <div className="hosp-rx-list">
                        {record.prescriptions.map((rx, i) => {
                          const key = `${record._id}-${i}`;
                          const isDisp = rx.dispensed;
                          return (
                            <div key={i} className={`hosp-rx-row ${isDisp ? "dispensed" : ""}`}>
                              <span className="hosp-rx-medicine">{rx.medicine}</span>
                              <span className="hosp-rx-details">{rx.dosage} · {rx.duration}</span>
                              {isDisp ? (
                                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 1 }}>
                                  <span className="hosp-rx-status dispensed">✓ Dispensed</span>
                                  <span style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>
                                    by {rx.dispensed_by_name}
                                    {rx.dispensed_at && ` · ${new Date(rx.dispensed_at).toLocaleDateString()}`}
                                  </span>
                                </div>
                              ) : (
                                <button
                                  className="hosp-btn hosp-btn-success hosp-btn-sm"
                                  disabled={dispensing === key}
                                  onClick={() => handleDispense(record._id, i)}
                                >
                                  {dispensing === key ? "…" : "Mark Dispensed"}
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
