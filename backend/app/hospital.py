from fastapi import APIRouter, HTTPException, Request, status, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime, timezone
from bson import ObjectId
from bson.errors import InvalidId
from slowapi import Limiter
from slowapi.util import get_remote_address
from app.database import db_service
from app.auth import hash_password, verify_password, create_access_token
from app.llm import llm_service
from jose import jwt, JWTError
import logging
import os
import base64

logger = logging.getLogger(__name__)
limiter = Limiter(key_func=get_remote_address)
hospital_router = APIRouter(prefix="/api/hospital", tags=["hospital"])
security = HTTPBearer()

SECRET_KEY = os.getenv("JWT_SECRET")
ALGORITHM = "HS256"

VALID_ROLES = {"admin", "nurse", "doctor", "pharmacist", "lab"}

# ──────────────────────────────────────────────
# PYDANTIC MODELS
# ──────────────────────────────────────────────

class HospitalLoginRequest(BaseModel):
    username: str
    password: str

class HospitalAuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict

class CreateHospitalUserRequest(BaseModel):
    username: str = Field(min_length=3, max_length=50)
    password: str = Field(min_length=6)
    name: str = Field(min_length=2, max_length=100)
    role: str
    specialization: Optional[str] = None

    def validate_role(self):
        if self.role not in VALID_ROLES:
            raise ValueError(f"role must be one of {VALID_ROLES}")

