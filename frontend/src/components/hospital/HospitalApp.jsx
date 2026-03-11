import React from "react";
import { hospitalLogout } from "../../services/hospitalApi";
import AdminDashboard from "./AdminDashboard";
import NurseDashboard from "./NurseDashboard";
import DoctorDashboard from "./DoctorDashboard";
import PharmacistDashboard from "./PharmacistDashboard";
import LabDashboard from "./LabDashboard";
import "../../styles/Hospital.css";

const ROLE_LABELS = {
  admin: "Admin",
  doctor: "Doctor",
  nurse: "Nurse",
  pharmacist: "Pharmacist",
  lab: "Lab",
};

export default function HospitalApp({ user, onLogout }) {
  const handleLogout = () => {
    hospitalLogout();
    onLogout();
  };

  const renderDashboard = () => {
    switch (user.role) {
      case "admin":       return <AdminDashboard user={user} />;
      case "nurse":       return <NurseDashboard user={user} />;
      case "doctor":      return <DoctorDashboard user={user} />;
      case "pharmacist":  return <PharmacistDashboard user={user} />;
      case "lab":         return <LabDashboard user={user} />;
      default:
        return (
          <div className="hosp-dashboard">
            <p style={{ color: "var(--text-muted)" }}>Unknown role: {user.role}</p>
          </div>
        );
    }
  };

  return (
    <div className="hosp-app">
      <nav className="hosp-nav">
        <span className="hosp-nav-logo">🏥 MEDICORE HOSPITAL</span>
        <div className="hosp-nav-right">
          <span className={`hosp-role-badge hosp-role-${user.role}`}>
            {ROLE_LABELS[user.role] || user.role}
          </span>
          <span className="hosp-nav-user">{user.name}</span>
          <button className="hosp-btn hosp-btn-sm" onClick={handleLogout}>
            Sign out
          </button>
        </div>
      </nav>

      {renderDashboard()}
    </div>
  );
}
