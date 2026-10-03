"""รายงานการเปลี่ยนแปลงของข้อมูล (data drift) รายเดือน · RodeMap รอบ 5

เทียบข้อมูลเดือนล่าสุดกับ 12 เดือนก่อนหน้าด้วย PSI (Population Stability Index)
  PSI = Σ (สัดส่วนเดือนนี้ − สัดส่วนอ้างอิง) × ln(สัดส่วนเดือนนี้ / สัดส่วนอ้างอิง)
  เกณฑ์ที่ใช้กันทั่วไป: < 0.1 คงที่ · 0.1–0.25 เปลี่ยนพอสมควร · > 0.25 เปลี่ยนมาก ควรเทรนใหม่
ตัวเลขช่วงตัวเลขแบ่งตาม quantile ของข้อมูลอ้างอิง ส่วนประเภทแผงนับสัดส่วนตรง ๆ
ผลถูกเก็บลง drift_reports หน้าเว็บอ่านจากฐานข้อมูล ไม่เรียก ML ตอนเปิดหน้า

ข้อระวังที่ทำให้ PSI หลอกตา และวิธีที่ใช้แก้
- ข้อมูลน้อย: แค่สุ่มเฉย ๆ PSI ก็มีค่าคาดหวังราว (k−1)(1/n_ref + 1/n_cur) เมื่อ k = จำนวนช่อง
  เดือนที่มี 32 บิลกับ 10 ช่อง ได้ราว 0.3 ซึ่งเกินเกณฑ์ "เปลี่ยนมาก" ทั้งที่ไม่มีอะไรเปลี่ยน
  จึงลดจำนวนช่องตามขนาดข้อมูล (bins_for) บันทึกระดับความแกว่งปกติ (noise_floor) ไว้ทุกตัวแปร
  และทดสอบด้วยการสลับ (permutation test): รวมสองกลุ่มแล้วสุ่มแบ่งใหม่หลายร้อยครั้ง ดูว่า PSI ที่สูงเท่านี้
  เกิดจากความบังเอิญบ่อยแค่ไหน (p_value) ระดับรวมของรายงานนับเฉพาะตัวแปรที่ p < 0.05
- ฤดูกาล: เดือนเดียวอยู่ฤดูเดียวเสมอ เทียบกับ 12 เดือนจะต่างทุกครั้ง จึงไม่นับ season
  และการใช้น้ำไฟเทียบกับเดือนเดียวกันของปีก่อนเมื่อมีข้อมูลพอ
"""
import json
from statistics import mean

import numpy as np

from . import db
from .features import CATEGORICAL, NUMERIC, SEASONS, TYPE_CODES, risk_features

PSI_BINS = 10
EPS = 1e-4
STABLE, MODERATE = 0.1, 0.25
REF_MONTHS = 12
SMALL_N = 50          # ข้อมูลเดือนเดียวน้อยกว่านี้ PSI แกว่งได้มาก ต้องบอกผู้อ่าน
N_PERM = 500          # จำนวนรอบของ permutation test (seed คงที่ รายงานซ้ำได้ผลเดิม)
ALPHA = 0.05
MIN_SAME_MONTH = 20   # ข้อมูลเดือนเดียวกันของปีก่อนต้องมีอย่างน้อยเท่านี้จึงใช้เป็นตัวอ้างอิงของมิเตอร์
EXCLUDED = [{"feature": "season", "reason": "เปลี่ยนตามเดือนในปฏิทินอยู่แล้ว เดือนเดียวเทียบกับ 12 เดือนจะต่างเสมอ จึงไม่นับ"}]


