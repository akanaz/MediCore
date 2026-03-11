"""
Hospital Portal Seed Script
============================
Populates hospital staff, patients, medical records, and pharmacy data for demo/testing.
Only runs if hospital_users collection is empty (idempotent).

Usage:
    cd backend
    python seed_hospital_admin.py

All staff accounts use password: medicore123
"""

import asyncio
import os
import sys
from datetime import datetime, timezone, timedelta
from bson import ObjectId

sys.path.insert(0, os.path.dirname(__file__))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

from app.database import db_service
from app.auth import hash_password

DEFAULT_PASSWORD = "medicore123"

SEED_USERS = [
    {"username": "admin",        "name": "Hospital Admin",          "role": "admin",       "specialization": None},
    {"username": "dr_sharma",    "name": "Dr. Priya Sharma",        "role": "doctor",      "specialization": "Cardiology"},
    {"username": "dr_patel",     "name": "Dr. Ramesh Patel",        "role": "doctor",      "specialization": "General Medicine"},
    {"username": "dr_khan",      "name": "Dr. Arjun Khan",          "role": "doctor",      "specialization": "Neurology"},
    {"username": "dr_iyer",      "name": "Dr. Sunita Iyer",         "role": "doctor",      "specialization": "Orthopedics"},
    {"username": "dr_reddy",     "name": "Dr. Kiran Reddy",         "role": "doctor",      "specialization": "Pediatrics"},
    {"username": "nurse_priya",  "name": "Nurse Priya Nair",        "role": "nurse",       "specialization": None},
    {"username": "nurse_ravi",   "name": "Nurse Ravi Kumar",        "role": "nurse",       "specialization": None},
    {"username": "nurse_meera",  "name": "Nurse Meera Das",         "role": "nurse",       "specialization": None},
    {"username": "nurse_suresh", "name": "Nurse Suresh Pillai",     "role": "nurse",       "specialization": None},
    {"username": "pharma_raj",   "name": "Raj Verma",               "role": "pharmacist",  "specialization": None},
    {"username": "pharma_anita", "name": "Anita Sharma",            "role": "pharmacist",  "specialization": None},
    {"username": "lab_rohan",    "name": "Rohan Gupta",             "role": "lab",         "specialization": None},
    {"username": "lab_divya",    "name": "Divya Menon",             "role": "lab",         "specialization": None},
]

SEED_PATIENTS = [
    {
        "patient_id": "P001",
        "name": "Rajan Mehta",
        "age": 52, "sex": "male",
        "phone": "+91-9876541001",
        "blood_type": "A+",
        "known_conditions": ["Hypertension", "Type 2 Diabetes"],
        "allergies": ["Sulfa drugs"],
        "current_medications": ["Amlodipine 5mg", "Metformin 500mg"],
    },
    {
        "patient_id": "P002",
        "name": "Ananya Singh",
        "age": 34, "sex": "female",
        "phone": "+91-9876541002",
        "blood_type": "B+",
        "known_conditions": ["Asthma"],
        "allergies": ["Aspirin", "NSAIDs"],
        "current_medications": ["Salbutamol inhaler"],
    },
    {
        "patient_id": "P003",
        "name": "Vikram Nair",
        "age": 67, "sex": "male",
        "phone": "+91-9876541003",
        "blood_type": "O-",
        "known_conditions": ["Coronary Artery Disease", "Hypertension", "Hyperlipidemia"],
        "allergies": ["Penicillin"],
        "current_medications": ["Atorvastatin 40mg", "Aspirin 75mg", "Bisoprolol 5mg"],
    },
    {
        "patient_id": "P004",
        "name": "Priya Desai",
        "age": 28, "sex": "female",
        "phone": "+91-9876541004",
        "blood_type": "AB+",
        "known_conditions": [],
        "allergies": [],
        "current_medications": [],
    },
    {
        "patient_id": "P005",
        "name": "Suresh Patel",
        "age": 45, "sex": "male",
        "phone": "+91-9876541005",
        "blood_type": "B-",
        "known_conditions": ["Type 2 Diabetes", "Obesity"],
        "allergies": [],
        "current_medications": ["Glipizide 5mg", "Empagliflozin 10mg"],
    },
    {
        "patient_id": "P006",
        "name": "Kavitha Rajan",
        "age": 58, "sex": "female",
        "phone": "+91-9876541006",
        "blood_type": "O+",
        "known_conditions": ["Rheumatoid Arthritis", "Hypertension"],
        "allergies": ["Codeine"],
        "current_medications": ["Methotrexate 15mg", "Folic acid 5mg", "Lisinopril 10mg"],
    },
]


