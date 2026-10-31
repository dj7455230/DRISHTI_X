"""
DRISHTI-X — Analysis Job Service
Features 27 & 29 Implementation:
Persistent Analysis Jobs, Idempotency, 11-Stage Pipeline Tracking, and Safe Retries.
"""
import uuid
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List
from sqlalchemy.orm import Session
from app.models.screening import AnalysisJob, JobStatus, Screening, ScreeningStatus


STAGES: List[Dict[str, Any]] = [
    {"index": 1,  "stage": "IMAGE_UPLOADING",          "name": "Image Uploading",          "progress": 10.0},
    {"index": 2,  "stage": "IMAGE_VALIDATION",         "name": "Image Validation",         "progress": 20.0},
    {"index": 3,  "stage": "QUALITY_ASSESSMENT",       "name": "Optical Quality Gate",     "progress": 30.0},
    {"index": 4,  "stage": "PREPROCESSING",            "name": "Ben Graham CLAHE Prep",    "progress": 40.0},
    {"index": 5,  "stage": "MODEL_LOADING",            "name": "Neural Checkpoint Load",   "progress": 50.0},
    {"index": 6,  "stage": "CLASSIFICATION_INFERENCE", "name": "EfficientNet Inference",    "progress": 60.0},
    {"index": 7,  "stage": "CONFIDENCE_CALIBRATION",   "name": "Temperature Scaling",      "progress": 70.0},
    {"index": 8,  "stage": "GRADCAM_GENERATION",       "name": "Grad-CAM Heatmap",         "progress": 80.0},
    {"index": 9,  "stage": "LESION_SEGMENTATION",      "name": "U-Net Lesion Segmentation","progress": 85.0},
    {"index": 10, "stage": "CLINICAL_ASSURANCE",       "name": "Clinical Assurance Safety","progress": 95.0},
    {"index": 11, "stage": "RESULT_READY",             "name": "Diagnostic Result Ready",  "progress": 100.0},
]

STAGE_MAP = {s["stage"]: s for s in STAGES}


