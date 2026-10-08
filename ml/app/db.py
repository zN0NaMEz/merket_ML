import json
import os
from contextlib import contextmanager

import psycopg
from psycopg.rows import dict_row

DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql://market:market@localhost:5432/market")
MODEL_DIR = os.environ.get("MODEL_DIR", os.path.join(os.path.dirname(os.path.dirname(__file__)), "models"))
os.makedirs(MODEL_DIR, exist_ok=True)


@contextmanager
def connect():
    conn = psycopg.connect(DATABASE_URL, row_factory=dict_row)
    try:
        yield conn
    finally:
        conn.close()


def fetch_all(sql: str, params=None) -> list[dict]:
    with connect() as conn, conn.cursor() as cur:
        cur.execute(sql, params or ())
        return cur.fetchall()


def today(conn=None):
    """วันที่ของระบบ: ใช้ demo_date ใน settings ถ้าเปิดโหมดสาธิต ไม่เช่นนั้นใช้วันที่จริง (เวลาไทย)"""
    sql = "SELECT value FROM settings WHERE key = 'clock'"
    rows = fetch_all(sql)
    from datetime import date, datetime, timedelta, timezone
    if rows and rows[0]["value"].get("demo_date"):
        return date.fromisoformat(rows[0]["value"]["demo_date"])
    return (datetime.now(timezone.utc) + timedelta(hours=7)).date()


# คอลัมน์ของ model_runs ที่เพิ่มในเวอร์ชัน 2 (RodeMap.md 4.1) ฝั่ง API ก็สร้างไว้เหมือนกัน
# ML สร้างเองด้วยเผื่อเทรนก่อนที่ API จะได้รัน migration (เช่นฐานข้อมูลใหม่ที่ ML ตื่นก่อน)
_RUN_COLUMNS = {
    "sklearn_version": "text", "n_train": "int", "n_test": "int", "data_from": "date", "data_to": "date",
    "is_synthetic": "boolean NOT NULL DEFAULT false", "cv_scores": "jsonb", "confusion": "jsonb",
    "calibration": "jsonb", "global_importance": "jsonb", "triggered_by": "text",
}
_JSON_COLUMNS = {"cv_scores", "confusion", "calibration", "global_importance"}
_runs_ready = False


def _ensure_run_columns(cur):
    global _runs_ready
    if _runs_ready:
        return
    cur.execute("ALTER TABLE model_runs " + ", ".join(f"ADD COLUMN IF NOT EXISTS {k} {t}" for k, t in _RUN_COLUMNS.items()))
    _runs_ready = True


def is_synthetic() -> bool:
    """ข้อมูลในระบบเป็นข้อมูลจำลองไหม: ผู้ค้าที่สร้างจากตัวสร้างข้อมูลตัวอย่างมีค่า sim_* ติดมา ข้อมูลจริงไม่มี"""
    try:
        return bool(fetch_all("SELECT EXISTS (SELECT 1 FROM vendors WHERE sim_discipline IS NOT NULL) AS s")[0]["s"])
    except Exception:
        return False


def sim_profile() -> str | None:
    """โปรไฟล์ของข้อมูลจำลองที่ seed ไว้ (settings.sim.profile): realistic = ความบังเอิญเท่าตลาดจริง,
    clear = ความบังเอิญต่ำ (ใช้สาธิตว่าโมเดลทำได้แค่ไหนเมื่อข้อมูลชัด) · ข้อมูลจริงหรือ seed รุ่นก่อนคืน None/realistic"""
    if not is_synthetic():
        return None
    try:
        rows = fetch_all("SELECT value FROM settings WHERE key = 'sim'")
        return (rows[0]["value"] or {}).get("profile", "realistic") if rows else "realistic"
    except Exception:
        return "realistic"


def save_model_run(model_type: str, metrics: dict, **cols) -> int:
    """บันทึกผลการเทรนหนึ่งรอบ cols = คอลัมน์รายละเอียด (ดู _RUN_COLUMNS) คืน id ของแถว"""
    import sklearn
    cols = {k: v for k, v in cols.items() if k in _RUN_COLUMNS and v is not None}
    cols.setdefault("sklearn_version", sklearn.__version__)
    names = ["model_type", "metrics", *cols.keys()]
    values = [model_type, json.dumps(metrics, ensure_ascii=False)]
    values += [json.dumps(v, ensure_ascii=False) if k in _JSON_COLUMNS else v for k, v in cols.items()]
    with connect() as conn, conn.cursor() as cur:
        _ensure_run_columns(cur)
        cur.execute(
            f"INSERT INTO model_runs ({', '.join(names)}) VALUES ({', '.join(['%s'] * len(names))}) RETURNING id",
            values,
        )
        run_id = cur.fetchone()["id"]
        conn.commit()
    return run_id


def save_model_blob(model_type: str, payload: bytes, meta: dict):
    """เก็บโมเดลที่เทรนแล้วลงฐานข้อมูล ทับของเดิมของชนิดเดียวกัน"""
    import sklearn
    with connect() as conn, conn.cursor() as cur:
        cur.execute(
            """INSERT INTO model_blobs (model_type, trained_at, sklearn_ver, payload, meta)
               VALUES (%s, now(), %s, %s, %s)
               ON CONFLICT (model_type) DO UPDATE
               SET trained_at = now(), sklearn_ver = EXCLUDED.sklearn_ver,
                   payload = EXCLUDED.payload, meta = EXCLUDED.meta""",
            (model_type, sklearn.__version__, payload, json.dumps(meta, ensure_ascii=False)),
        )
        conn.commit()


def load_model_blob(model_type: str):
    """คืน (payload, meta) ถ้ามีโมเดลที่เทรนด้วย sklearn รุ่นเดียวกัน ไม่งั้นคืน None"""
    import sklearn
    try:
        rows = fetch_all(
            "SELECT payload, meta, sklearn_ver FROM model_blobs WHERE model_type = %s", (model_type,)
        )
    except Exception:
        return None                                  # ยังไม่มีตาราง เช่นฐานข้อมูลเก่า
    if not rows:
        return None
    row = rows[0]
    if row["sklearn_ver"] != sklearn.__version__:    # โมเดลข้ามรุ่นอาจโหลดไม่ได้ ให้เทรนใหม่แทน
        return None
    return bytes(row["payload"]), row["meta"]
