"""Feature engineering ที่ใช้ร่วมกันทั้งตอนเทรนและตอนทำนาย

ความเสี่ยงค้างชำระ (Classification) ใช้ 6 กลุ่มฟีเจอร์ตามที่ออกแบบไว้
  1. late_count     จำนวนครั้งที่จ่ายช้าใน 6 บิลล่าสุด
  2. avg_days_late  จำนวนวันที่ช้าเฉลี่ยต่อบิล (6 บิลล่าสุด)
  3. bill_ratio     ยอดบิลนี้เทียบค่าเฉลี่ย 3 บิลก่อนหน้า
  4. tenure_years   ระยะเวลาที่เช่ามา (ปี)
  5. stall_type     ประเภทแผง
  6. season         ฤดูกาลของวันครบกำหนด

ตรวจจับค่ามิเตอร์ผิดปกติ (Anomaly Detection) ใช้ log-ratio 4 ค่า
  น้ำ/ไฟ เทียบค่าเฉลี่ยของแผงเดียวกัน (12 เดือน) และเทียบแผงประเภทเดียวกัน (3 เดือน)
"""
from __future__ import annotations

import math
from datetime import date
from statistics import mean, stdev

TYPE_CODES = ["fresh", "cooked", "produce", "dry", "clothes"]
TYPE_NAMES = {"fresh": "อาหารสด", "cooked": "อาหารปรุงสุก", "produce": "ผักผลไม้", "dry": "ของชำ", "clothes": "เสื้อผ้าและของใช้"}
SEASONS = ["festival", "school", "rainy", "normal"]
SEASON_NAMES = {"festival": "ช่วงเทศกาล", "school": "ช่วงเปิดเทอม", "rainy": "หน้าฝน", "normal": "ช่วงปกติ"}
NUMERIC = ["late_count", "avg_days_late", "bill_ratio", "tenure_years"]
CATEGORICAL = ["stall_type", "season"]
FEATURE_LABELS = {
    "late_count": "จำนวนครั้งที่จ่ายช้า (6 บิลล่าสุด)",
    "avg_days_late": "จำนวนวันที่ช้าเฉลี่ย",
    "bill_ratio": "ยอดบิลเทียบกับปกติ",
    "tenure_years": "ระยะเวลาที่เช่า (ปี)",
    **{f"stall_type_{k}": f"แผง{v}" for k, v in TYPE_NAMES.items()},
    **{f"season_{k}": v for k, v in SEASON_NAMES.items()},
}


def season_of(d: date) -> str:
    m = d.month
    if m in (12, 1, 4):
        return "festival"
    if m in (5, 6):
        return "school"
    if m in (8, 9, 10):
        return "rainy"
    return "normal"


def days_late_as_of(bill: dict, as_of: date) -> int:
    paid = bill.get("paid_date")
    due = bill["due_date"]
    if paid is not None and paid <= as_of:
        return max(0, (paid - due).days)
    return max(0, (as_of - due).days)


def risk_features(since: date, stall_type: str, prior: list[dict], bill: dict) -> dict:
    """prior = บิลรายเดือนก่อนหน้าของผู้ค้ารายเดียวกัน เรียงตาม period"""
    last6 = prior[-6:]
    late = 0
    total_days = 0
    for b in last6:
        dl = days_late_as_of(b, bill["issue_date"])
        if dl > 0:
            late += 1
        total_days += dl
    last3 = prior[-3:]
    base = mean([b["total"] + (b.get("credit_used") or 0) for b in last3]) if last3 else 0
    gross = bill["total"] + (bill.get("credit_used") or 0)
    tenure = max(0.0, (bill["issue_date"] - since).days / 365)
    return {
        "late_count": late,
        "avg_days_late": (total_days / len(last6)) if last6 else 0.0,
        "bill_ratio": (gross / base) if base > 0 else 1.0,
        "tenure_years": min(tenure, 15.0),
        "stall_type": stall_type,
        "season": season_of(bill["due_date"]),
        "n_prior": len(last6),
    }


def risk_reasons(f: dict) -> list[str]:
    r = []
    if f["late_count"] >= 1:
        r.append(f"จ่ายช้า {f['late_count']} ครั้งใน {f['n_prior']} บิลล่าสุด")
    if f["avg_days_late"] >= 1:
        r.append(f"ช้าเฉลี่ย {f['avg_days_late']:.1f} วันต่อบิล")
    if f["bill_ratio"] >= 1.15:
        r.append(f"ยอดบิลสูงกว่าปกติ {round((f['bill_ratio'] - 1) * 100)}%")
    if f["tenure_years"] < 1:
        r.append("เช่ามาไม่ถึง 1 ปี")
    if f["season"] in ("school", "rainy"):
        r.append("ครบกำหนดใน" + SEASON_NAMES[f["season"]])
    return r or ["ประวัติชำระตรงเวลา"]


# ---------------- anomaly ----------------

def prev_period(p: str, n: int = 1) -> str:
    y, m = int(p[:4]), int(p[5:7])
    for _ in range(n):
        m -= 1
        if m < 1:
            m, y = 12, y - 1
    return f"{y}-{m:02d}"


def _sd(xs: list[float]) -> float:
    return stdev(xs) if len(xs) >= 2 else 0.0


def peer_stats(readings_by_type: dict, stall_type: str, period: str) -> dict:
    lo = prev_period(period, 3)
    rows = [r for r in readings_by_type.get(stall_type, []) if lo <= r["period"] < period]
    w = [r["use_water"] for r in rows]
    e = [r["use_elec"] for r in rows]
    return {"mw": mean(w) if w else 0.0, "sw": _sd(w), "me": mean(e) if e else 0.0, "se": _sd(e), "n": len(rows)}


def anomaly_vector(use_w: float, use_e: float, hist: list[dict], peer: dict) -> list[float]:
    mw = mean([h["use_water"] for h in hist])
    me = mean([h["use_elec"] for h in hist])
    return [
        math.log((use_w + 1) / (mw + 1)),
        math.log((use_e + 1) / (me + 1)),
        math.log((use_w + 1) / (peer["mw"] + 1)),
        math.log((use_e + 1) / (peer["me"] + 1)),
    ]