class AnalysisJobService:
    @staticmethod
    def get_stages():
        return STAGES

    @staticmethod
    def create_or_get_job(
        db: Session,
        screening_id: uuid.UUID,
        engine: str = "PYTHON_EFFICIENTNET"
    ) -> AnalysisJob:
        """
        Idempotent job creation. If an active job (PENDING or RUNNING) exists, reuse it.
        Otherwise creates a new persistent AnalysisJob record.
        """
        active_job = db.query(AnalysisJob).filter(
            AnalysisJob.screening_id == screening_id,
            AnalysisJob.status.in_([JobStatus.PENDING, JobStatus.RUNNING])
        ).order_by(AnalysisJob.requested_at.desc()).first()

        if active_job:
            # Check for stale timeout (> 180 seconds)
            if active_job.started_at:
                start = active_job.started_at
                if start.tzinfo is None:
                    start = start.replace(tzinfo=timezone.utc)
                elapsed = (datetime.now(timezone.utc) - start).total_seconds()
                if elapsed > 180:
                    active_job.status = JobStatus.TIMEOUT
                    active_job.error_code = "ERR_ANALYSIS_TIMEOUT"
                    active_job.error_message = f"Analysis pipeline timed out after {elapsed:.1f}s"
                    db.commit()
                else:
                    return active_job

        # Create new job
        job = AnalysisJob(
            screening_id=screening_id,
            engine=engine,
            status=JobStatus.RUNNING,
            stage="IMAGE_VALIDATION",
            progress_percent=20.0,
            requested_at=datetime.now(timezone.utc),
            started_at=datetime.now(timezone.utc),
            retry_count=0,
            max_retries=3,
        )
        db.add(job)
        db.commit()
        db.refresh(job)
        return job

    @staticmethod
    def update_stage(
        db: Session,
        job_id: uuid.UUID,
        stage: str,
        progress_percent: Optional[float] = None,
        details: Optional[Dict[str, Any]] = None,
    ) -> Optional[AnalysisJob]:
        job = db.query(AnalysisJob).filter(AnalysisJob.id == job_id).first()
        if not job:
            return None

        job.stage = stage
        if progress_percent is not None:
            job.progress_percent = progress_percent
        elif stage in STAGE_MAP:
            job.progress_percent = STAGE_MAP[stage]["progress"]

        if details:
            existing = job.result_summary or {}
            job.result_summary = {**existing, **details}

        db.commit()
        db.refresh(job)
        return job

    @staticmethod
    def complete_job(
        db: Session,
        job_id: uuid.UUID,
        result_summary: Optional[Dict[str, Any]] = None
    ) -> Optional[AnalysisJob]:
        job = db.query(AnalysisJob).filter(AnalysisJob.id == job_id).first()
        if not job:
            return None

        now = datetime.now(timezone.utc)
        job.status = JobStatus.COMPLETED
        job.stage = "RESULT_READY"
        job.progress_percent = 100.0
        job.completed_at = now
        if job.started_at:
            start = job.started_at
            if start.tzinfo is None:
                start = start.replace(tzinfo=timezone.utc)
            job.execution_time_seconds = round((now - start).total_seconds(), 2)
        if result_summary:
            job.result_summary = result_summary

        db.commit()
        db.refresh(job)
        return job

    @staticmethod
    def fail_job(
        db: Session,
        job_id: uuid.UUID,
        error_code: str,
        error_message: str,
        error_details: Optional[Dict[str, Any]] = None,
    ) -> Optional[AnalysisJob]:
        job = db.query(AnalysisJob).filter(AnalysisJob.id == job_id).first()
        if not job:
            return None

        now = datetime.now(timezone.utc)
        job.status = JobStatus.FAILED
        job.completed_at = now
        if job.started_at:
            start = job.started_at
            if start.tzinfo is None:
                start = start.replace(tzinfo=timezone.utc)
            job.execution_time_seconds = round((now - start).total_seconds(), 2)
        job.error_code = error_code
        job.error_message = error_message
        job.error_details = error_details

        db.commit()
        db.refresh(job)
        return job

    @staticmethod
    def get_job_status(db: Session, screening_id: uuid.UUID) -> Dict[str, Any]:
        """
        Retrieves status of most recent analysis job for a screening.
        If no explicit job exists, infers from screening status.
        """
        job = db.query(AnalysisJob).filter(
            AnalysisJob.screening_id == screening_id
        ).order_by(AnalysisJob.requested_at.desc()).first()

        screening = db.query(Screening).filter(Screening.id == screening_id).first()

        if not job:
            # Synthetic response based on screening state
            if screening and screening.status == ScreeningStatus.RECAPTURE_REQUIRED:
                return {
                    "job_id": None,
                    "screening_id": str(screening_id),
                    "status": "COMPLETED",
                    "stage": "RESULT_READY",
                    "stage_index": 11,
                    "stage_name": "Image Recapture Required",
                    "progress_percent": 100.0,
                    "engine": "PYTHON_EFFICIENTNET",
                    "elapsed_seconds": 0.0,
                    "is_completed": True,
                    "is_failed": False,
                    "all_stages": STAGES,
                }
            return {
                "job_id": None,
                "screening_id": str(screening_id),
                "status": "NOT_STARTED",
                "stage": "IMAGE_UPLOADING",
                "stage_index": 1,
                "stage_name": "Image Uploading",
                "progress_percent": 0.0,
                "engine": "PYTHON_EFFICIENTNET",
                "elapsed_seconds": 0.0,
                "is_completed": False,
                "is_failed": False,
                "all_stages": STAGES,
            }

        now = datetime.now(timezone.utc)
        start = job.started_at or job.requested_at
        if start and start.tzinfo is None:
            start = start.replace(tzinfo=timezone.utc)
        elapsed = round((now - start).total_seconds(), 2) if start else 0.0
        if job.execution_time_seconds:
            elapsed = job.execution_time_seconds

        stage_meta = STAGE_MAP.get(job.stage, {"index": 1, "name": job.stage, "progress": job.progress_percent})

        return {
            "job_id": str(job.id),
            "screening_id": str(screening_id),
            "status": job.status.value if hasattr(job.status, "value") else str(job.status),
            "stage": job.stage,
            "stage_index": stage_meta.get("index", 1),
            "stage_name": stage_meta.get("name", job.stage),
            "progress_percent": job.progress_percent,
            "engine": job.engine,
            "elapsed_seconds": elapsed,
            "execution_time_seconds": job.execution_time_seconds,
            "is_completed": job.status == JobStatus.COMPLETED,
            "is_failed": job.status in [JobStatus.FAILED, JobStatus.TIMEOUT],
            "retry_count": job.retry_count,
            "max_retries": job.max_retries,
            "error_code": job.error_code,
            "error_message": job.error_message,
            "error_details": job.error_details,
            "result_summary": job.result_summary,
            "all_stages": STAGES,
        }