class CreatePatientRequest(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    age: int = Field(ge=0, le=150)
    sex: str
    phone: Optional[str] = None
    blood_type: Optional[str] = None
    known_conditions: List[str] = []
    allergies: List[str] = []
    current_medications: List[str] = []

class BodyAnnotation(BaseModel):
    region_label: str
    region_pos: List[float]
    region_category: str
    description: str

class PrescriptionItem(BaseModel):
    medicine: str
    dosage: str
    duration: str

class CreateMedicalRecordRequest(BaseModel):
    patient_id: str
    next_visit_date: Optional[str] = None  # ISO date string "YYYY-MM-DD"
    body_annotations: List[BodyAnnotation] = []
    diagnosis: str = Field(min_length=1)
    notes: Optional[str] = None
    prescriptions: List[PrescriptionItem] = []

class DiagnosisAssistRequest(BaseModel):
    age: int = 0
    sex: str = ""
    known_conditions: List[str] = []
    allergies: List[str] = []
    current_medications: List[str] = []
    annotations: List[dict] = []   # [{region_label, description}]
    notes: str = ""

class RiskAssessmentRequest(BaseModel):
    age: int
    sex: str
    blood_type: str = ""
    known_conditions: List[str] = []
    allergies: List[str] = []
    current_medications: List[str] = []
    recent_diagnoses: List[str] = []

class DrugInteractionRequest(BaseModel):
    medicines: List[str]

class LabReportUploadRequest(BaseModel):
    patient_id: str
    report_type: str          # xray, blood_test, mri, ecg, other
    report_title: str = Field(min_length=2)
    notes: str = ""
    file_data: str            # base64 encoded file
    file_name: str
    mime_type: str            # image/jpeg, image/png, text/plain, application/pdf


# ──────────────────────────────────────────────
# AUTH HELPERS
# ──────────────────────────────────────────────

def _decode_hospital_token(token: str) -> dict:
    if not SECRET_KEY:
        raise HTTPException(status_code=500, detail="Server misconfiguration: JWT_SECRET not set")
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("type") != "hospital":
            raise HTTPException(status_code=401, detail="Not a hospital token")
        user_id = payload.get("sub")
        role = payload.get("role")
        name = payload.get("name", "")
        if not user_id or not role:
            raise HTTPException(status_code=401, detail="Invalid token payload")
        return {"id": user_id, "role": role, "name": name}
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired hospital token")


async def get_hospital_user(
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> dict:
    return _decode_hospital_token(credentials.credentials)


def role_required(*roles):
    async def check(current: dict = Depends(get_hospital_user)) -> dict:
        if current["role"] not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Required role(s): {', '.join(roles)}"
            )
        return current
    return check


def _serialize(doc: dict) -> dict:
    """Convert MongoDB ObjectIds and datetimes to JSON-safe types."""
    result = {}
    for k, v in doc.items():
        if isinstance(v, ObjectId):
            result[k] = str(v)
        elif isinstance(v, datetime):
            result[k] = v.isoformat()
        elif isinstance(v, list):
            result[k] = [
                _serialize(i) if isinstance(i, dict) else (str(i) if isinstance(i, ObjectId) else i)
                for i in v
            ]
        elif isinstance(v, dict):
            result[k] = _serialize(v)
        else:
            result[k] = v
    return result


# ──────────────────────────────────────────────
# AUTH ENDPOINT
# ──────────────────────────────────────────────

@hospital_router.post("/auth/login", response_model=HospitalAuthResponse)
@limiter.limit("10/minute")
async def hospital_login(request: Request, body: HospitalLoginRequest):
    """Hospital staff login with username + password."""
    try:
        col = db_service.get_collection("hospital_users")
        user = await col.find_one({"username": body.username.strip().lower()})
        if not user or not verify_password(body.password, user["password"]):
            raise HTTPException(status_code=401, detail="Invalid username or password")

        user_id = str(user["_id"])
        token = create_access_token({
            "sub": user_id,
            "type": "hospital",
            "role": user["role"],
            "name": user["name"],
        })
        return HospitalAuthResponse(
            access_token=token,
            user={
                "id": user_id,
                "username": user["username"],
                "name": user["name"],
                "role": user["role"],
                "specialization": user.get("specialization"),
            }
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Hospital login error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Login failed")


# ──────────────────────────────────────────────
# ADMIN — USER MANAGEMENT
# ──────────────────────────────────────────────

@hospital_router.get("/users")
@limiter.limit("30/minute")
async def list_hospital_users(
    request: Request,
    current: dict = Depends(role_required("admin"))
):
    """List all hospital staff accounts."""
    col = db_service.get_collection("hospital_users")
    cursor = col.find({}, {"password": 0}).sort("created_at", -1)
    users = await cursor.to_list(length=200)
    return [_serialize(u) for u in users]


@hospital_router.post("/users", status_code=201)
@limiter.limit("20/minute")
async def create_hospital_user(
    request: Request,
    body: CreateHospitalUserRequest,
    current: dict = Depends(role_required("admin"))
):
    """Create a new hospital staff account (admin only)."""
    if body.role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail=f"Invalid role. Must be one of: {', '.join(VALID_ROLES)}")

    col = db_service.get_collection("hospital_users")
    username = body.username.strip().lower()
    if await col.find_one({"username": username}):
        raise HTTPException(status_code=400, detail="Username already taken")

    doc = {
        "username": username,
        "password": hash_password(body.password),
        "name": body.name.strip(),
        "role": body.role,
        "specialization": body.specialization,
        "created_at": datetime.now(timezone.utc),
        "created_by": current["id"],
    }
    result = await col.insert_one(doc)
    return {"id": str(result.inserted_id), "message": "User created successfully"}


@hospital_router.delete("/users/{user_id}", status_code=200)
@limiter.limit("20/minute")
async def delete_hospital_user(
    user_id: str,
    request: Request,
    current: dict = Depends(role_required("admin"))
):
    """Delete a hospital staff account (admin only, cannot delete self)."""
    if user_id == current["id"]:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    try:
        oid = ObjectId(user_id)
    except InvalidId:
        raise HTTPException(status_code=400, detail="Invalid user ID")

    col = db_service.get_collection("hospital_users")
    result = await col.delete_one({"_id": oid})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "User deleted"}


# ──────────────────────────────────────────────
# PATIENTS
# ──────────────────────────────────────────────

@hospital_router.get("/patients")
@limiter.limit("60/minute")
async def list_patients(
    request: Request,
    current: dict = Depends(get_hospital_user)
):
    """List all patients (all hospital roles)."""
    col = db_service.get_collection("patients")
    cursor = col.find({}).sort("created_at", -1)
    patients = await cursor.to_list(length=500)
    return [_serialize(p) for p in patients]