def bins_for(n_cur: int) -> int:
    """จำนวนช่องตามขนาดข้อมูลเดือนนี้ (ราว 10 รายการต่อช่อง) อย่างน้อย 3 อย่างมาก 10"""
    return max(3, min(PSI_BINS, n_cur // 10))


def noise_floor(k: int, n_ref: int, n_cur: int) -> float | None:
    """PSI ที่คาดว่าจะได้จากการสุ่มอย่างเดียว เมื่อไม่มีการเปลี่ยนจริง"""
    if k < 2 or not n_ref or not n_cur:
        return None
    return round((k - 1) * (1 / n_ref + 1 / n_cur), 4)


def _psi(ref_share: np.ndarray, cur_share: np.ndarray) -> float:
    r = np.clip(ref_share, EPS, None)
    c = np.clip(cur_share, EPS, None)
    return float(np.sum((c - r) * np.log(c / r)))


def psi_numeric(ref, cur, bins: int = PSI_BINS) -> float | None:
    """PSI ของตัวแปรตัวเลข · ช่องแบ่งตาม quantile ของข้อมูลอ้างอิง (ช่องซ้ำถูกรวม)"""
    return psi_numeric_k(ref, cur, bins)[0]


def psi_numeric_k(ref, cur, bins: int = PSI_BINS) -> tuple:
    """เหมือน psi_numeric แต่คืนจำนวนช่องที่ใช้จริงด้วย (ใช้คิด noise_floor)"""
    ref = np.asarray([x for x in ref if x is not None], dtype=float)
    cur = np.asarray([x for x in cur if x is not None], dtype=float)
    if len(ref) < 2 or len(cur) == 0:
        return None, 0
    inner = np.unique(np.quantile(ref, np.linspace(0, 1, bins + 1)))[1:-1]
    n = len(inner) + 1
    if n == 1:                     # ค่าอ้างอิงเท่ากันหมด: เทียบสัดส่วน "เท่าค่าเดิม" กับ "ต่างไป"
        same = ref[0]
        return _psi(np.array([1.0, 0.0]), np.array([np.mean(cur == same), np.mean(cur != same)])), 2
    r = np.bincount(np.searchsorted(inner, ref, side="right"), minlength=n) / len(ref)
    c = np.bincount(np.searchsorted(inner, cur, side="right"), minlength=n) / len(cur)
    return _psi(r, c), n


def psi_categorical(ref, cur, cats) -> float | None:
    if not ref or not cur:
        return None
    r = np.array([sum(1 for x in ref if x == k) for k in cats], dtype=float) / len(ref)
    c = np.array([sum(1 for x in cur if x == k) for k in cats], dtype=float) / len(cur)
    return _psi(r, c)


def psi_pvalue(ref, cur, stat, n_perm: int = N_PERM, seed: int = 0) -> float | None:
    """p-value ของ PSI ด้วย permutation test · stat(ref, cur) คืน PSI
    สลับสมาชิกระหว่างสองกลุ่มแบบสุ่ม (คงขนาดเดิม) แล้วนับว่า PSI ที่ได้ ≥ ค่าจริงกี่ครั้ง
    """
    ref, cur = [x for x in ref if x is not None], [x for x in cur if x is not None]
    observed = stat(ref, cur)
    if observed is None:
        return None
    pool = ref + cur
    rng = np.random.default_rng(seed)
    hits = 0
    for _ in range(n_perm):
        idx = rng.permutation(len(pool))
        a = [pool[i] for i in idx[:len(ref)]]
        b = [pool[i] for i in idx[len(ref):]]
        v = stat(a, b)
        if v is not None and v >= observed - 1e-12:
            hits += 1
    return round((hits + 1) / (n_perm + 1), 4)       # +1 กันค่า 0 (มาตรฐานของ permutation test)


def level(p: float | None) -> str | None:
    if p is None:
        return None
    return "stable" if p < STABLE else "moderate" if p < MODERATE else "significant"


def shift_period(p: str, months: int) -> str:
    y, m = int(p[:4]), int(p[5:7])
    t = y * 12 + (m - 1) + months
    return f"{t // 12:04d}-{t % 12 + 1:02d}"


def _bill_rows() -> list[dict]:
    """ฟีเจอร์ของบิลรายเดือนทุกใบ (รวมใบที่ยังไม่รู้ผล) คิด ณ วันออกบิลเหมือนตอนให้คะแนน"""
    from .risk import _load_bills     # import ช้าเพื่อให้ทดสอบฟังก์ชัน PSI ได้โดยไม่ต้องโหลดโมเดล
    today = db.today()
    out = []
    for bills in _load_bills().values():
        for i in range(1, len(bills)):
            b = bills[i]
            f = risk_features(b["since"], b["type_code"], bills[:i], b)
            if b["paid_date"] is not None:
                label = int(b["paid_date"] > b["due_date"])
            elif today > b["due_date"]:
                label = 1
            else:
                label = None
            f.update(period=str(b["period"]).strip(), label=label)
            out.append(f)
    return out


def _meter_ratios() -> dict[str, list[dict]]:
    """อัตราส่วนการใช้ต่อค่าเฉลี่ย 12 เดือนก่อนหน้าของแผงเดียวกัน (ต้องมีประวัติอย่างน้อย 3 เดือน)
    ไม่นับค่าที่ AI ทักไว้ (flagged) เพราะถูกตรวจแยกในขั้นตอนตรวจมิเตอร์แล้ว ถ้านับ ค่าผิดปกติไม่กี่แผงจะทำให้ทั้งเดือนดูเปลี่ยน
    """
    rows = db.fetch_all("SELECT stall_id, period, use_water, use_elec, flagged FROM meter_readings ORDER BY stall_id, period")
    by_stall: dict[str, list[dict]] = {}
    for r in rows:
        by_stall.setdefault(r["stall_id"], []).append(r)
    out = []
    for hist in by_stall.values():
        for i, r in enumerate(hist):
            prior = hist[max(0, i - REF_MONTHS):i]
            if len(prior) < 3 or r["flagged"]:
                continue
            mw, me = mean(h["use_water"] for h in prior), mean(h["use_elec"] for h in prior)
            out.append({"period": str(r["period"]).strip(),
                        "water": (r["use_water"] + 1) / (mw + 1), "elec": (r["use_elec"] + 1) / (me + 1)})
    return out


def _feature_block(ref: list[dict], cur: list[dict]) -> list[dict]:
    feats = []
    k = bins_for(len(cur))
    for name in NUMERIC:
        rv, cv = [r[name] for r in ref], [r[name] for r in cur]
        p, used = psi_numeric_k(rv, cv, k)
        pv = psi_pvalue(rv, cv, lambda a, b: psi_numeric(a, b, k))
        feats.append({"feature": name, "kind": "numeric", "psi": None if p is None else round(p, 4), "level": level(p),
                      "p_value": pv, "chance": pv is not None and pv >= ALPHA,
                      "bins": used, "noise_floor": noise_floor(used, len(rv), len(cv)),
                      "ref_mean": round(float(np.mean(rv)), 3) if rv else None,
                      "cur_mean": round(float(np.mean(cv)), 3) if cv else None})
    rv, cv = [r["stall_type"] for r in ref], [r["stall_type"] for r in cur]
    p = psi_categorical(rv, cv, TYPE_CODES)
    pv = psi_pvalue(rv, cv, lambda a, b: psi_categorical(a, b, TYPE_CODES))
    present = len(set(rv))

    def share(xs):
        return {c: round(sum(1 for x in xs if x == c) / len(xs), 3) for c in TYPE_CODES} if xs else {}

    feats.append({"feature": "stall_type", "kind": "categorical", "psi": None if p is None else round(p, 4), "level": level(p),
                  "p_value": pv, "chance": pv is not None and pv >= ALPHA,
                  "bins": present, "noise_floor": noise_floor(present, len(rv), len(cv)),
                  "ref_share": share(rv), "cur_share": share(cv)})
    assert {f["feature"] for f in feats} | {e["feature"] for e in EXCLUDED} == set(NUMERIC + CATEGORICAL)
    return feats


def build_report() -> dict:
    bills = _bill_rows()
    if not bills:
        return {"status": "empty", "message": "ยังไม่มีบิลรายเดือนพอจะเทียบ"}
    cur_p = max(b["period"] for b in bills)
    ref_from = shift_period(cur_p, -REF_MONTHS)
    ref = [b for b in bills if ref_from <= b["period"] < cur_p]
    cur = [b for b in bills if b["period"] == cur_p]
    rl = [b["label"] for b in ref if b["label"] is not None]
    cl = [b["label"] for b in cur if b["label"] is not None]
    feats = _feature_block(ref, cur) if ref and cur else []

    meters = _meter_ratios()
    meter_block = None
    if meters:
        mp = max(m["period"] for m in meters)
        mcur = [m for m in meters if m["period"] == mp]
        # เดือนเดียวกันของปีก่อน ๆ ตัดผลของฤดูกาลออก · ถ้ายังมีไม่พอ ใช้ 12 เดือนก่อนหน้าแล้วบอกผู้อ่าน
        same = [m for m in meters if m["period"] < mp and m["period"][5:] == mp[5:]]
        if len(same) >= MIN_SAME_MONTH:
            mref, kind = same, "same_month"
        else:
            mref, kind = [m for m in meters if shift_period(mp, -REF_MONTHS) <= m["period"] < mp], "rolling_12"
        k = bins_for(len(mcur))
        meter_block = {"period": mp, "reference_kind": kind, "ref_n": len(mref), "cur_n": len(mcur), "excludes_flagged": True,
                       "utilities": {}}
        for u in ("water", "elec"):
            rv, cv = [m[u] for m in mref], [m[u] for m in mcur]
            p, used = psi_numeric_k(rv, cv, k)
            pv = psi_pvalue(rv, cv, lambda a, b: psi_numeric(a, b, k))
            meter_block["utilities"][u] = {
                "psi": None if p is None else round(p, 4), "level": level(p),
                "p_value": pv, "chance": pv is not None and pv >= ALPHA,
                "bins": used, "noise_floor": noise_floor(used, len(mref), len(mcur)),
                "ref_mean": round(float(np.mean([m[u] for m in mref])), 3) if mref else None,
                "cur_mean": round(float(np.mean([m[u] for m in mcur])), 3) if mcur else None,
            }

    # ระดับรวม: นับเฉพาะตัวแปรที่เปลี่ยนเกินความบังเอิญ (p < 0.05) ตัวที่แยกจากความบังเอิญไม่ได้ถือว่าคงที่
    items = feats + (list(meter_block["utilities"].values()) if meter_block else [])
    levels = [("stable" if i.get("chance") else i["level"]) for i in items if i["level"]]
    order = {"stable": 0, "moderate": 1, "significant": 2}
    return {
        "status": "ok",
        "method": "psi", "bins": PSI_BINS, "thresholds": {"stable": STABLE, "moderate": MODERATE},
        "permutation": {"n": N_PERM, "alpha": ALPHA},
        "current": {"period": cur_p, "n": len(cur)},
        "reference": {"from": ref_from, "to": shift_period(cur_p, -1), "n": len(ref)},
        "small_sample": len(cur) < SMALL_N,
        "features": feats,
        "excluded": EXCLUDED,
        "label": {"ref_rate": round(float(np.mean(rl)), 4) if rl else None, "ref_n": len(rl),
                  "cur_rate": round(float(np.mean(cl)), 4) if cl else None, "cur_n": len(cl)},
        "meters": meter_block,
        "overall": max(levels, key=order.get) if levels else None,
    }


# ตารางเดียวกับที่ API สร้างใน migration v2 · สร้างเองด้วยเผื่อ ML ทำงานก่อน API ได้รัน migration
_TABLE_SQL = """CREATE TABLE IF NOT EXISTS drift_reports (
  id serial PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now(),
  model_type text NOT NULL, as_of date NOT NULL, report jsonb NOT NULL)"""


def run(triggered_by: str | None = None) -> dict:
    report = build_report()
    report["triggered_by"] = triggered_by
    as_of = db.today()
    with db.connect() as conn, conn.cursor() as cur:
        cur.execute(_TABLE_SQL)
        cur.execute("INSERT INTO drift_reports (model_type, as_of, report) VALUES ('risk', %s, %s) RETURNING id",
                    (as_of, json.dumps(report, ensure_ascii=False)))
        rid = cur.fetchone()["id"]
        conn.commit()
    return {"id": rid, **report}
