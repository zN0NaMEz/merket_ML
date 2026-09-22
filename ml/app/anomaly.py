"""ตรวจจับค่ามิเตอร์ผิดปกติ ก่อนออกบิล (กระบวนการ 3.0)

ใช้ 2 วิธีคู่กัน
  1) z-score เทียบประวัติของแผงเอง (12 เดือน) และแผงประเภทเดียวกัน (3 เดือน)
  2) Isolation Forest (unsupervised) เทรนจากเลขมิเตอร์ในอดีตทั้งหมด
     anomaly score อยู่ในช่วง 0-1 ยิ่งใกล้ 1 ยิ่งผิดปกติ (ปกติส่วนใหญ่อยู่ราว 0.4-0.55)
"""
from __future__ import annotations

import json
import os
import random
from collections import defaultdict
from datetime import datetime
from statistics import mean

import joblib
import numpy as np
from sklearn.ensemble import IsolationForest

from . import db
from .features import _sd, anomaly_vector, peer_stats

MODEL_PATH = os.path.join(db.MODEL_DIR, "anomaly.joblib")
INFO_PATH = os.path.join(db.MODEL_DIR, "anomaly_info.json")
_cache: dict = {}


def _load():
    rows = db.fetch_all("""
        SELECT m.stall_id, m.period, m.use_water, m.use_elec, m.cur_water, m.cur_elec, s.type_code
        FROM meter_readings m JOIN stalls s ON s.id = m.stall_id
        ORDER BY m.stall_id, m.period""")
    stalls = {s["id"]: s for s in db.fetch_all("SELECT id, type_code, init_water, init_elec FROM stalls")}
    by_stall, by_type = defaultdict(list), defaultdict(list)
    for r in rows:
        by_stall[r["stall_id"]].append(r)
        by_type[r["type_code"]].append(r)
    return stalls, by_stall, by_type


def _training_points(by_stall, by_type) -> list[list[float]]:
    pts = []
    for sid, ms in by_stall.items():
        for i in range(3, len(ms)):
            peer = peer_stats(by_type, ms[i]["type_code"], ms[i]["period"])
            if peer["n"] < 3:
                continue
            pts.append(anomaly_vector(ms[i]["use_water"], ms[i]["use_elec"], ms[max(0, i - 12):i], peer))
    return pts


def train() -> dict:
    _, by_stall, by_type = _load()
    pts = _training_points(by_stall, by_type)
    if len(pts) < 50:
        raise RuntimeError(f"เลขมิเตอร์ในอดีตไม่พอสำหรับเทรน (มี {len(pts)} จุด)")
    X = np.array(pts)
    model = IsolationForest(n_estimators=200, max_samples=min(256, len(X)), contamination="auto", random_state=42)
    model.fit(X)
    scores = -model.score_samples(X)
    rnd = random.Random(1)
    sample = rnd.sample(pts, min(600, len(pts)))
    info = {
        "trained_at": datetime.now().isoformat(timespec="seconds"),
        "n_train": len(pts),
        "n_estimators": 200,
        "score_p50": float(np.percentile(scores, 50)),
        "score_p95": float(np.percentile(scores, 95)),
        "score_p99": float(np.percentile(scores, 99)),
        "points": [[round(p[0], 3), round(p[1], 3)] for p in sample],
    }
    joblib.dump(model, MODEL_PATH)
    with open(INFO_PATH, "w", encoding="utf-8") as fh:
        json.dump(info, fh, ensure_ascii=False)
    _cache["model"], _cache["info"] = model, info
    db.save_model_run("anomaly", {k: v for k, v in info.items() if k != "points"})
    return info


def _ensure():
    if "model" in _cache:
        return
    if os.path.exists(MODEL_PATH) and os.path.exists(INFO_PATH):
        _cache["model"] = joblib.load(MODEL_PATH)
        with open(INFO_PATH, encoding="utf-8") as fh:
            _cache["info"] = json.load(fh)
    else:
        train()


def info() -> dict:
    _ensure()
    return _cache["info"]


