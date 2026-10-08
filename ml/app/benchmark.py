"""วัดผลโมเดล (model evaluation) กับข้อมูลจำลองหลายชุด · ดู app/synthetic.py

ใช้โมเดลและขั้นตอนเดียวกับการเทรนจริงทุกประการ
  ความเสี่ยง: Logistic Regression, Random Forest, Extra Trees, Gradient Boosting, โมเดลรวม (risk._make_models / risk._ensemble)
             และเกณฑ์อ้างอิง "เดาตามสัดส่วน" (DummyClassifier)
             แบ่ง 75/25 แบบ stratified (random_state=42) + 5-fold CV · เกณฑ์ตัดสิน 0.5
  มิเตอร์:   z-score (เกณฑ์ 3), Isolation Forest (เกณฑ์ 0.62) และใช้ทั้งสองวิธี
             เทรน Isolation Forest จาก 60% ช่วงแรก แล้ววัดผลกับ 40% ช่วงหลัง (เหมือนใช้งานจริงที่ตรวจเดือนใหม่)
ผลถูกเก็บใน evaluation_batches + model_evaluations ไม่แตะโมเดลที่ใช้งานจริงและไม่เขียน model_runs

รันจากบรรทัดคำสั่ง (ไม่ต้องมีฐานข้อมูล):
  python -m app.benchmark                  พิมพ์ตารางผลวัด
  python -m app.benchmark --export DIR     เขียนข้อมูลจำลองทุกชุดเป็น CSV + datasets.json
  python -m app.benchmark --save           บันทึกผลลงฐานข้อมูล (ต้องตั้ง DATABASE_URL)
  python -m app.benchmark --experiment-js ../web/src/ai/experimentSample.js   ไฟล์ทดลองของหน้า "ทำนายจากไฟล์"
"""
from __future__ import annotations

import json
import sys
import time
import warnings
from collections import defaultdict

import numpy as np
from sklearn.dummy import DummyClassifier
from sklearn.ensemble import IsolationForest
from sklearn.metrics import (accuracy_score, average_precision_score, brier_score_loss, confusion_matrix, f1_score,
                             precision_score, recall_score, roc_auc_score)
from sklearn.model_selection import StratifiedKFold, cross_validate, train_test_split

from . import synthetic as S
from .features import CATEGORICAL, NUMERIC, anomaly_vector, peer_stats

RISK_MODELS = ["lr", "rf", "et", "gb", "ens", "baseline"]
ANOMALY_METHODS = ["z", "if", "both"]
Z_THRESHOLD, IF_THRESHOLD = 3.0, 0.62
PROTOCOL = {
    "risk": {"split": "stratified 75/25 random_state=42", "cv": "StratifiedKFold(5, shuffle, random_state=42)", "threshold": 0.5,
             "models": {"lr": "Logistic Regression", "rf": "Random Forest (300 ต้น)", "et": "Extra Trees (300 ต้น)",
                        "gb": "Gradient Boosting (HistGradientBoosting 100 รอบ)", "ens": "โมเดลรวม (เฉลี่ย LR + RF + GB)",
                        "baseline": "เดาตามสัดส่วน (DummyClassifier prior)"}},
    "anomaly": {"split": "เทรน Isolation Forest จาก 60% ช่วงแรก วัดผล 40% ช่วงหลัง", "z_threshold": Z_THRESHOLD, "if_threshold": IF_THRESHOLD,
                "methods": {"z": "z-score เทียบประวัติแผงและแผงประเภทเดียวกัน", "if": "Isolation Forest", "both": "ทักเมื่อวิธีใดวิธีหนึ่งเห็นว่าผิดปกติ"}},
}


def _r(v, d=4):
    return None if v is None or not np.isfinite(v) else round(float(v), d)


def _sd1(xs) -> float:
    xs = np.asarray(xs, dtype=float)
    return float(xs.std(ddof=1)) if len(xs) > 1 else 0.0


# ---------------- ความเสี่ยงจ่ายช้า ----------------

def _risk_models():
    from .risk import _ensemble, _make_models  # โมเดลชุดเดียวกับที่ใช้งานจริง
    m = _make_models()
    m["ens"] = _ensemble()
    m["baseline"] = DummyClassifier(strategy="prior")
    return m


