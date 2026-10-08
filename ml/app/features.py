"""Feature engineering ที่ใช้ร่วมกันทั้งตอนเทรนและตอนทำนาย

ความเสี่ยงค้างชำระ (Classification) ใช้ 6 กลุ่มฟีเจอร์ตามที่ออกแบบไว้
  1. late_count     จำนวนครั้งที่จ่ายช้าใน 6 บิลล่าสุด
  2. avg_days_late  จำนวนวันที่ช้าเฉลี่ยต่อบิล (6 บิลล่าสุด)
  3. bill_ratio     ยอดบิลนี้เทียบค่าเฉลี่ย 3 บิลก่อนหน้า
  4. tenure_years   ระยะเวลาที่เช่ามา (ปี)
  5. stall_type     ประเภทแผง
  6. season         ฤดูกาลของวันครบกำหนด
  พฤติกรรมการจ่าย (จาก 6 บิลล่าสุด ณ วันออกบิล ใช้แทน "วินัย" ที่มองไม่เห็นได้บางส่วน)
  7. early_days_avg จ่ายก่อนวันครบกำหนดเฉลี่ยกี่วัน (เฉพาะบิลที่จ่ายตรงเวลาแล้ว)
  8. seen_rate      สัดส่วนบิลที่ผู้ค้าเปิดดูในแอปก่อนครบกำหนด (bills.seen_at)
  9. app_share      สัดส่วนบิลที่จ่ายผ่านแอป ไม่ใช่เงินสด (payments.provider)

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
BEHAVIOR = ["early_days_avg", "seen_rate", "app_share"]
NUMERIC = ["late_count", "avg_days_late", "bill_ratio", "tenure_years", *BEHAVIOR]
CATEGORICAL = ["stall_type", "season"]
FEATURE_LABELS = {
    "late_count": "จำนวนครั้งที่จ่ายช้า (6 บิลล่าสุด)",
    "avg_days_late": "จำนวนวันที่ช้าเฉลี่ย",
    "bill_ratio": "ยอดบิลเทียบกับปกติ",
    "tenure_years": "ระยะเวลาที่เช่า (ปี)",
    "early_days_avg": "จ่ายก่อนวันครบกำหนดเฉลี่ย (วัน)",
    "seen_rate": "สัดส่วนบิลที่เปิดดูในแอป",
    "app_share": "สัดส่วนที่จ่ายผ่านแอป",
    # ชื่อรวมของปัจจัยหมวดหมู่ ใช้กับน้ำหนักจาก permutation importance (Gradient Boosting, โมเดลรวม)
    "stall_type": "ประเภทแผง",
    "season": "ช่วงเวลาของวันครบกำหนด",
    **{f"stall_type_{k}": f"แผง{v}" for k, v in TYPE_NAMES.items()},
    **{f"season_{k}": v for k, v in SEASON_NAMES.items()},
}


def season_of(d: date) -> str:
    return season_of_month(d.month)


def season_of_month(m: int) -> str:
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
    # พฤติกรรม: ใช้เฉพาะสิ่งที่เกิดขึ้นแล้ว ณ วันออกบิล (จ่ายแล้วก่อนวันนั้น เปิดดูก่อนวันนั้น)
    asof = bill["issue_date"]
    known = [b for b in last6 if b.get("paid_date") is not None and b["paid_date"] <= asof]
    ontime = [b for b in known if b["paid_date"] <= b["due_date"]]
    seen = [b.get("seen_at") is not None and b["seen_at"] <= min(b["due_date"], asof) for b in last6]
    return {
        "late_count": late,
        "avg_days_late": (total_days / len(last6)) if last6 else 0.0,
        "bill_ratio": (gross / base) if base > 0 else 1.0,
        "tenure_years": min(tenure, 15.0),
        "stall_type": stall_type,
        "season": season_of(bill["due_date"]),
        "early_days_avg": mean([(b["due_date"] - b["paid_date"]).days for b in ontime]) if ontime else 0.0,
        "seen_rate": (sum(seen) / len(seen)) if seen else 0.0,
        "app_share": (sum(b.get("channel") == "app" for b in known) / len(known)) if known else 0.0,
        "n_prior": len(last6),
    }


def input_features(r: dict, fill: dict | None = None) -> dict:
    """ค่าที่เจ้าหน้าที่กรอกในไฟล์ (หน้า "ทำนายจากไฟล์") → ปัจจัยชุดเดียวกับ risk_features ทุกประการ
    r = {stall_type, due_month, tenure_years, n_prior, late_count, days_late_total, bill_total, prev_avg,
         early_days_avg?, seen_count?, app_count?}
    n_prior = จำนวนบิลก่อนหน้าที่นับ (สูงสุด 6) · prev_avg = ยอดเฉลี่ยของบิลก่อนหน้าไม่เกิน 3 บิล (0 = ไม่มี)
    ปัจจัยพฤติกรรมไม่บังคับกรอก ถ้าเว้นว่าง (None) ใช้ค่าเฉลี่ยของข้อมูลเทรนจาก fill แล้วบอกไว้ใน "filled"
    """
    n = int(r["n_prior"])
    base = float(r.get("prev_avg") or 0)
    fill = fill or {}
    filled = []

    def behave(key, value):
        if value is not None:
            return float(value)
        filled.append(key)
        return float(fill.get(key, 0.0))

    early = behave("early_days_avg", r.get("early_days_avg"))
    seen = behave("seen_rate", None if r.get("seen_count") is None else (r["seen_count"] / n if n else 0.0))
    app = behave("app_share", None if r.get("app_count") is None else (r["app_count"] / n if n else 0.0))
    if n == 0:                                     # ไม่มีบิลก่อนหน้า ไม่มีพฤติกรรมให้ดู ตรงกับ risk_features
        early, seen, app, filled = 0.0, 0.0, 0.0, []
    return {
        "late_count": int(r["late_count"]),
        "avg_days_late": (float(r["days_late_total"]) / n) if n else 0.0,
        "bill_ratio": (float(r["bill_total"]) / base) if n and base > 0 else 1.0,
        "tenure_years": min(max(0.0, float(r["tenure_years"])), 15.0),
        "stall_type": r["stall_type"],
        "season": season_of_month(int(r["due_month"])),
        "early_days_avg": early,
        "seen_rate": seen,
        "app_share": app,
        "n_prior": n,
        "filled": filled,
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
    # พฤติกรรม: บอกเฉพาะเมื่อมีประวัติพอ (อย่างน้อย 3 บิล) และเป็นค่าของผู้ค้าคนนี้จริง
    # ค่าที่ระบบเติมให้ (หน้า "ทำนายจากไฟล์" เมื่อเว้นว่าง) ไม่ใช่ข้อมูลของคนนั้น จึงไม่นำมาเป็นเหตุผล
    filled = set(f.get("filled") or [])
    if f.get("n_prior", 0) >= 3:
        if "early_days_avg" not in filled and f.get("late_count", 0) == 0 and f.get("early_days_avg") is not None and f["early_days_avg"] < 1:
            r.append("มักจ่ายวันใกล้ครบกำหนด")
        if not filled & {"seen_rate", "app_share"} and f.get("seen_rate") is not None and 0 < f.get("app_share", 0) and f["seen_rate"] < 0.34:
            r.append("ไม่ค่อยเปิดดูบิลในแอป")
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
