import axios from "axios";

const RAW_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";
const BASE_URL = RAW_BASE.replace(/\/+$/, "");

const hapi = axios.create({
  baseURL: BASE_URL,
  headers: { "Content-Type": "application/json" },
  timeout: 60000,
  withCredentials: false,
});

hapi.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("hospital_token");
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  },
  (error) => Promise.reject(error)
);

hapi.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("hospital_token");
      localStorage.removeItem("hospital_user");
      window.location.reload();
    }
    return Promise.reject(error);
  }
);

// ── Auth ──────────────────────────────────────
export const hospitalLogin = async (username, password) => {
  const res = await hapi.post("/api/hospital/auth/login", { username, password });
  localStorage.setItem("hospital_token", res.data.access_token);
  localStorage.setItem("hospital_user", JSON.stringify(res.data.user));
  return res.data;
};

export const hospitalLogout = () => {
  localStorage.removeItem("hospital_token");
  localStorage.removeItem("hospital_user");
};

// ── Admin ─────────────────────────────────────
export const listHospitalUsers = () => hapi.get("/api/hospital/users").then(r => r.data);

export const createHospitalUser = (data) =>
  hapi.post("/api/hospital/users", data).then(r => r.data);

export const deleteHospitalUser = (userId) =>
  hapi.delete(`/api/hospital/users/${userId}`).then(r => r.data);

// ── Patients ──────────────────────────────────
export const listPatients = () => hapi.get("/api/hospital/patients").then(r => r.data);

export const createPatient = (data) =>
  hapi.post("/api/hospital/patients", data).then(r => r.data);

export const getPatient = (patientId) =>
  hapi.get(`/api/hospital/patients/${patientId}`).then(r => r.data);

// ── Medical Records ───────────────────────────
export const createMedicalRecord = (data) =>
  hapi.post("/api/hospital/records", data).then(r => r.data);

export const getDoctorSchedule = () =>
  hapi.get("/api/hospital/schedule").then(r => r.data);

// ── Pharmacy ──────────────────────────────────
export const listDoctors = () => hapi.get("/api/hospital/doctors").then(r => r.data);

export const getPrescriptionsByDoctor = (doctorId) =>
  hapi.get(`/api/hospital/prescriptions/doctor/${doctorId}`).then(r => r.data);

export const dispenseMedicine = (recordId, medIndex) =>
  hapi.patch(`/api/hospital/prescriptions/${recordId}/${medIndex}/dispense`).then(r => r.data);

// ── AI Features ────────────────────────────────
export const aiDiagnosisAssist = (data) =>
  hapi.post("/api/hospital/ai/diagnosis-assist", data, { timeout: 30000 }).then(r => r.data);

export const aiRiskAssessment = (data) =>
  hapi.post("/api/hospital/ai/risk-assessment", data, { timeout: 30000 }).then(r => r.data);

export const aiDrugInteractions = (medicines) =>
  hapi.post("/api/hospital/ai/drug-interactions", { medicines }, { timeout: 30000 }).then(r => r.data);

export const aiActivitySummary = () =>
  hapi.get("/api/hospital/ai/activity-summary", { timeout: 30000 }).then(r => r.data);

// ── Lab Reports ───────────────────────────────
export const uploadLabReport = (data) =>
  hapi.post("/api/hospital/lab-reports", data, { timeout: 60000 }).then(r => r.data);

export const getPatientLabReports = (patientId) =>
  hapi.get(`/api/hospital/lab-reports/patient/${patientId}`).then(r => r.data);

export const getLabReportFile = (reportId) =>
  hapi.get(`/api/hospital/lab-reports/${reportId}/file`).then(r => r.data);
