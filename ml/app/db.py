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
