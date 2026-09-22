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


def save_model_run(model_type: str, metrics: dict):
    with connect() as conn, conn.cursor() as cur:
        cur.execute("INSERT INTO model_runs (model_type, metrics) VALUES (%s, %s)", (model_type, json.dumps(metrics, ensure_ascii=False)))
        conn.commit()


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