@hospital_router.post("/patients", status_code=201)
@limiter.limit("30/minute")
async def create_patient(
    request: Request,
    body: CreatePatientRequest,
    current: dict = Depends(role_required("nurse"))
):
    """Create a new patient record (nurse only)."""
    col = db_service.get_collection("patients")
    count = await col.count_documents({})
    patient_id = f"P{(count + 1):03d}"

    doc = {
        "patient_id": patient_id,
        "name": body.name.strip(),
        "age": body.age,
        "sex": body.sex,
        "phone": body.phone or "",
        "blood_type": body.blood_type or "",
        "known_conditions": body.known_conditions,
        "allergies": body.allergies,
        "current_medications": body.current_medications,
        "created_at": datetime.now(timezone.utc),
        "created_by": current["id"],
    }
    result = await col.insert_one(doc)
    return {"id": str(result.inserted_id), "patient_id": patient_id, "message": "Patient created"}


@hospital_router.get("/patients/{patient_id_str}")
@limiter.limit("60/minute")
async def get_patient(
    patient_id_str: str,
    request: Request,
    current: dict = Depends(get_hospital_user)
):
    """Get patient details + full visit history (all hospital roles)."""
    col = db_service.get_collection("patients")
    # Try by ObjectId first, then by patient_id string
    patient = None
    try:
        patient = await col.find_one({"_id": ObjectId(patient_id_str)})
    except InvalidId:
        pass
    if not patient:
        patient = await col.find_one({"patient_id": patient_id_str.upper()})
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    records_col = db_service.get_collection("medical_records")
    cursor = records_col.find({"patient_id": str(patient["_id"])}).sort("visit_date", -1)
    records = await cursor.to_list(length=200)

    return {
        "patient": _serialize(patient),
        "records": [_serialize(r) for r in records],
    }


# ──────────────────────────────────────────────
# MEDICAL RECORDS (DOCTOR)
# ──────────────────────────────────────────────

@hospital_router.post("/records", status_code=201)
@limiter.limit("30/minute")
async def create_medical_record(
    request: Request,
    body: CreateMedicalRecordRequest,
    current: dict = Depends(role_required("doctor"))
):
    """Create a visit medical record for a patient (doctor only)."""
    # Validate patient exists
    patients_col = db_service.get_collection("patients")
    try:
        patient = await patients_col.find_one({"_id": ObjectId(body.patient_id)})
    except InvalidId:
        raise HTTPException(status_code=400, detail="Invalid patient ID")
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    next_visit = None
    if body.next_visit_date:
        try:
            next_visit = datetime.fromisoformat(body.next_visit_date)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid next_visit_date format (use YYYY-MM-DD)")

    doc = {
        "patient_id": body.patient_id,
        "patient_name": patient["name"],
        "doctor_id": current["id"],
        "doctor_name": current["name"],
        "visit_date": datetime.now(timezone.utc),
        "next_visit_date": next_visit,
        "body_annotations": [a.model_dump() for a in body.body_annotations],
        "diagnosis": body.diagnosis.strip(),
        "notes": (body.notes or "").strip(),
        "prescriptions": [
            {**p.model_dump(), "dispensed": False, "dispensed_at": None, "dispensed_by_name": None}
            for p in body.prescriptions
        ],
        "created_at": datetime.now(timezone.utc),
    }
    records_col = db_service.get_collection("medical_records")
    result = await records_col.insert_one(doc)
    return {"id": str(result.inserted_id), "message": "Medical record created"}


@hospital_router.get("/schedule")
@limiter.limit("60/minute")
async def get_doctor_schedule(
    request: Request,
    current: dict = Depends(role_required("doctor"))
):
    """Get this doctor's upcoming patient visits (doctor only)."""
    records_col = db_service.get_collection("medical_records")
    now = datetime.now(timezone.utc)
    cursor = records_col.find(
        {"doctor_id": current["id"], "next_visit_date": {"$ne": None, "$gte": now}}
    ).sort("next_visit_date", 1)
    records = await cursor.to_list(length=200)
    return [_serialize(r) for r in records]


# ──────────────────────────────────────────────
# PHARMACY
# ──────────────────────────────────────────────

@hospital_router.get("/doctors")
@limiter.limit("30/minute")
async def list_doctors(
    request: Request,
    current: dict = Depends(get_hospital_user)
):
    """List all doctors (for pharmacist doctor-selector)."""
    col = db_service.get_collection("hospital_users")
    cursor = col.find({"role": "doctor"}, {"password": 0}).sort("name", 1)
    doctors = await cursor.to_list(length=100)
    return [_serialize(d) for d in doctors]