def check(period: str, readings: list[dict], method: str = "both", z_threshold: float = 3.0, if_threshold: float = 0.62) -> list[dict]:
    _ensure()
    model = _cache["model"]
    stalls, by_stall, by_type = _load()
    out = []
    for rd in readings:
        sid = rd["stall_id"]
        hist = [m for m in by_stall.get(sid, []) if m["period"] < period][-12:]
        st = stalls[sid]
        prev_w = hist[-1]["cur_water"] if hist else st["init_water"]
        prev_e = hist[-1]["cur_elec"] if hist else st["init_elec"]
        res = {"stall_id": sid, "prev_water": prev_w, "prev_elec": prev_e, "anomaly": False, "kind": None, "reasons": [],
               "use_water": None, "use_elec": None, "z_water": None, "z_elec": None, "peer_z_water": None, "peer_z_elec": None,
               "if_score": None, "z_flag": False, "if_flag": False, "x": None}
        cw, ce = rd.get("cur_water"), rd.get("cur_elec")
        if cw is None or ce is None:
            res["kind"] = "pending"
            out.append(res)
            continue
        res["use_water"], res["use_elec"] = cw - prev_w, ce - prev_e
        if cw < prev_w or ce < prev_e:
            res.update(anomaly=True, kind="misread")
            res["reasons"].append(("เลขมิเตอร์น้ำ" if cw < prev_w else "เลขมิเตอร์ไฟ") + "น้อยกว่ารอบก่อน อาจจดผิดหรือมีการเปลี่ยนมิเตอร์")
            out.append(res)
            continue
        if len(hist) < 3:
            res["kind"] = "skip"
            res["reasons"].append("ประวัติไม่ถึง 3 เดือน ข้ามการตรวจ")
            out.append(res)
            continue
        uw, ue = res["use_water"], res["use_elec"]
        hw, he = [h["use_water"] for h in hist], [h["use_elec"] for h in hist]
        mw, me = mean(hw), mean(he)
        sw, se = max(_sd(hw), 0.08 * mw, 1), max(_sd(he), 0.08 * me, 1)
        peer = peer_stats(by_type, st["type_code"], period)
        zw, ze = (uw - mw) / sw, (ue - me) / se
        pzw = (uw - peer["mw"]) / max(peer["sw"], 0.1 * peer["mw"], 1)
        pze = (ue - peer["me"]) / max(peer["se"], 0.1 * peer["me"], 1)
        x = anomaly_vector(uw, ue, hist, peer)
        ifs = float(-model.score_samples(np.array([x]))[0])
        z_flag = abs(zw) > z_threshold or abs(ze) > z_threshold or abs(pzw) > z_threshold + 1 or abs(pze) > z_threshold + 1
        if_flag = ifs > if_threshold
        anomaly = z_flag if method == "z" else if_flag if method == "if" else (z_flag or if_flag)
        rw, re_ = (uw + 1) / (mw + 1), (ue + 1) / (me + 1)
        res.update(z_water=round(zw, 2), z_elec=round(ze, 2), peer_z_water=round(pzw, 2), peer_z_elec=round(pze, 2),
                   if_score=round(ifs, 3), z_flag=z_flag, if_flag=if_flag, anomaly=anomaly, kind="normal",
                   ratio_water=round(rw, 2), ratio_elec=round(re_, 2), mean_water=round(mw, 1), mean_elec=round(me, 1),
                   x=[round(x[0], 3), round(x[1], 3)])
        if anomaly:
            reasons = []
            if zw > z_threshold or rw >= 1.8:
                reasons.append(f"ใช้น้ำ {rw:.1f} เท่าของปกติ อาจมีท่อรั่ว")
                res["kind"] = "high"
            if ze > z_threshold or re_ >= 1.8:
                reasons.append(f"ใช้ไฟ {re_:.1f} เท่าของปกติ อาจมีไฟรั่วหรือต่ออุปกรณ์เพิ่ม")
                res["kind"] = "high"
            if ze < -z_threshold or re_ <= 0.4:
                reasons.append("ใช้ไฟต่ำกว่าปกติมาก อาจมีมิเตอร์เสียหรือลักลอบต่อไฟ")
                res["kind"] = "low"
            if zw < -z_threshold or rw <= 0.4:
                reasons.append("ใช้น้ำต่ำกว่าปกติมาก อาจมีมิเตอร์น้ำเสีย")
                res["kind"] = "low"
            if not reasons:
                reasons.append("รูปแบบการใช้ต่างจากประวัติและแผงประเภทเดียวกัน ควรตรวจซ้ำ")
                res["kind"] = "pattern"
            res["reasons"] = reasons
        out.append(res)
    return out
