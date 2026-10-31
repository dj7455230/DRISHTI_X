"""
DRISHTI-X — Report Routes
POST /api/screenings/{id}/report   — generate report
GET  /api/screenings/{id}/report   — retrieve report
GET  /api/reports                  — list all reports
"""
import uuid
import os
from datetime import datetime, timezone
from typing import Annotated, List
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.models.screening import Screening, Report
from app.models.patient import Patient
from app.models.screening import FundusImage, Prediction, DoctorReview
from app.models.audit import AuditLog
from app.api.deps import get_current_user
from app.models.user import User
from app.services.report_service import generate_report

router = APIRouter(prefix="/api", tags=["Reports"])


@router.post("/screenings/{screening_id}/report", status_code=201)
def create_report(
    screening_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    """Generate and store a structured screening report."""
    screening = db.query(Screening).filter(Screening.id == screening_id).first()
    if not screening:
        raise HTTPException(status_code=404, detail="Screening not found.")

    patient    = db.query(Patient).filter(Patient.id == screening.patient_id).first()
    fundus     = db.query(FundusImage).filter(FundusImage.screening_id == screening_id).first()
    prediction = db.query(Prediction).filter(Prediction.screening_id == screening_id).first()
    review     = db.query(DoctorReview).filter(DoctorReview.screening_id == screening_id).first()

    from app.core.config import settings

    report_data = generate_report(
        screening=screening,
        patient=patient,
        fundus_image=fundus,
        prediction=prediction,
        doctor_review=review,
        generated_by_user_id=str(current_user.id),
        output_dir=settings.REPORTS_DIR,
    )

    # Generate PDF
    os.makedirs(settings.REPORTS_DIR, exist_ok=True)
    pdf_path = os.path.join(settings.REPORTS_DIR, f"report_{screening_id}.pdf")
    try:
        from app.services.pdf_report_service import generate_pdf_report
        generate_pdf_report(report_data, pdf_path)
        report_data["pdf_path"] = pdf_path
    except Exception as e:
        report_data["pdf_warning"] = f"PDF generation failed: {str(e)}"

    # Upsert Report record
    report = db.query(Report).filter(Report.screening_id == screening_id).first()
    if not report:
        report = Report(screening_id=screening_id)
        db.add(report)

    report.report_path = report_data.get("report_path",
        os.path.join(settings.REPORTS_DIR, f"report_{screening_id}.json"))
    report.report_format = "JSON"
    report.summary = report_data
    report.generated_by = current_user.id
    report.generated_at = datetime.now(timezone.utc)

    db.add(AuditLog(
        user_id=current_user.id,
        screening_id=screening_id,
        action="REPORT_GENERATED",
        resource_type="report",
        resource_id=str(screening_id),
        user_role=current_user.role.value,
        detail="Structured screening report generated",
    ))
    db.commit()

    return JSONResponse(content=report_data, status_code=201)


@router.get("/screenings/{screening_id}/report")
def get_report(
    screening_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    """Retrieve a previously generated report."""
    report = db.query(Report).filter(Report.screening_id == screening_id).first()
    if not report:
        raise HTTPException(
            status_code=404,
            detail="No report found. Generate one with POST /api/screenings/{id}/report"
        )
    return JSONResponse(content=report.summary or {})


@router.get("/screenings/{screening_id}/report/pdf")
def download_report_pdf(
    screening_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    """Download the PDF report file."""
    from fastapi.responses import FileResponse
    from app.core.config import settings
    pdf_path = os.path.join(settings.REPORTS_DIR, f"report_{screening_id}.pdf")
    if not os.path.exists(pdf_path):
        raise HTTPException(
            status_code=404,
            detail="PDF not found. Generate it first via POST /api/screenings/{id}/report"
        )
    return FileResponse(
        pdf_path,
        media_type="application/pdf",
        filename=f"DRISHTI-X_Report_{str(screening_id)[:8]}.pdf"
    )


@router.get("/reports")
def list_reports(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    skip: int = 0,
    limit: int = 50,
):
    """List all generated reports."""
    reports = db.query(Report).order_by(
        Report.generated_at.desc()
    ).offset(skip).limit(limit).all()

    return [
        {
            "id":           str(r.id),
            "screening_id": str(r.screening_id),
            "format":       r.report_format,
            "generated_at": r.generated_at.isoformat() if r.generated_at else None,
            "disclaimer":   r.disclaimer,
        }
        for r in reports
    ]