def evaluate_risk(df) -> list[dict]:
    X, y = df[NUMERIC + CATEGORICAL], df["label"].to_numpy()
    if len(df) < 40 or len(set(y)) < 2:
        raise RuntimeError(f"ข้อมูลไม่พอ ({len(df)} แถว)")
    X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.25, stratify=y, random_state=42)
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    scoring = {"auc": "roc_auc", "precision": "precision", "recall": "recall", "f1": "f1", "accuracy": "accuracy",
               "brier": "neg_brier_score"}
    rows = []
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")        # เกณฑ์อ้างอิงทายบวกไม่เป็น precision จึงไม่นิยาม (คิดเป็น 0)
        for name in RISK_MODELS:
            model = _risk_models()[name]
            model.fit(X_tr, y_tr)
            p = model.predict_proba(X_te)[:, 1]
            pred = (p >= 0.5).astype(int)
            tn, fp, fn, tp = confusion_matrix(y_te, pred, labels=[0, 1]).ravel()
            cvr = cross_validate(_risk_models()[name], X, y, cv=cv, scoring=scoring)
            # ทุกโมเดลใช้พับเดียวกัน (random_state เดียวกัน) จึงเทียบรายพับแบบจับคู่ได้ · brier เก็บเป็นค่าบวก (ยิ่งต่ำยิ่งดี)
            cv_scores = {k: [_r(-v if k == "brier" else v) for v in cvr[f"test_{k}"]] for k in scoring}
            rows.append({
                "model": name,
                "auc": _r(roc_auc_score(y_te, p)) if len(set(y_te)) > 1 else None,
                # PR-AUC (average precision) บอกคุณภาพได้ดีกว่า AUC เมื่อกลุ่มที่สนใจมีน้อย · ค่าของการเดาสุ่ม = สัดส่วนกลุ่มนั้น
                "pr_auc": _r(average_precision_score(y_te, p)) if len(set(y_te)) > 1 else None,
                "precision": _r(precision_score(y_te, pred, zero_division=0)),
                "recall": _r(recall_score(y_te, pred, zero_division=0)),
                "f1": _r(f1_score(y_te, pred, zero_division=0)),
                "accuracy": _r(accuracy_score(y_te, pred)),
                "brier": _r(brier_score_loss(y_te, p)),
                "cv_auc_mean": _r(np.mean(cvr["test_auc"])),
                "cv_auc_std": _r(_sd1(cvr["test_auc"])),
                "extra": {"confusion": {"tn": int(tn), "fp": int(fp), "fn": int(fn), "tp": int(tp)}, "threshold": 0.5,
                          "n_train": int(len(X_tr)), "n_test": int(len(X_te)), "cv_scores": cv_scores,
                          "cv_brier_mean": _r(np.mean(cv_scores["brier"])), "cv_brier_std": _r(_sd1(cv_scores["brier"]))},
            })
    return rows


# ---------------- มิเตอร์ ----------------

def _z_scores(uw, ue, hist, peer):
    from .anomaly import _zmax, _zscores        # สูตรเดียวกับที่ใช้ตรวจจริง
    return _zmax(*_zscores(uw, ue, hist, peer))


def anomaly_rows(records: list[dict]) -> tuple[list[dict], list[str]]:
    """เวกเตอร์ของทุกการอ่านที่ตรวจได้ (มีประวัติ ≥ 3 เดือน และแผงประเภทเดียวกัน ≥ 3 ค่า) แบบเดียวกับ anomaly.check"""
    by_stall, by_type = defaultdict(list), defaultdict(list)
    for r in sorted(records, key=lambda x: (x["stall_id"], x["period"])):
        by_stall[r["stall_id"]].append(r)
        by_type[r["type_code"]].append(r)
    periods = sorted({r["period"] for r in records})
    out = []
    for ms in by_stall.values():
        for i in range(3, len(ms)):
            peer = peer_stats(by_type, ms[i]["type_code"], ms[i]["period"])
            if peer["n"] < 3:
                continue
            hist = ms[max(0, i - 12):i]
            uw, ue = ms[i]["use_water"], ms[i]["use_elec"]
            out.append({"period": ms[i]["period"], "label": ms[i]["label"], "kind": ms[i]["kind"],
                        "vec": anomaly_vector(uw, ue, hist, peer), "z": _z_scores(uw, ue, hist, peer)})
    return out, periods


