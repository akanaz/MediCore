import React, { useState, useEffect, useRef } from "react";
import { listPatients, uploadLabReport, getPatientLabReports, getLabReportFile } from "../../services/hospitalApi";

const REPORT_TYPES = [
  { value: "xray",       label: "X-Ray" },
  { value: "blood_test", label: "Blood Test" },
  { value: "mri",        label: "MRI / CT Scan" },
  { value: "ecg",        label: "ECG" },
  { value: "ultrasound", label: "Ultrasound" },
  { value: "other",      label: "Other" },
];

const TYPE_COLORS = {
  xray:       "#58a6ff",
  blood_test: "#f85149",
  mri:        "#a371f7",
  ecg:        "#f0883e",
  ultrasound: "#3fb950",
  other:      "#8b949e",
};

export default function LabDashboard({ user }) {
  const [patients, setPatients] = useState([]);
  const [selected, setSelected] = useState(null);
  const [reports, setReports] = useState([]);
  const [loadingPatients, setLoadingPatients] = useState(true);
  const [loadingReports, setLoadingReports] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Upload form state
  const [reportType, setReportType] = useState("blood_test");
  const [reportTitle, setReportTitle] = useState("");
  const [reportNotes, setReportNotes] = useState("");
  const [fileInfo, setFileInfo] = useState(null);  // { name, data (base64), mime }
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);  // AI analysis from upload

  // Report viewer
  const [viewingReport, setViewingReport] = useState(null);
  const [viewFile, setViewFile] = useState(null);
  const [loadingFile, setLoadingFile] = useState(false);

  const fileRef = useRef();

  useEffect(() => {
    listPatients()
      .then(setPatients)
      .catch(() => setError("Failed to load patients."))
      .finally(() => setLoadingPatients(false));
  }, []);

  const handleSelectPatient = async (p) => {
    setSelected(p);
    setShowUpload(false);
    setUploadResult(null);
    setViewingReport(null);
    setViewFile(null);
    setLoadingReports(true);
    try {
      const data = await getPatientLabReports(p._id);
      setReports(data);
    } catch {
      setReports([]);
    } finally {
      setLoadingReports(false);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target.result;
      // Extract base64 from data URL
      const base64 = dataUrl.split(",")[1];
      setFileInfo({ name: file.name, data: base64, mime: file.type });
    };
    reader.readAsDataURL(file);
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!fileInfo) { setError("Please select a file."); return; }
    if (!reportTitle.trim()) { setError("Report title is required."); return; }
    setUploading(true); setError(""); setUploadResult(null);
    try {
      const result = await uploadLabReport({
        patient_id: selected._id,
        report_type: reportType,
        report_title: reportTitle.trim(),
        notes: reportNotes.trim(),
        file_data: fileInfo.data,
        file_name: fileInfo.name,
        mime_type: fileInfo.mime,
      });
      setSuccess("Report uploaded successfully.");
      setTimeout(() => setSuccess(""), 4000);
      setUploadResult(result.ai_analysis);
      setReportTitle(""); setReportNotes(""); setFileInfo(null);
      if (fileRef.current) fileRef.current.value = "";
      // Refresh reports list
      const updated = await getPatientLabReports(selected._id);
      setReports(updated);
    } catch (err) {
      setError(err.response?.data?.detail || "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  const handleViewReport = async (rep) => {
    setViewingReport(rep);
    setViewFile(null);
    setLoadingFile(true);
    try {
      const f = await getLabReportFile(rep._id);
      setViewFile(f);
    } catch {
      setViewFile(null);
    } finally {
      setLoadingFile(false);
    }
  };

  const filtered = patients.filter(p =>
    p.name?.toLowerCase().includes(search.toLowerCase()) ||
    p.patient_id?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="hosp-dashboard">
      <h2 className="hosp-dashboard-title">Lab Reports</h2>

      {error && <div className="hosp-banner hosp-banner-error">⚠ {error}</div>}
      {success && <div className="hosp-banner hosp-banner-success">✓ {success}</div>}

      <div className="hosp-two-panel">
        {/* Left: patient list */}
        <div className="hosp-panel-left">
          <div className="hosp-panel-header" style={{ flexDirection: "column", gap: 6, alignItems: "stretch" }}>
            <span>Patients ({patients.length})</span>
            <input
              style={{ background: "var(--bg-primary)", border: "1px solid var(--border-color)", borderRadius: 6, padding: "4px 8px", color: "var(--text-primary)", fontSize: "0.76rem", fontFamily: "var(--font)", outline: "none" }}
              placeholder="Search…"
              value={search} onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="hosp-panel-list">
            {loadingPatients ? (
              <p style={{ padding: 12, color: "var(--text-muted)", fontSize: "0.80rem" }}>Loading…</p>
            ) : filtered.map(p => (
              <div
                key={p._id}
                className={`hosp-list-row ${selected?._id === p._id ? "active" : ""}`}
                onClick={() => handleSelectPatient(p)}
              >
                <span className="hosp-list-row-title">{p.name}</span>
                <span className="hosp-list-row-sub">{p.patient_id} · {p.age}y</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right: reports + upload */}
        <div className="hosp-panel-right">
          {!selected ? (
            <div className="hosp-empty">
              <div className="hosp-empty-icon">🔬</div>
              Select a patient to view or upload lab reports.
            </div>
          ) : (
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                <div>
                  <h3 style={{ fontSize: "1rem", fontWeight: 700, margin: 0 }}>{selected.name}</h3>
                  <p style={{ fontSize: "0.74rem", color: "var(--text-muted)", margin: "2px 0 0" }}>{selected.patient_id} · {selected.age}y · {selected.sex}</p>
                </div>
                <button
                  className="hosp-btn hosp-btn-primary hosp-btn-sm"
                  onClick={() => { setShowUpload(u => !u); setUploadResult(null); setError(""); }}
                >
                  {showUpload ? "Cancel" : "+ Upload Report"}
                </button>
              </div>

              {/* Upload form */}
              {showUpload && (
                <form className="hosp-inline-form" onSubmit={handleUpload}>
                  <p className="hosp-inline-form-title">New Lab Report — {selected.name}</p>
                  <div className="hosp-form-grid">
                    <div className="hosp-field">
                      <label>Report Type</label>
                      <select value={reportType} onChange={e => setReportType(e.target.value)}>
                        {REPORT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </div>
                    <div className="hosp-field">
                      <label>Title *</label>
                      <input value={reportTitle} onChange={e => setReportTitle(e.target.value)} placeholder="e.g. Chest X-Ray (PA view)" />
                    </div>
                    <div className="hosp-field" style={{ gridColumn: "1 / -1" }}>
                      <label>Notes</label>
                      <textarea rows={2} value={reportNotes} onChange={e => setReportNotes(e.target.value)} placeholder="Any additional clinical context…" />
                    </div>
                    <div className="hosp-field" style={{ gridColumn: "1 / -1" }}>
                      <label>File * <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>(image/PDF/text, max 3 MB)</span></label>
                      <input type="file" ref={fileRef} accept="image/*,.pdf,.txt" onChange={handleFileChange}
                        style={{ background: "var(--bg-primary)", border: "1px solid var(--border-color)", borderRadius: 6, padding: "6px 8px", color: "var(--text-primary)", fontSize: "0.78rem", fontFamily: "var(--font)" }} />
                      {fileInfo && <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>Selected: {fileInfo.name}</span>}
                    </div>
                  </div>
                  <div className="hosp-form-actions">
                    <button type="submit" className="hosp-btn hosp-btn-primary" disabled={uploading}>
                      {uploading ? "Uploading & Analysing…" : "Upload Report"}
                    </button>
                  </div>
                  {uploadResult && (
                    <div className="hosp-ai-panel" style={{ marginTop: 12 }}>
                      <p className="hosp-ai-panel-title">🤖 AI Analysis</p>
                      <p className="hosp-ai-panel-body">{uploadResult}</p>
                    </div>
                  )}
                </form>
              )}

              {/* Reports list */}
              <p className="hosp-section-heading">Reports ({reports.length})</p>
              {loadingReports ? (
                <p style={{ color: "var(--text-muted)", fontSize: "0.82rem" }}>Loading…</p>
              ) : reports.length === 0 ? (
                <div className="hosp-empty" style={{ padding: "20px 0" }}>
                  <div className="hosp-empty-icon">📂</div>
                  No lab reports uploaded yet.
                </div>
              ) : reports.map(rep => (
                <div key={rep._id} className="hosp-record-card" style={{ marginBottom: 10 }}>
                  <div className="hosp-record-header" style={{ cursor: "pointer" }} onClick={() => setViewingReport(viewingReport?._id === rep._id ? null : rep)}>
                    <div className="hosp-record-header-left" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: TYPE_COLORS[rep.report_type] || "#8b949e", display: "inline-block", flexShrink: 0 }} />
                      {rep.report_title}
                    </div>
                    <div className="hosp-record-header-right">
                      {rep.uploaded_at ? new Date(rep.uploaded_at).toLocaleDateString() : ""} · {rep.uploaded_by_name}
                      {viewingReport?._id === rep._id ? " ▲" : " ▼"}
                    </div>
                  </div>
                  {viewingReport?._id === rep._id && (
                    <div className="hosp-record-body">
                      {rep.notes && <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)", margin: 0 }}>{rep.notes}</p>}
                      {rep.ai_analysis && (
                        <div className="hosp-ai-panel">
                          <p className="hosp-ai-panel-title">🤖 AI Analysis</p>
                          <p className="hosp-ai-panel-body">{rep.ai_analysis}</p>
                        </div>
                      )}
                      <div>
                        <button
                          className="hosp-btn hosp-btn-sm"
                          onClick={() => handleViewReport(rep)}
                          disabled={loadingFile}
                          style={{ fontSize: "0.76rem" }}
                        >
                          {loadingFile && viewingReport?._id === rep._id ? "Loading…" : "View File"}
                        </button>
                        {viewFile && viewingReport?._id === rep._id && (
                          <div className="hosp-lab-file-view" style={{ marginTop: 10 }}>
                            {viewFile.mime_type?.startsWith("image/") ? (
                              <img
                                src={`data:${viewFile.mime_type};base64,${viewFile.file_data}`}
                                alt={viewFile.file_name}
                                style={{ maxWidth: "100%", maxHeight: 400, borderRadius: 6, border: "1px solid var(--border-color)" }}
                              />
                            ) : (
                              <pre style={{ background: "var(--bg-primary)", border: "1px solid var(--border-color)", borderRadius: 6, padding: 12, fontSize: "0.74rem", color: "var(--text-secondary)", overflowX: "auto", whiteSpace: "pre-wrap", maxHeight: 300 }}>
                                {atob(viewFile.file_data)}
                              </pre>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