@hospital_router.get("/prescriptions/doctor/{doctor_id}")
@limiter.limit("30/minute")
async def get_prescriptions_by_doctor(
    doctor_id: str,
    request: Request,
    current: dict = Depends(role_required("pharmacist"))
):
    """Get all medical records for a doctor, grouped by patient (pharmacist only)."""
    records_col = db_service.get_collection("medical_records")
    cursor = records_col.find(
        {"doctor_id": doctor_id, "prescriptions.0": {"$exists": True}}
    ).sort("visit_date", -1)
    records = await cursor.to_list(length=500)
    serialized = [_serialize(r) for r in records]

    # Group by patient
    by_patient: dict = {}
    for rec in serialized:
        pid = rec.get("patient_id", "")
        pname = rec.get("patient_name", "Unknown")
        if pid not in by_patient:
            by_patient[pid] = {"patient_id": pid, "patient_name": pname, "records": []}
        by_patient[pid]["records"].append(rec)

    return list(by_patient.values())


@hospital_router.patch("/prescriptions/{record_id}/{med_index}/dispense")
@limiter.limit("30/minute")
async def dispense_medicine(
    record_id: str,
    med_index: int,
    request: Request,
    current: dict = Depends(role_required("pharmacist"))
):
    """Mark a prescription item as dispensed (pharmacist only)."""
    try:
        oid = ObjectId(record_id)
    except InvalidId:
        raise HTTPException(status_code=400, detail="Invalid record ID")

    records_col = db_service.get_collection("medical_records")
    record = await records_col.find_one({"_id": oid})
    if not record:
        raise HTTPException(status_code=404, detail="Medical record not found")

    prescriptions = record.get("prescriptions", [])
    if med_index < 0 or med_index >= len(prescriptions):
        raise HTTPException(status_code=400, detail="Invalid prescription index")

    field = f"prescriptions.{med_index}"
    await records_col.update_one(
        {"_id": oid},
        {"$set": {
            f"{field}.dispensed": True,
            f"{field}.dispensed_at": datetime.now(timezone.utc).isoformat(),
            f"{field}.dispensed_by_name": current["name"],
        }}
    )
    return {"message": "Medicine marked as dispensed"}


# ──────────────────────────────────────────────
# AI ENDPOINTS
# ──────────────────────────────────────────────