def evaluate_anomaly(records: list[dict]) -> list[dict]:
    rows, periods = anomaly_rows(records)
    cut = periods[int(len(periods) * 0.6)]
    train = [r for r in rows if r["period"] < cut]
    test = [r for r in rows if r["period"] >= cut]
    X = np.array([r["vec"] for r in train])
    model = IsolationForest(n_estimators=200, max_samples=min(256, len(X)), contamination="auto", random_state=42).fit(X)
    s_if = -model.score_samples(np.array([r["vec"] for r in test]))
    z = np.array([r["z"] for r in test])
    y = np.array([r["label"] for r in test])
    methods = {
        "z": (z > Z_THRESHOLD, z),
        "if": (s_if > IF_THRESHOLD, s_if),
        # คะแนนรวม = ค่าที่เกินเกณฑ์มากที่สุดของสองวิธี (หารด้วยเกณฑ์ของแต่ละวิธี) ใช้คิด AUC
        "both": ((z > Z_THRESHOLD) | (s_if > IF_THRESHOLD), np.maximum(z / Z_THRESHOLD, s_if / IF_THRESHOLD)),
    }
    out = []
    for name in ANOMALY_METHODS:
        flag, score = methods[name]
        pred = flag.astype(int)
        tn, fp, fn, tp = confusion_matrix(y, pred, labels=[0, 1]).ravel()
        kinds = defaultdict(lambda: [0, 0])          # recall แยกชนิดค่าผิดปกติ: สูงผิดปกติ / ต่ำผิดปกติ
        for lab, k, f in zip(y, (r["kind"] for r in test), pred):
            if lab:
                g = k.split("_")[0]
                kinds[g][0] += int(f)
                kinds[g][1] += 1
        out.append({
            "model": name,
            "auc": _r(roc_auc_score(y, score)) if len(set(y)) > 1 else None,
            "pr_auc": _r(average_precision_score(y, score)) if len(set(y)) > 1 else None,
            "precision": _r(precision_score(y, pred, zero_division=0)),
            "recall": _r(recall_score(y, pred, zero_division=0)),
            "f1": _r(f1_score(y, pred, zero_division=0)),
            "accuracy": _r(accuracy_score(y, pred)),
            "brier": None, "cv_auc_mean": None, "cv_auc_std": None,
            "extra": {"confusion": {"tn": int(tn), "fp": int(fp), "fn": int(fn), "tp": int(tp)},
                      "false_alarms_per_100": _r(100 * fp / len(y), 2), "n_train": int(len(train)), "n_test": int(len(test)),
                      "recall_by_kind": {k: _r(v[0] / v[1]) for k, v in kinds.items() if v[1]},
                      "threshold": {"z": Z_THRESHOLD, "if": IF_THRESHOLD}},
        })
    return out, len(test), float(y.mean()) if len(y) else 0.0


# ---------------- รันทั้งชุด ----------------

def run_all(progress=None) -> tuple[list[dict], list[dict]]:
    """คืน (ข้อมูลประจำชุด, ผลวัดทุกแถว) · progress(done, total, label) ถูกเรียกหลังแต่ละชุด"""
    total = len(S.RISK_SCENARIOS) + len(S.METER_SCENARIOS)
    datasets, results, done = [], [], 0
    for sc in S.RISK_SCENARIOS:
        t0 = time.time()
        df = S.risk_dataset(sc)
        rows = evaluate_risk(df)
        datasets.append({**S.describe(sc), "task": "risk", "n_rows": int(len(df)), "positive_rate": _r(df["label"].mean()),
                         "n_test": rows[0]["extra"]["n_test"]})
        for r in rows:
            results.append({"task": "risk", "dataset": sc.key, "n_rows": int(len(df)), "positive_rate": _r(df["label"].mean()), **r})
        done += 1
        if progress:
            progress(done, total, f"risk/{sc.key} {time.time() - t0:.1f}s")
    for sc in S.METER_SCENARIOS:
        t0 = time.time()
        recs = S.meter_records(sc)
        rows, n_test, test_rate = evaluate_anomaly(recs)
        # n_rows/positive_rate = ทั้งชุด (ตรงกับไฟล์ CSV) · n_test/test_positive_rate = ช่วงที่ใช้วัดผล
        total_rate = _r(np.mean([x["label"] for x in recs]))
        datasets.append({**S.describe(sc), "task": "anomaly", "n_rows": len(recs), "positive_rate": total_rate,
                         "n_test": n_test, "test_positive_rate": _r(test_rate)})
        for r in rows:
            results.append({"task": "anomaly", "dataset": sc.key, "n_rows": len(recs), "positive_rate": total_rate, **r})
        done += 1
        if progress:
            progress(done, total, f"anomaly/{sc.key} {time.time() - t0:.1f}s")
    return datasets, results