def days_ago(n):
    return datetime.now(timezone.utc) - timedelta(days=n)

def days_from_now(n):
    return datetime.now(timezone.utc) + timedelta(days=n)


async def seed():
    print("Connecting to MongoDB...")
    db_service.connect()

    users_col = db_service.get_collection("hospital_users")
    existing = await users_col.count_documents({})
    if existing > 0:
        print(f"hospital_users already has {existing} record(s). Skipping full seed.")
        print("To re-seed, manually drop hospital_users, patients, medical_records, lab_reports collections.")
        return

    hashed_pw = hash_password(DEFAULT_PASSWORD)
    now = datetime.now(timezone.utc)

    # ── 1. Insert staff ──────────────────────────────────────────────
    user_docs = []
    for u in SEED_USERS:
        user_docs.append({
            "_id": ObjectId(),
            "username": u["username"],
            "password": hashed_pw,
            "name": u["name"],
            "role": u["role"],
            "specialization": u["specialization"],
            "created_at": now,
            "created_by": None,
        })
    await users_col.insert_many(user_docs)

    # Build lookup by username
    user_by_name = {u["username"]: u for u in user_docs}
    dr_sharma  = user_by_name["dr_sharma"]
    dr_patel   = user_by_name["dr_patel"]
    dr_khan    = user_by_name["dr_khan"]
    nurse_priya = user_by_name["nurse_priya"]
    pharma_raj = user_by_name["pharma_raj"]

    # ── 2. Insert patients ───────────────────────────────────────────
    patients_col = db_service.get_collection("patients")
    patient_docs = []
    for p in SEED_PATIENTS:
        patient_docs.append({
            "_id": ObjectId(),
            **p,
            "created_at": days_ago(90),
            "created_by": str(nurse_priya["_id"]),
        })
    await patients_col.insert_many(patient_docs)

    p_mehta   = patient_docs[0]
    p_ananya  = patient_docs[1]
    p_vikram  = patient_docs[2]
    p_priya   = patient_docs[3]
    p_suresh  = patient_docs[4]
    p_kavitha = patient_docs[5]

    # ── 3. Insert medical records ────────────────────────────────────
    records_col = db_service.get_collection("medical_records")

    def rx(medicine, dosage, duration, dispensed=False, dispensed_by=None, dispensed_days_ago=None):
        doc = {
            "medicine": medicine, "dosage": dosage, "duration": duration,
            "dispensed": dispensed, "dispensed_at": None, "dispensed_by_name": None,
        }
        if dispensed and dispensed_by:
            doc["dispensed_at"] = days_ago(dispensed_days_ago or 1).isoformat()
            doc["dispensed_by_name"] = dispensed_by
        return doc

    records = [
        # Rajan Mehta — Cardiology follow-up (old visit, fully dispensed)
        {
            "_id": ObjectId(),
            "patient_id": str(p_mehta["_id"]),
            "patient_name": p_mehta["name"],
            "doctor_id": str(dr_sharma["_id"]),
            "doctor_name": dr_sharma["name"],
            "visit_date": days_ago(45),
            "next_visit_date": days_from_now(15),
            "body_annotations": [
                {"region_label": "Chest", "region_pos": [0.0, 0.35, 0.1],
                 "region_category": "torso", "description": "Patient reports tightness on exertion"},
            ],
            "diagnosis": "Hypertensive heart disease with stable angina",
            "notes": "BP 148/92 on visit. ECG shows left ventricular hypertrophy. Increased Amlodipine dose.",
            "prescriptions": [
                rx("Amlodipine 10mg", "Once daily", "30 days", True, pharma_raj["name"], 43),
                rx("Isosorbide mononitrate 30mg", "Once daily", "30 days", True, pharma_raj["name"], 43),
                rx("Atorvastatin 40mg", "Once at night", "30 days", True, pharma_raj["name"], 43),
            ],
            "created_at": days_ago(45),
        },
        # Rajan Mehta — Recent visit (1 pending Rx)
        {
            "_id": ObjectId(),
            "patient_id": str(p_mehta["_id"]),
            "patient_name": p_mehta["name"],
            "doctor_id": str(dr_sharma["_id"]),
            "doctor_name": dr_sharma["name"],
            "visit_date": days_ago(5),
            "next_visit_date": days_from_now(25),
            "body_annotations": [
                {"region_label": "Left ankle", "region_pos": [-0.12, -0.85, 0.05],
                 "region_category": "limb", "description": "Mild pitting oedema grade 1"},
            ],
            "diagnosis": "Hypertension with peripheral oedema — medication side effect",
            "notes": "Oedema likely Amlodipine-related. Switched to Telmisartan. Monitor BP weekly.",
            "prescriptions": [
                rx("Telmisartan 40mg", "Once daily morning", "30 days", True, pharma_raj["name"], 4),
                rx("Furosemide 20mg", "Once daily for 5 days", "5 days"),
            ],
            "created_at": days_ago(5),
        },
        # Ananya Singh — Asthma exacerbation
        {
            "_id": ObjectId(),
            "patient_id": str(p_ananya["_id"]),
            "patient_name": p_ananya["name"],
            "doctor_id": str(dr_patel["_id"]),
            "doctor_name": dr_patel["name"],
            "visit_date": days_ago(20),
            "next_visit_date": days_from_now(10),
            "body_annotations": [
                {"region_label": "Chest", "region_pos": [0.0, 0.35, 0.1],
                 "region_category": "torso", "description": "Bilateral wheeze on auscultation, prolonged expiration"},
                {"region_label": "Throat", "region_pos": [0.0, 0.72, 0.08],
                 "region_category": "head", "description": "Mild pharyngeal erythema"},
            ],
            "diagnosis": "Acute exacerbation of bronchial asthma — moderate",
            "notes": "Triggered by dust exposure at workplace. Peak flow 65% of predicted. SpO2 94% on room air.",
            "prescriptions": [
                rx("Prednisolone 40mg", "Once daily", "5 days", True, pharma_raj["name"], 18),
                rx("Salbutamol nebulisation 2.5mg", "Every 6 hours", "3 days", True, pharma_raj["name"], 18),
                rx("Montelukast 10mg", "Once at night", "30 days"),
            ],
            "created_at": days_ago(20),
        },
        # Vikram Nair — Neurology consult
        {
            "_id": ObjectId(),
            "patient_id": str(p_vikram["_id"]),
            "patient_name": p_vikram["name"],
            "doctor_id": str(dr_khan["_id"]),
            "doctor_name": dr_khan["name"],
            "visit_date": days_ago(12),
            "next_visit_date": days_from_now(18),
            "body_annotations": [
                {"region_label": "Head", "region_pos": [0.0, 0.92, 0.0],
                 "region_category": "head", "description": "Reports recurrent left-sided headaches, throbbing quality"},
                {"region_label": "Left arm", "region_pos": [-0.25, 0.2, 0.0],
                 "region_category": "limb", "description": "Occasional numbness — transient, resolves in minutes"},
            ],
            "diagnosis": "Transient ischaemic attack (TIA) — carotid territory",
            "notes": "MRI brain ordered. Carotid Doppler pending. Patient already on Aspirin for CAD.",
            "prescriptions": [
                rx("Clopidogrel 75mg", "Once daily", "90 days"),
                rx("Atorvastatin 80mg", "Once at night", "90 days"),
            ],
            "created_at": days_ago(12),
        },
        # Priya Desai — General checkup
        {
            "_id": ObjectId(),
            "patient_id": str(p_priya["_id"]),
            "patient_name": p_priya["name"],
            "doctor_id": str(dr_patel["_id"]),
            "doctor_name": dr_patel["name"],
            "visit_date": days_ago(7),
            "next_visit_date": None,
            "body_annotations": [],
            "diagnosis": "Acute viral gastroenteritis — mild",
            "notes": "Nausea, loose stools for 2 days. No fever. Advised ORS and bland diet.",
            "prescriptions": [
                rx("Ondansetron 4mg", "Twice daily for 3 days", "3 days", True, pharma_raj["name"], 6),
                rx("ORS sachets", "After each loose stool", "5 days", True, pharma_raj["name"], 6),
            ],
            "created_at": days_ago(7),
        },
        # Suresh Patel — Diabetes review
        {
            "_id": ObjectId(),
            "patient_id": str(p_suresh["_id"]),
            "patient_name": p_suresh["name"],
            "doctor_id": str(dr_patel["_id"]),
            "doctor_name": dr_patel["name"],
            "visit_date": days_ago(30),
            "next_visit_date": days_from_now(60),
            "body_annotations": [
                {"region_label": "Right foot", "region_pos": [0.1, -0.95, 0.05],
                 "region_category": "limb", "description": "Reduced monofilament sensation plantar surface — early neuropathy screening"},
            ],
            "diagnosis": "Type 2 diabetes mellitus — suboptimal glycaemic control, early peripheral neuropathy",
            "notes": "HbA1c 8.4%. Added Empagliflozin. Referred to dietitian. Foot care education given.",
            "prescriptions": [
                rx("Empagliflozin 10mg", "Once daily morning", "90 days", True, pharma_raj["name"], 28),
                rx("Pregabalin 75mg", "Twice daily", "30 days"),
                rx("Methylcobalamin 500mcg", "Once daily", "30 days"),
            ],
            "created_at": days_ago(30),
        },
        # Kavitha Rajan — Rheumatology follow-up
        {
            "_id": ObjectId(),
            "patient_id": str(p_kavitha["_id"]),
            "patient_name": p_kavitha["name"],
            "doctor_id": str(dr_sharma["_id"]),
            "doctor_name": dr_sharma["name"],
            "visit_date": days_ago(14),
            "next_visit_date": days_from_now(30),
            "body_annotations": [
                {"region_label": "Left wrist", "region_pos": [-0.22, 0.02, 0.05],
                 "region_category": "limb", "description": "Swelling and tenderness, limited ROM"},
                {"region_label": "Right knee", "region_pos": [0.12, -0.55, 0.08],
                 "region_category": "limb", "description": "Effusion present, warm to touch"},
            ],
            "diagnosis": "Rheumatoid arthritis — active disease, moderate DAS28",
            "notes": "ESR 64, CRP 28. DAS28 score 4.9. Increased Methotrexate dose. Added hydroxychloroquine.",
            "prescriptions": [
                rx("Methotrexate 20mg", "Once weekly", "30 days"),
                rx("Hydroxychloroquine 200mg", "Twice daily", "90 days"),
                rx("Folic acid 5mg", "Once daily (except MTX day)", "30 days", True, pharma_raj["name"], 12),
            ],
            "created_at": days_ago(14),
        },
    ]

    await records_col.insert_many(records)

    # ── 4. Summary ───────────────────────────────────────────────────
    print("\n[OK] Hospital seed data inserted successfully!\n")

    print("STAFF ACCOUNTS (all password: medicore123)")
    print("-" * 60)
    print(f"{'Username':<20} {'Role':<15} {'Name'}")
    print("-" * 60)
    for u in SEED_USERS:
        spec = f" ({u['specialization']})" if u["specialization"] else ""
        print(f"{u['username']:<20} {u['role']:<15} {u['name']}{spec}")

    print(f"\nPATIENTS SEEDED: {len(SEED_PATIENTS)}")
    for p in SEED_PATIENTS:
        print(f"  {p['patient_id']}  {p['name']}  ({p['age']}y {p['sex']})")

    print(f"\nMEDICAL RECORDS SEEDED: {len(records)}")
    print("\nDone! Log in with any of the accounts above.\n")


if __name__ == "__main__":
    asyncio.run(seed())