@hospital_router.post("/ai/diagnosis-assist")
@limiter.limit("10/minute")
async def ai_diagnosis_assist(
    request: Request,
    body: DiagnosisAssistRequest,
    current: dict = Depends(role_required("doctor"))
):
    """AI differential diagnosis suggestions for a doctor (doctor only)."""
    annotation_text = "\n".join(
        f"  - {a.get('region_label','?')}: {a.get('description','')}"
        for a in body.annotations if a.get("description")
    ) or "  None recorded"

    prompt = f"""You are a clinical decision support AI assistant helping a doctor.

Patient: {body.age}y {body.sex}, Blood group info not provided.
Known conditions: {', '.join(body.known_conditions) or 'None'}
Allergies: {', '.join(body.allergies) or 'None'}
Current medications: {', '.join(body.current_medications) or 'None'}

Body region findings from 3D model:
{annotation_text}

Doctor's preliminary notes: {body.notes or 'None'}

Based on the above, provide:
1. Top 3-5 differential diagnoses (most likely first)
2. Key investigations to order
3. Red flags to watch for
4. Any drug allergy alerts for common treatments

Be concise, clinical, and evidence-based. Format with clear headings."""

    try:
        response = await llm_service._chat_completion(
            model=llm_service.model,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=600,
            temperature=0.3,
        )
        result = response.choices[0].message.content
        return {"suggestion": result}
    except Exception as e:
        logger.error(f"AI diagnosis assist error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="AI service unavailable. Please try again.")


@hospital_router.post("/ai/risk-assessment")
@limiter.limit("10/minute")
async def ai_risk_assessment(
    request: Request,
    body: RiskAssessmentRequest,
    current: dict = Depends(role_required("nurse", "doctor"))
):
    """AI patient risk assessment (nurse and doctor)."""
    prompt = f"""You are a clinical risk assessment AI assistant for hospital nursing staff.

Patient Profile:
- Age: {body.age}, Sex: {body.sex}, Blood type: {body.blood_type or 'Unknown'}
- Known conditions: {', '.join(body.known_conditions) or 'None'}
- Allergies: {', '.join(body.allergies) or 'None'}
- Current medications: {', '.join(body.current_medications) or 'None'}
- Recent diagnoses: {', '.join(body.recent_diagnoses) or 'None'}

Provide a structured risk assessment:
1. Overall Risk Level: [LOW / MEDIUM / HIGH / CRITICAL]
2. Primary risk factors
3. Monitoring priorities (vital signs, lab values)
4. Nursing care alerts and precautions
5. Recommended escalation triggers

Be concise and practical for bedside nursing use."""

    try:
        response = await llm_service._chat_completion(
            model=llm_service.model,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=500,
            temperature=0.3,
        )
        result = response.choices[0].message.content
        return {"assessment": result}
    except Exception as e:
        logger.error(f"AI risk assessment error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="AI service unavailable. Please try again.")


@hospital_router.post("/ai/drug-interactions")
@limiter.limit("10/minute")
async def ai_drug_interactions(
    request: Request,
    body: DrugInteractionRequest,
    current: dict = Depends(role_required("pharmacist"))
):
    """AI drug interaction checker (pharmacist only)."""
    if not body.medicines:
        raise HTTPException(status_code=400, detail="No medicines provided")
    med_list = "\n".join(f"  - {m}" for m in body.medicines)
    prompt = f"""You are a clinical pharmacist AI assistant.

Review the following prescribed medicines for potential drug interactions, contraindications, and safety concerns:
{med_list}

Provide:
1. Drug-drug interactions (severity: minor/moderate/major)
2. Common contraindications to check
3. Counselling points for the patient
4. Any dosage or timing recommendations

If no significant interactions exist, clearly state that. Be concise and pharmacy-focused."""

    try:
        response = await llm_service._chat_completion(
            model=llm_service.model,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=500,
            temperature=0.2,
        )
        result = response.choices[0].message.content
        return {"analysis": result}
    except Exception as e:
        logger.error(f"AI drug interaction error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="AI service unavailable. Please try again.")


@hospital_router.get("/ai/activity-summary")
@limiter.limit("5/minute")
async def ai_activity_summary(
    request: Request,
    current: dict = Depends(role_required("admin"))
):
    """AI-generated hospital activity summary (admin only)."""
    try:
        # Gather quick stats
        users_col = db_service.get_collection("hospital_users")
        patients_col = db_service.get_collection("patients")
        records_col = db_service.get_collection("medical_records")

        total_staff = await users_col.count_documents({})
        total_patients = await patients_col.count_documents({})
        total_visits = await records_col.count_documents({})

        # Pending prescriptions
        pipeline = [
            {"$unwind": "$prescriptions"},
            {"$match": {"prescriptions.dispensed": False}},
            {"$count": "pending"},
        ]
        pending_result = await records_col.aggregate(pipeline).to_list(1)
        pending_rx = pending_result[0]["pending"] if pending_result else 0

        # Visits in last 7 days
        from datetime import timedelta
        week_ago = datetime.now(timezone.utc) - timedelta(days=7)
        recent_visits = await records_col.count_documents({"visit_date": {"$gte": week_ago}})

        prompt = f"""You are a hospital management AI assistant. Generate a brief executive summary.

Hospital Statistics:
- Total staff accounts: {total_staff}
- Registered patients: {total_patients}
- Total visit records: {total_visits}
- Visits in last 7 days: {recent_visits}
- Pending prescription dispensals: {pending_rx}

Write a 3-4 sentence management summary highlighting key activity, any operational flags (e.g., high pending prescriptions), and one actionable recommendation. Keep it professional and concise."""

        response = await llm_service._chat_completion(
            model=llm_service.model,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=300,
            temperature=0.4,
        )
        summary = response.choices[0].message.content
        return {
            "summary": summary,
            "stats": {
                "total_staff": total_staff,
                "total_patients": total_patients,
                "total_visits": total_visits,
                "recent_visits_7d": recent_visits,
                "pending_prescriptions": pending_rx,
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"AI activity summary error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="AI service unavailable. Please try again.")


# ──────────────────────────────────────────────
# LAB REPORTS
# ──────────────────────────────────────────────

ALLOWED_MIME_TYPES = {
    "image/jpeg", "image/png", "image/webp", "image/gif",
    "text/plain", "application/pdf",
}
MAX_FILE_BYTES = 3 * 1024 * 1024  # 3 MB base64 limit


@hospital_router.post("/lab-reports", status_code=201)
@limiter.limit("10/minute")
async def upload_lab_report(
    request: Request,
    body: LabReportUploadRequest,
    current: dict = Depends(role_required("lab"))
):
    """Upload a lab report (X-ray, blood test, MRI, etc.) linked to a patient."""
    # Validate patient
    patients_col = db_service.get_collection("patients")
    try:
        patient = await patients_col.find_one({"_id": ObjectId(body.patient_id)})
    except InvalidId:
        raise HTTPException(status_code=400, detail="Invalid patient ID")
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    if body.mime_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {body.mime_type}")

    # Validate base64 size
    try:
        raw_bytes = base64.b64decode(body.file_data)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid base64 file data")
    if len(raw_bytes) > MAX_FILE_BYTES:
        raise HTTPException(status_code=413, detail="File too large (max 3 MB)")

    # AI analysis
    ai_analysis = None
    try:
        is_image = body.mime_type.startswith("image/")
        if is_image:
            ai_analysis = await llm_service.describe_image(
                body.file_data, body.mime_type,
                f"This is a medical {body.report_type.replace('_', ' ')} image. "
                f"Provide a structured clinical interpretation: "
                f"1) Key findings, 2) Impressions, 3) Recommendations. "
                f"Be concise and professional. Title: {body.report_title}"
            )
        else:
            # Text/PDF: decode and analyse
            text_content = raw_bytes.decode("utf-8", errors="replace")[:3000]
            prompt = (
                f"You are a medical AI analyst. Analyse this lab report and provide a structured summary:\n\n"
                f"Report type: {body.report_type}\nTitle: {body.report_title}\n\n"
                f"Report content:\n{text_content}\n\n"
                f"Provide: 1) Key findings, 2) Abnormal values (if any), 3) Clinical significance, "
                f"4) Recommended follow-up. Be concise."
            )
            response = await llm_service._chat_completion(
                model=llm_service.model,
                messages=[{"role": "user", "content": prompt}],
                max_tokens=400,
                temperature=0.2,
            )
            ai_analysis = response.choices[0].message.content
    except Exception as e:
        logger.warning(f"Lab AI analysis failed (non-fatal): {e}")
        ai_analysis = None

    doc = {
        "patient_id": body.patient_id,
        "patient_name": patient["name"],
        "report_type": body.report_type,
        "report_title": body.report_title.strip(),
        "notes": body.notes.strip(),
        "file_name": body.file_name,
        "mime_type": body.mime_type,
        "file_data": body.file_data,   # stored as base64
        "ai_analysis": ai_analysis,
        "uploaded_by_id": current["id"],
        "uploaded_by_name": current["name"],
        "uploaded_at": datetime.now(timezone.utc),
    }
    reports_col = db_service.get_collection("lab_reports")
    result = await reports_col.insert_one(doc)
    return {
        "id": str(result.inserted_id),
        "ai_analysis": ai_analysis,
        "message": "Lab report uploaded successfully",
    }


@hospital_router.get("/lab-reports/patient/{patient_id_str}")
@limiter.limit("30/minute")
async def get_patient_lab_reports(
    patient_id_str: str,
    request: Request,
    current: dict = Depends(role_required("nurse", "doctor", "lab"))
):
    """Get all lab reports for a patient (nurse, doctor, lab)."""
    reports_col = db_service.get_collection("lab_reports")
    cursor = reports_col.find(
        {"patient_id": patient_id_str},
        {"file_data": 0}  # exclude raw bytes from list view
    ).sort("uploaded_at", -1)
    reports = await cursor.to_list(length=100)
    return [_serialize(r) for r in reports]


@hospital_router.get("/lab-reports/{report_id}/file")
@limiter.limit("20/minute")
async def get_lab_report_file(
    report_id: str,
    request: Request,
    current: dict = Depends(role_required("nurse", "doctor", "lab"))
):
    """Get the base64 file data for a specific lab report."""
    try:
        oid = ObjectId(report_id)
    except InvalidId:
        raise HTTPException(status_code=400, detail="Invalid report ID")
    reports_col = db_service.get_collection("lab_reports")
    report = await reports_col.find_one({"_id": oid})
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    return {
        "file_data": report.get("file_data", ""),
        "mime_type": report.get("mime_type", ""),
        "file_name": report.get("file_name", ""),
    }