# ---------------- ฐานข้อมูล ----------------

# ตารางเดียวกับที่ API สร้างใน migration v4 · ML สร้างเองด้วยเผื่อทำงานก่อน API ได้รัน migration
TABLE_SQL = """
CREATE TABLE IF NOT EXISTS evaluation_batches (
  id serial PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','done','failed')),
  progress int NOT NULL DEFAULT 0, total int, triggered_by text, error text, settings jsonb
);
CREATE TABLE IF NOT EXISTS model_evaluations (
  id serial PRIMARY KEY, batch_id int NOT NULL REFERENCES evaluation_batches(id) ON DELETE CASCADE,
  task text NOT NULL CHECK (task IN ('risk','anomaly')), dataset text NOT NULL, model text NOT NULL,
  n_rows int, positive_rate real, auc real, pr_auc real, precision real, recall real, f1 real, accuracy real, brier real,
  cv_auc_mean real, cv_auc_std real, extra jsonb, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (batch_id, task, dataset, model)
);
"""
STALE_MINUTES = 30      # ชุดที่ค้างสถานะ running นานกว่านี้ถือว่าล้ม (เช่นเซิร์ฟเวอร์รีสตาร์ทกลางทาง)


def start_batch(triggered_by: str | None) -> dict:
    """สร้างชุดการทดสอบใหม่ หรือคืนชุดที่กำลังรันอยู่ (กันกดซ้ำแล้วรันซ้อน)"""
    from . import db
    with db.connect() as conn, conn.cursor() as cur:
        cur.execute(TABLE_SQL)
        cur.execute(f"""UPDATE evaluation_batches SET status = 'failed', error = 'หยุดกลางทาง (เกิน {STALE_MINUTES} นาที)', finished_at = now()
                        WHERE status = 'running' AND created_at < now() - interval '{STALE_MINUTES} minutes'""")
        cur.execute("SELECT id, status, progress, total FROM evaluation_batches WHERE status = 'running' ORDER BY id DESC LIMIT 1")
        running = cur.fetchone()
        if running:
            conn.commit()
            return {**running, "already_running": True}
        total = len(S.RISK_SCENARIOS) + len(S.METER_SCENARIOS)
        cur.execute("INSERT INTO evaluation_batches (status, total, triggered_by, settings) VALUES ('running', %s, %s, %s) RETURNING id",
                    (total, triggered_by, json.dumps({"protocol": PROTOCOL}, ensure_ascii=False)))
        bid = cur.fetchone()["id"]
        conn.commit()
    return {"id": bid, "status": "running", "progress": 0, "total": total, "already_running": False}


