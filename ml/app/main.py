"""ML Service: API ภายในที่ Backend (Node.js) เรียกใช้"""
import os

from fastapi import BackgroundTasks, FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from typing import Literal

from pydantic import BaseModel, Field, model_validator

from . import anomaly, benchmark, drift, risk
from .features import TYPE_CODES

app = FastAPI(title="Bunyat Market ML Service", version="1.0.0")

# เมื่อ deploy บนโฮสต์สาธารณะ ให้ตั้ง ML_API_KEY แล้วฝั่ง Backend ส่งกุญแจเดียวกันมาใน header
# ถ้าไม่ตั้ง (เช่น รันในเครือข่าย docker ภายใน) จะไม่บังคับ เพื่อให้การรันในเครื่องเหมือนเดิม
ML_API_KEY = os.environ.get("ML_API_KEY", "").strip()


@app.middleware("http")
async def require_api_key(request: Request, call_next):
    open_paths = {"/health", "/docs", "/openapi.json", "/redoc"}
    if ML_API_KEY and request.url.path not in open_paths:
        if request.headers.get("x-ml-key", "") != ML_API_KEY:
            return JSONResponse({"detail": "ไม่ได้รับอนุญาตให้เรียก ML service"}, status_code=401)
    return await call_next(request)


class TrainRequest(BaseModel):
    # ใครหรืออะไรสั่งเทรน (บันทึกลง model_runs.triggered_by เพื่อแสดงในประวัติการทำงาน)
    triggered_by: str | None = Field(None, max_length=120)


MODEL_PATTERN = "^(" + "|".join(risk.MODEL_KEYS) + ")$"


class ScoreRequest(BaseModel):
    bill_ids: list[int]
    model: str = Field("lr", pattern=MODEL_PATTERN)


class PredictRow(BaseModel):
    """หนึ่งแถวจากไฟล์ที่เจ้าหน้าที่อัปโหลด (API ตรวจแล้วชั้นหนึ่งใน api/src/lib/riskInput.js)"""
    ref: str = Field("", max_length=60)
    stall_type: Literal[tuple(TYPE_CODES)]  # type: ignore[valid-type]
    due_month: int = Field(..., ge=1, le=12)
    tenure_years: float = Field(..., ge=0, le=60)
    n_prior: int = Field(..., ge=0, le=6)
    late_count: int = Field(..., ge=0, le=6)
    days_late_total: float = Field(..., ge=0, le=2000)
    bill_total: float = Field(..., ge=1, le=1e7)
    prev_avg: float = Field(0, ge=0, le=1e7)
    # พฤติกรรมการจ่าย ไม่บังคับ: None = เติมค่าเฉลี่ยของข้อมูลเทรน (features.input_features)
    early_days_avg: float | None = Field(None, ge=0, le=30)
    seen_count: int | None = Field(None, ge=0, le=6)
    app_count: int | None = Field(None, ge=0, le=6)

    @model_validator(mode="after")
    def consistent(self):
        if self.late_count > self.n_prior:
            raise ValueError("late_count มากกว่า n_prior")
        for v in (self.seen_count, self.app_count):
            if v is not None and v > self.n_prior:
                raise ValueError("seen_count/app_count มากกว่า n_prior")
        if (self.late_count == 0) != (self.days_late_total == 0) or self.days_late_total < self.late_count:
            raise ValueError("days_late_total ไม่สอดคล้องกับ late_count")
        return self


class PredictRequest(BaseModel):
    rows: list[PredictRow] = Field(..., min_length=1, max_length=500)


class Reading(BaseModel):
    stall_id: str
    cur_water: int | None = None
    cur_elec: int | None = None


class CheckRequest(BaseModel):
    period: str = Field(..., pattern=r"^\d{4}-\d{2}$")
    readings: list[Reading]
    method: str = Field("both", pattern="^(z|if|both)$")
    z_threshold: float = 3.0
    if_threshold: float = 0.62


def _wrap(fn, *args, **kwargs):
    try:
        return fn(*args, **kwargs)
    except RuntimeError as e:
        raise HTTPException(status_code=409, detail=str(e))


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/risk/train")
def risk_train(req: TrainRequest | None = None):
    return _wrap(risk.train, (req.triggered_by if req else None))


@app.get("/risk/metrics")
def risk_metrics():
    return _wrap(risk.metrics)


@app.post("/risk/score")
def risk_score(req: ScoreRequest):
    return {"model": req.model, "results": _wrap(risk.score, req.bill_ids, req.model)}


@app.post("/risk/predict")
def risk_predict(req: PredictRequest):
    """ทำนายจากค่าที่อัปโหลด ไม่อ่านหรือเขียนตาราง bills · คืนคะแนนของทุกโมเดลที่เทรนไว้"""
    return _wrap(risk.predict_rows, [r.model_dump() for r in req.rows])


@app.post("/anomaly/train")
def anomaly_train(req: TrainRequest | None = None):
    info = _wrap(anomaly.train, (req.triggered_by if req else None))
    return {k: v for k, v in info.items() if k != "points"}


@app.get("/anomaly/info")
def anomaly_info():
    return _wrap(anomaly.info)


@app.post("/drift/run")
def drift_run(req: TrainRequest | None = None):
    """สร้างรายงาน drift รายเดือนแล้วบันทึกลง drift_reports (RodeMap รอบ 5)"""
    return _wrap(drift.run, (req.triggered_by if req else None))


@app.post("/benchmark/run")
def benchmark_run(background: BackgroundTasks, req: TrainRequest | None = None):
    """วัดผลโมเดลกับข้อมูลจำลองหลายชุด รันเบื้องหลังแล้วตอบทันทีพร้อมเลขชุด (ใช้เวลาหลายนาทีบนแพลนฟรี)
    ผลถูกเขียนลง model_evaluations · ถ้ามีชุดที่กำลังรันอยู่ จะคืนชุดนั้นแทนการรันซ้อน
    """
    batch = _wrap(benchmark.start_batch, (req.triggered_by if req else None))
    if not batch["already_running"]:
        background.add_task(benchmark.execute, batch["id"])
    return batch


@app.post("/anomaly/check")
def anomaly_check(req: CheckRequest):
    rows = [r.model_dump() for r in req.readings]
    return {"results": _wrap(anomaly.check, req.period, rows, req.method, req.z_threshold, req.if_threshold)}