def execute(batch_id: int) -> None:
    """รันทุกชุดแล้วบันทึกผล (เรียกใน background ของ ML service)"""
    from . import db

    def progress(done, total, label):
        print(f"[benchmark {batch_id}] {done}/{total} {label}", flush=True)
        with db.connect() as conn, conn.cursor() as cur:
            cur.execute("UPDATE evaluation_batches SET progress = %s WHERE id = %s", (done, batch_id))
            conn.commit()

    try:
        datasets, results = run_all(progress)
        with db.connect() as conn, conn.cursor() as cur:
            for r in results:
                cur.execute("""INSERT INTO model_evaluations (batch_id, task, dataset, model, n_rows, positive_rate, auc, pr_auc, precision,
                                 recall, f1, accuracy, brier, cv_auc_mean, cv_auc_std, extra)
                               VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                            (batch_id, r["task"], r["dataset"], r["model"], r["n_rows"], r["positive_rate"], r["auc"], r["pr_auc"], r["precision"],
                             r["recall"], r["f1"], r["accuracy"], r["brier"], r["cv_auc_mean"], r["cv_auc_std"],
                             json.dumps(r["extra"], ensure_ascii=False)))
            cur.execute("""UPDATE evaluation_batches SET status = 'done', finished_at = now(), progress = total,
                             settings = %s WHERE id = %s""",
                        (json.dumps({"protocol": PROTOCOL, "datasets": datasets}, ensure_ascii=False), batch_id))
            conn.commit()
    except Exception as e:                          # บันทึกว่าล้ม หน้าเว็บจะแสดงข้อความนี้
        with db.connect() as conn, conn.cursor() as cur:
            cur.execute("UPDATE evaluation_batches SET status = 'failed', error = %s, finished_at = now() WHERE id = %s",
                        (str(e)[:500], batch_id))
            conn.commit()
        print(f"[benchmark {batch_id}] ล้ม: {e}", flush=True)


# ---------------- บรรทัดคำสั่ง ----------------

def _fmt(v):
    return "–" if v is None else f"{v:.3f}"


def _print_tables(datasets, results):
    titles = {(d["task"], d["key"]): d["title"] for d in datasets}
    print("\n## ความเสี่ยงจ่ายช้า (ชุดทดสอบ 25%, เกณฑ์ 0.5)\n")
    print("| ชุดข้อมูล | โมเดล | AUC | PR-AUC | CV AUC ± SD | Precision | Recall | F1 | Accuracy | Brier |")
    print("|---|---|---|---|---|---|---|---|---|---|")
    for r in (x for x in results if x["task"] == "risk"):
        print(f"| {titles[('risk', r['dataset'])]} | {r['model']} | {_fmt(r['auc'])} | {_fmt(r['pr_auc'])} | {_fmt(r['cv_auc_mean'])} ± {_fmt(r['cv_auc_std'])} "
              f"| {_fmt(r['precision'])} | {_fmt(r['recall'])} | {_fmt(r['f1'])} | {_fmt(r['accuracy'])} | {_fmt(r['brier'])} |")
    print("\n## ตรวจค่ามิเตอร์ผิดปกติ (40% ช่วงหลัง)\n")
    print("| ชุดข้อมูล | วิธี | Precision | Recall | F1 | AUC | PR-AUC | ทักผิด/100 ค่า |")
    print("|---|---|---|---|---|---|---|---|")
    for r in (x for x in results if x["task"] == "anomaly"):
        print(f"| {titles[('anomaly', r['dataset'])]} | {r['model']} | {_fmt(r['precision'])} | {_fmt(r['recall'])} | {_fmt(r['f1'])} "
              f"| {_fmt(r['auc'])} | {_fmt(r['pr_auc'])} | {r['extra']['false_alarms_per_100']} |")


def export(directory: str) -> list[str]:
    """เขียนข้อมูลจำลองทุกชุดเป็น CSV (ใช้เทรน/ตรวจนอกระบบได้) พร้อม datasets.json"""
    import csv
    import os
    os.makedirs(directory, exist_ok=True)
    written, meta = [], []
    for sc in S.RISK_SCENARIOS:
        df = S.risk_dataset(sc)
        path = os.path.join(directory, f"risk_{sc.key}.csv")
        df[["bill_id", "due", *NUMERIC, *CATEGORICAL, "n_prior", "label"]].round(4).to_csv(path, index=False)
        meta.append({**S.describe(sc), "task": "risk", "file": os.path.basename(path), "rows": int(len(df)),
                     "positive_rate": _r(df["label"].mean())})
        written.append(path)
    for sc in S.METER_SCENARIOS:
        recs = S.meter_records(sc)
        path = os.path.join(directory, f"meters_{sc.key}.csv")
        with open(path, "w", newline="", encoding="utf-8") as fh:
            w = csv.DictWriter(fh, fieldnames=list(recs[0]))
            w.writeheader()
            w.writerows(recs)
        meta.append({**S.describe(sc), "task": "anomaly", "file": os.path.basename(path), "rows": len(recs),
                     "positive_rate": _r(np.mean([r["label"] for r in recs]))})
        written.append(path)
    with open(os.path.join(directory, "datasets.json"), "w", encoding="utf-8") as fh:
        json.dump(meta, fh, ensure_ascii=False, indent=2, default=str)
    return written


if __name__ == "__main__":
    # คอนโซลของ Windows ใช้ cp874 ซึ่งไม่มีบางตัวอักษร (เช่น ±) จึงบังคับ UTF-8
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8")
    args = sys.argv[1:]
    if "--experiment-js" in args:
        target = args[args.index("--experiment-js") + 1]
        with open(target, "w", encoding="utf-8", newline="\n") as fh:
            fh.write(S.experiment_js(S.experiment_rows()))
        print("เขียน", target)
    elif "--export" in args:
        target = args[args.index("--export") + 1]
        for p in export(target):
            print("เขียน", p)
    elif "--save" in args:
        b = start_batch("บรรทัดคำสั่ง (python -m app.benchmark --save)")
        execute(b["id"])
        print("บันทึกผลเป็นชุดที่", b["id"])
    else:
        ds, res = run_all(lambda d, t, label: print(f"{d}/{t} {label}", file=sys.stderr, flush=True))
        _print_tables(ds, res)
