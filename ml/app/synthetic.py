"""ข้อมูลจำลองหลายชุดสำหรับเทรนและวัดผลโมเดล (model evaluation)

แต่ละชุดคือ "สถานการณ์" ของตลาดที่ต่างกัน สร้างจาก seed คงที่ จึงได้ข้อมูลเดิมทุกครั้ง (ทำซ้ำได้)
ไม่แตะฐานข้อมูลของระบบเลย ข้อมูลถูกสร้างในหน่วยความจำแล้วส่งเข้าขั้นตอนเดียวกับข้อมูลจริง
  - ความเสี่ยงจ่ายช้า: สร้างบิลรายเดือนของผู้ค้า แล้วใช้ risk.build_dataset ติดป้ายและคิดฟีเจอร์ (ชุดเดียวกับที่เทรนจริง)
  - มิเตอร์: สร้างการใช้น้ำ/ไฟรายเดือน แล้วใส่ค่าผิดปกติที่ "รู้คำตอบ" ไว้ จึงวัด precision/recall ของการทักได้

กลไกการจ่ายช้าเลียนแบบตัวสร้างข้อมูลสาธิต (api/src/seed/generator.js)
  logit = ฐาน + 4.2·(0.5 − วินัย) + 0.3·ครั้งที่ช้า + 2.2·(ยอดบิล/ปกติ − 1) + ความเสี่ยงประเภทแผง + ฤดู + ระยะเวลาเช่า + สุ่ม
แต่ละสถานการณ์ปรับตัวคูณของบางพจน์ เพื่อดูว่าโมเดลรับมือแบบไหนได้ดีหรือไม่ดี

ชุดที่ "ออกแบบให้โมเดลต่างกัน" (mechanism ≠ additive) เพิ่มพจน์พิเศษที่โมเดลเส้นตรงแสดงไม่ได้ แล้วปิดผลหลักที่บังพจน์นั้น
  interaction  ยอดบิลสูงทำให้ผู้ค้าใหม่จ่ายช้า แต่ผู้ค้าเก่ากลับจ่ายตรงขึ้น (ผลสองทางหักล้างกันเมื่อมองทีละปัจจัย)
  u_shape      ยอดบิลผิดปกติทั้งสูงและต่ำทำให้จ่ายช้า (เส้นตรงลากได้ทางเดียว)
  type_season  แต่ละประเภทแผงช้าในฤดูต่างกัน (ต้องดูประเภทกับฤดูคู่กัน)
ทุกชุดเขียนสมมติฐานไว้ (expect = โมเดลที่คาดว่าชนะ) หน้าเว็บบอกว่าผลจริงตรงกับสมมติฐานหรือไม่
"""
from __future__ import annotations

import math
from dataclasses import asdict, dataclass
from datetime import date, timedelta

import numpy as np

from .features import risk_features

# ค่าเดียวกับ api/src/lib/constants.js (ใช้เฉพาะสร้างข้อมูลจำลอง)
TYPES = {
    "fresh":   {"count": 8, "rent": 3000, "w": 16, "e": 110, "risk": 0.0},
    "cooked":  {"count": 7, "rent": 3500, "w": 13, "e": 210, "risk": 0.15},
    "produce": {"count": 7, "rent": 2500, "w": 7,  "e": 55,  "risk": 0.25},
    "dry":     {"count": 6, "rent": 2800, "w": 3,  "e": 85,  "risk": -0.3},
    "clothes": {"count": 7, "rent": 2200, "w": 2,  "e": 40,  "risk": 0.45},
}
SEASON_EFF = {"festival": -0.5, "school": 0.45, "rainy": 0.35, "normal": 0.0}
WATER_RATE, ELEC_RATE, PAY_WITHIN_DAYS = 18, 8, 10
ANCHOR = date(2026, 10, 1)          # วันอ้างอิงคงที่ ข้อมูลจึงไม่เปลี่ยนตามวันที่รัน


@dataclass(frozen=True)
class RiskScenario:
    key: str
    title: str
    description: str
    seed: int
    n_vendors: int = 32
    months: int = 17
    bad_share: float = 0.16        # สัดส่วนผู้ค้าวินัยต่ำ
    new_share: float = 0.16        # สัดส่วนผู้ค้าใหม่ (เช่าไม่ถึงปีครึ่ง)
    intercept: float = -1.2
    k_discipline: float = 1.0
    k_history: float = 1.0
    k_ratio: float = 1.0
    k_season: float = 1.0
    noise_sd: float = 0.35
    shock_p: float = 0.0           # โอกาสที่บิลเดือนหนึ่งยอดพุ่ง
    shock_range: tuple = (1.4, 2.2)
    drop_p: float = 0.0            # โอกาสที่บิลเดือนหนึ่งยอดลดฮวบ (ปิดร้านบางวัน มิเตอร์เสีย)
    drop_range: tuple = (0.35, 0.7)
    k_type: float = 1.0            # ผลของประเภทแผงแบบเดี่ยว ๆ
    mechanism: str = "additive"    # additive | interaction | u_shape | type_season
    k_signal: float = 0.0          # ความแรงของพจน์พิเศษตาม mechanism
    expect: tuple = ()             # โมเดลที่คาดว่าชนะ (ว่าง = ไม่ได้ออกแบบให้ต่าง)
    expect_metric: str = "cv_auc"  # ตัวชี้วัดที่ใช้ตัดสินสมมติฐาน: cv_auc (สูงดี) | cv_brier (ต่ำดี)
    hypothesis: str = ""
    behavior: bool = False         # จำลองพฤติกรรมการจ่าย (ดู behave()) · ชุดเดิมปิดไว้ ข้อมูลจึงเหมือนเดิมทุกไบต์
    sharp: float = 1.0             # คูณ logit: > 1 = ความบังเอิญต่ำ (โปรไฟล์ "ชัดเจน" ของข้อมูลสาธิตใช้ 3)


@dataclass(frozen=True)
class MeterScenario:
    key: str
    title: str
    description: str
    seed: int
    n_stalls: int = 35
    months: int = 24
    noise_w: float = 0.12
    noise_e: float = 0.10
    season_amp: float = 1.0        # 1 = ฤดูกาลเท่าข้อมูลสาธิต
    anomaly_rate: float = 0.04     # สัดส่วนค่าผิดปกติ (หลังเดือนที่ 3)
    high_range: tuple = (2.5, 4.0) # ท่อรั่ว/ไฟรั่ว: คูณการใช้
    low_range: tuple = (0.05, 0.3) # มิเตอร์เสีย/ลักลอบต่อ: คูณการใช้
    low_share: float = 0.3         # ส่วนของค่าผิดปกติที่เป็นแบบ "ต่ำผิดปกติ"
    pattern: bool = False          # ค่าผิดปกติแบบ "น้ำขึ้นนิด ไฟลงหน่อย" พร้อมกัน แทนการพุ่งทางเดียว
    pattern_range: tuple = (1.15, 1.22)
    growth_share: float = 0.0      # สัดส่วนแผงที่กิจการโตต่อเนื่อง (ไม่ใช่ค่าผิดปกติ)
    growth_rate: float = 0.0       # อัตราโตต่อเดือนของแผงเหล่านั้น
    expect: tuple = ()
    expect_metric: str = "f1"
    hypothesis: str = ""


RISK_SCENARIOS: list[RiskScenario] = [
    RiskScenario("baseline", "ตลาดปกติ", "พฤติกรรมเหมือนข้อมูลสาธิตของระบบ ผู้ค้า 32 ราย ประวัติ 17 เดือน", seed=101),
    RiskScenario("noisy", "พฤติกรรมสุ่มมาก", "การจ่ายช้าขึ้นกับโชคมากกว่าประวัติ สัญญาณที่โมเดลเรียนได้อ่อน", seed=102,
                 k_discipline=0.45, k_history=0.5, noise_sd=1.4),
    RiskScenario("rare_late", "จ่ายช้าน้อย (ข้อมูลไม่สมดุล)", "จ่ายช้าราว 1 ใน 10 บิล ทดสอบ precision/recall เมื่อกลุ่มที่สนใจมีน้อย", seed=103,
                 intercept=-2.3, bad_share=0.1),
    RiskScenario("seasonal", "ฤดูกาลมีผลแรง", "หน้าฝนและเปิดเทอมจ่ายช้ามาก เทศกาลจ่ายตรง ผลของฤดูแรงกว่าปกติ 3 เท่า", seed=104,
                 k_season=3.0),
    RiskScenario("bill_shock", "ยอดบิลพุ่งทำให้จ่ายช้า", "บิล 15% มียอดน้ำไฟพุ่ง 1.4–2.2 เท่า และยอดที่สูงขึ้นมีผลต่อการจ่ายช้ามาก", seed=105,
                 shock_p=0.15, k_ratio=2.5),
    RiskScenario("new_market", "ผู้ค้าใหม่จำนวนมาก", "60% ของผู้ค้าเช่ามาไม่ถึงปีครึ่ง และเก็บประวัติแค่ 12 เดือน ฟีเจอร์จากประวัติจึงมีข้อมูลน้อย", seed=106,
                 new_share=0.6, months=12),
    RiskScenario("large", "ตลาดใหญ่", "ผู้ค้า 120 ราย ประวัติ 24 เดือน ดูว่าข้อมูลมากขึ้นช่วยให้แม่นขึ้นแค่ไหน", seed=107,
                 n_vendors=120, months=24),
    # ---- ออกแบบให้โมเดลต่างกัน ----
    RiskScenario("interaction", "ยอดบิลส่งผลกลับทางกัน", "ยอดบิลสูงทำให้ผู้ค้าใหม่ (เช่าไม่ถึง 2 ปี) จ่ายช้า แต่ผู้ค้าเก่ากลับจ่ายตรงขึ้น "
                 "ผู้ค้า 80 ราย ครึ่งหนึ่งเป็นผู้ค้าใหม่", seed=108,
                 n_vendors=80, months=20, new_share=0.5, shock_p=0.2, drop_p=0.2, k_discipline=0.2, k_history=0, k_ratio=0,
                 k_season=0, k_type=0, mechanism="interaction", k_signal=12.0,
                 expect=("rf",), hypothesis="ผลของยอดบิลกลับทิศตามระยะเวลาเช่า เส้นตรงเห็นผลรวมเป็นศูนย์ ต้นไม้แยกกลุ่มก่อนแล้วดูยอดบิลได้"),
    RiskScenario("u_shape", "ยอดบิลผิดปกติทั้งสองทาง", "บิลที่สูงหรือต่ำกว่าปกติมากจ่ายช้าทั้งคู่ (เช่น ร้านปิดบางวันเพราะขายไม่ดี) "
                 "ผู้ค้า 80 ราย", seed=109,
                 n_vendors=80, months=20, shock_p=0.2, drop_p=0.2, k_discipline=0.2, k_history=0, k_ratio=0, k_season=0, k_type=0,
                 mechanism="u_shape", k_signal=12.0,
                 expect=("rf",), hypothesis="ความสัมพันธ์เป็นรูปตัว U เส้นตรงลากได้ทางเดียว ต้นไม้ตัดได้สองฝั่ง"),
    RiskScenario("type_season", "ประเภทแผงช้าคนละฤดู", "ผักผลไม้ช้าหน้าฝน เสื้อผ้าช้าช่วงเปิดเทอม อาหารปรุงสุกช้าช่วงเทศกาล "
                 "ที่เหลือจ่ายตรง ผู้ค้า 80 ราย", seed=110,
                 n_vendors=80, months=24, k_discipline=0.4, k_history=0, k_ratio=0, k_season=0, k_type=0,
                 mechanism="type_season", k_signal=3.0,
                 expect=("rf",), hypothesis="ต้องดูประเภทแผงคู่กับฤดู Logistic Regression ไม่มีพจน์ร่วม จึงเห็นแค่ค่าเฉลี่ยของแต่ละฝั่ง"),
    # ---- ข้อมูลที่มีสัญญาณพฤติกรรม / ความบังเอิญต่ำ (ไม่มีสมมติฐาน LR/RF) ----
    RiskScenario("behavior", "พฤติกรรมการจ่ายบอกวินัย", "เหมือนตลาดปกติ แต่ผู้ค้าวินัยดีจ่ายเร็วกว่า เปิดดูบิลในแอปบ่อยกว่า "
                 "และจ่ายผ่านแอปมากกว่า (สมมติฐานเดียวกับข้อมูลสาธิตของระบบ) ปัจจัยพฤติกรรมจึงบอกวินัยที่ซ่อนอยู่ได้บางส่วน", seed=112,
                 behavior=True),
    RiskScenario("clear", "ความบังเอิญต่ำ (โปรไฟล์ชัดเจน)", "พฤติกรรมเดียวกับชุดก่อนหน้า แต่ผลจ่ายช้าขึ้นกับปัจจัยมากขึ้น 3 เท่า "
                 "(logit × 3) แทบไม่มีโชคเข้ามาเกี่ยว ใช้ดูว่าโมเดลทำได้แค่ไหนเมื่อข้อมูลชัด ไม่ใช่ภาพของตลาดจริง", seed=113,
                 behavior=True, sharp=3.0),
    RiskScenario("linear_small", "ข้อมูลน้อยแต่ตรงไปตรงมา", "ผู้ค้า 12 ราย ประวัติ 10 เดือน ความเสี่ยงเพิ่มตามประวัติและยอดบิลแบบเส้นตรง", seed=111,
                 n_vendors=12, months=10, k_history=2.0, k_ratio=2.0, shock_p=0.15, noise_sd=0.6,
                 expect=("lr",), expect_metric="cv_brier",
                 hypothesis="ข้อมูลน้อยและเป็นเส้นตรง Logistic Regression ให้ความน่าจะเป็นที่ตรงกว่า (Brier ต่ำกว่า) "
                            "ส่วน Random Forest เฉลี่ยจากใบไม้ที่มีบิลไม่กี่ใบ ความน่าจะเป็นจึงหยาบกว่า"),
]

METER_SCENARIOS: list[MeterScenario] = [
    MeterScenario("baseline", "ค่าผิดปกติชัดเจน", "ค่าผิดปกติราว 4% ใช้มากขึ้น 2.5–4 เท่า หรือน้อยลงเหลือ 5–30%", seed=201),
    MeterScenario("subtle", "ผิดปกติแบบแนบเนียน", "ค่าผิดปกติแค่ 1.4–1.9 เท่า หรือเหลือ 40–60% ใกล้ช่วงปกติ จับยาก", seed=202,
                  high_range=(1.4, 1.9), low_range=(0.4, 0.6)),
    MeterScenario("noisy", "การใช้แกว่งมาก", "การใช้ปกติแกว่ง ±30% (ข้อมูลสาธิต ±10–12%) เสี่ยงทักผิดบ่อย", seed=203,
                  noise_w=0.3, noise_e=0.3),
    MeterScenario("seasonal", "ฤดูกาลแรง", "หน้าร้อนใช้ไฟเพิ่มเกือบเท่าตัว การใช้ที่สูงตามฤดูไม่ใช่ความผิดปกติ", seed=204,
                  season_amp=3.0),
    MeterScenario("many", "ค่าผิดปกติมาก", "ค่าผิดปกติราว 12% ประวัติของแผงเองจึงปนค่าผิดปกติด้วย", seed=205,
                  anomaly_rate=0.12),
    # ---- ออกแบบให้วิธีตรวจต่างกัน ----
    MeterScenario("pattern", "น้ำกับไฟขยับสวนทางกัน", "ค่าผิดปกติคือน้ำขึ้นและไฟลงพร้อมกัน (หรือกลับกัน) 1.25–1.35 เท่า "
                  "แต่ละค่ายังไม่ไกลจากช่วงปกติมาก การใช้ปกติแกว่งน้อย ±3%", seed=206,
                  noise_w=0.03, noise_e=0.03, pattern=True, pattern_range=(1.25, 1.35), anomaly_rate=0.05,
                  expect=("if", "both"), hypothesis="z-score ดูน้ำกับไฟแยกกัน แต่ละค่าจึงมักไม่เกินเกณฑ์ "
                                                    "วิธีที่มี Isolation Forest ดูน้ำกับไฟพร้อมกัน จึงเห็นว่าการขยับสวนทางเป็นรูปแบบแปลก"),
    MeterScenario("growth", "ร้านขยายกิจการ", "40% ของแผงใช้น้ำไฟเพิ่มขึ้น 4% ทุกเดือนเพราะขายดีขึ้น ซึ่งไม่ใช่ความผิดปกติ "
                  "ค่าผิดปกติจริงเหมือนชุดผิดปกติชัดเจน", seed=207,
                  growth_share=0.4, growth_rate=0.04,
                  expect=("if",), hypothesis="z-score เทียบกับค่าเฉลี่ย 12 เดือนที่ตามไม่ทันการเติบโต จึงทักร้านที่โตผิด "
                                             "Isolation Forest เรียนจากรูปแบบน้ำ–ไฟของทั้งตลาดจึงทักผิดน้อยกว่า"),
]


def _type_list(n: int, rng) -> list[str]:
    """แจกประเภทแผงตามสัดส่วนจำนวนแผงจริงของตลาด"""
    codes = list(TYPES)
    weights = np.array([TYPES[c]["count"] for c in codes], dtype=float)
    base = [c for c in codes for _ in range(TYPES[c]["count"])]
    if n <= len(base):
        return [base[i] for i in sorted(rng.choice(len(base), n, replace=False))]
    return base + list(rng.choice(codes, n - len(base), p=weights / weights.sum()))


def _periods(months: int) -> list[str]:
    """รอบบิล months เดือน จบที่เดือนก่อนหน้า ANCHOR (บิลรอบสุดท้ายออกวัน ANCHOR)"""
    y, m = ANCHOR.year, ANCHOR.month - 1
    out = []
    for _ in range(months):
        if m < 1:
            y, m = y - 1, 12
        out.append(f"{y}-{m:02d}")
        m -= 1
    return out[::-1]


def _first_of_next(p: str) -> date:
    y, m = int(p[:4]), int(p[5:7])
    return date(y + (m == 12), 1 if m == 12 else m + 1, 1)


def _sigmoid(x: float) -> float:
    return 1 / (1 + math.exp(-x))


# ประเภทแผง × ฤดูที่จ่ายช้า (ชุด type_season): ช่องที่ไม่อยู่ในตารางจ่ายตรงกว่าปกติเล็กน้อย
TYPE_SEASON = {("produce", "rainy"): 1.0, ("clothes", "school"): 1.0, ("cooked", "festival"): 1.0, ("fresh", "rainy"): 0.6}


def special_term(sc: RiskScenario, f: dict, code: str) -> float:
    """พจน์พิเศษของชุดที่ออกแบบให้โมเดลต่างกัน (additive = 0)"""
    ratio, tenure = f["bill_ratio"], f["tenure_years"]
    if sc.mechanism == "interaction":
        # ยอดบิลสูงขึ้น: ผู้ค้าใหม่ช้าขึ้น ผู้ค้าเก่าจ่ายตรงขึ้น
        return sc.k_signal * (ratio - 1) * (1 if tenure < 2 else -1)
    if sc.mechanism == "u_shape":
        # ห่างจากยอดปกติทางไหนก็ช้าขึ้น (log ทำให้สูง 1.5 เท่ากับต่ำ 1/1.5 มีผลเท่ากัน) ลบค่ากลางเพื่อคุมสัดส่วนจ่ายช้า
        return sc.k_signal * (abs(math.log(max(ratio, 1e-3))) - 0.12)
    if sc.mechanism == "type_season":
        return sc.k_signal * (TYPE_SEASON.get((code, f["season"]), -0.25))
    return 0.0


# ---- พฤติกรรมการจ่าย (สมมติฐานเดียวกับ api/src/seed/generator.js และ services/billing.js · ตั้งไว้ก่อนวัดผล ไม่ปรับให้ชนะ) ----
def APP_P(d: float) -> float:
    """โอกาสที่ผู้ค้าจ่ายผ่านแอป (ไม่ใช่เงินสดที่สำนักงาน)"""
    return 0.25 + 0.60 * d


def ontime_day(u: float, d: float) -> int:
    """วันที่จ่ายนับจากวันออกบิล (0..9) เมื่อจ่ายตรงเวลา: วินัยดีจ่ายเร็ว u^(0.6 + 2.4d) เอียงไปทางวันแรก ๆ"""
    return min(PAY_WITHIN_DAYS - 1, int(PAY_WITHIN_DAYS * u ** (0.6 + 2.4 * d)))


def seen_date(rng, d: float, app_user: bool, issue: date, paid: date | None):
    """วันที่ผู้ค้าเปิดดูบิลในแอปครั้งแรก: เปิดภายใน 4 วันแรกด้วยโอกาส 0.30 + 0.65d · คนจ่ายผ่านแอปต้องเปิดบิลอย่างช้าวันที่จ่าย"""
    seen = issue + timedelta(days=int(rng.integers(0, 4))) if rng.random() < 0.30 + 0.65 * d else None
    if app_user and paid is not None and (seen is None or seen > paid):
        seen = paid
    if seen is not None and seen >= ANCHOR:
        seen = ANCHOR - timedelta(days=1)
    return seen


def risk_bills(sc: RiskScenario) -> tuple[dict[int, list[dict]], date]:
    """บิลรายเดือนแยกตามผู้ค้า (รูปแบบเดียวกับ risk._load_bills) และวันที่ "วันนี้" ของชุดข้อมูล"""
    rng = np.random.default_rng(sc.seed)
    periods = _periods(sc.months)
    by_vendor: dict[int, list[dict]] = {}
    bill_id = 0
    for vid, code in enumerate(_type_list(sc.n_vendors, rng), start=1):
        t = TYPES[code]
        disc = float(rng.uniform(0.05, 0.25)) if rng.random() < sc.bad_share else float(0.35 + 0.65 * rng.random())
        if rng.random() < sc.new_share:
            since = ANCHOR - timedelta(days=int(rng.uniform(60, 540)))
        else:
            since = ANCHOR - timedelta(days=int(rng.uniform(2 * 365, 13 * 365)))
        sw_v, se_v = math.exp(0.25 * rng.standard_normal()), math.exp(0.25 * rng.standard_normal())
        # สุ่มเพิ่มเฉพาะชุดที่เปิดพฤติกรรม ลำดับการสุ่มของชุดเดิมจึงไม่เปลี่ยน
        app_user = bool(rng.random() < APP_P(disc)) if sc.behavior else False
        bills: list[dict] = []
        for p in periods:
            if f"{since.year}-{since.month:02d}" >= p:
                continue
            month = int(p[5:7])
            sw = 1.15 if month in (3, 4, 5) else 1.0
            se = 1.3 if month in (3, 4, 5) else 0.85 if month in (11, 12, 1) else 1.0
            uw = max(0, round(t["w"] * sw_v * sw * (1 + 0.12 * rng.standard_normal())))
            ue = max(0, round(t["e"] * se_v * se * (1 + 0.10 * rng.standard_normal())))
            if sc.shock_p and rng.random() < sc.shock_p:
                k = rng.uniform(*sc.shock_range)
                uw, ue = round(uw * k), round(ue * k)
            elif sc.drop_p and rng.random() < sc.drop_p:
                k = rng.uniform(*sc.drop_range)
                uw, ue = round(uw * k), round(ue * k)
            issue = _first_of_next(p)
            due = issue + timedelta(days=PAY_WITHIN_DAYS - 1)
            bill_id += 1
            bill = {"id": bill_id, "vendor_id": vid, "period": p, "total": t["rent"] + uw * WATER_RATE + ue * ELEC_RATE,
                    "credit_used": 0, "issue_date": issue, "due_date": due, "paid_date": None, "status": "paid",
                    "since": since, "type_code": code}
            f = risk_features(since, code, bills, bill)
            tenure_eff = 0.6 if f["tenure_years"] < 1 else 0.2 if f["tenure_years"] < 3 else -0.2
            signal = (sc.intercept + sc.k_discipline * 4.2 * (0.5 - disc) + sc.k_history * 0.3 * f["late_count"]
                      + sc.k_ratio * 2.2 * (f["bill_ratio"] - 1) + sc.k_type * t["risk"] + sc.k_season * SEASON_EFF[f["season"]]
                      + tenure_eff + special_term(sc, f, code))
            logit = sc.sharp * (signal + sc.noise_sd * rng.standard_normal())
            late = rng.random() < _sigmoid(logit)
            # ส่วนที่ "รู้ได้" ของ logit รวมวินัยที่ซ่อนอยู่ ใช้คิดเพดานความแม่น (oracle) ห้ามใช้เป็นฟีเจอร์
            bill["oracle_logit"] = sc.sharp * signal
            if due >= ANCHOR:
                bill["status"] = "unpaid"          # ยังไม่ถึงกำหนด ไม่รู้ผล (build_dataset ข้ามเอง)
            elif late:
                bill["paid_date"] = due + timedelta(days=1 + int((rng.random() ** 1.4) * 14 * (1.3 - disc)))
            elif sc.behavior:
                bill["paid_date"] = issue + timedelta(days=ontime_day(rng.random(), disc))
            else:
                bill["paid_date"] = issue + timedelta(days=int(rng.random() * PAY_WITHIN_DAYS))
            if bill["paid_date"] is not None and bill["paid_date"] >= ANCHOR:
                bill["paid_date"] = ANCHOR - timedelta(days=1)
            if sc.behavior:
                bill["seen_at"] = seen_date(rng, disc, app_user, issue, bill["paid_date"])
                if bill["paid_date"] is not None:
                    bill["channel"] = "app" if app_user else "cash"
            bills.append(bill)
        by_vendor[vid] = bills
    return by_vendor, ANCHOR


def risk_dataset(sc: RiskScenario):
    """DataFrame ฟีเจอร์ + label ผ่านขั้นตอนเดียวกับข้อมูลจริง (risk.build_dataset)"""
    from .risk import build_dataset           # import ช้า: risk โหลดค่าตั้งของโมเดล
    by_vendor, today = risk_bills(sc)
    return build_dataset(by_vendor, today)


def meter_records(sc: MeterScenario) -> list[dict]:
    """การใช้น้ำ/ไฟรายเดือนของทุกแผง พร้อมป้ายคำตอบ label (1 = ค่าผิดปกติที่ใส่ไว้) และชนิด"""
    rng = np.random.default_rng(sc.seed)
    periods = _periods(sc.months)
    out = []
    for i, code in enumerate(_type_list(sc.n_stalls, rng)):
        t = TYPES[code]
        sid = f"S{i + 1:03d}"
        sw_v, se_v = math.exp(0.25 * rng.standard_normal()), math.exp(0.25 * rng.standard_normal())
        grows = rng.random() < sc.growth_share
        for k, p in enumerate(periods):
            month = int(p[5:7])
            g = (1 + sc.growth_rate) ** k if grows else 1.0
            sw = 1 + 0.15 * sc.season_amp if month in (3, 4, 5) else 1.0
            se = 1 + 0.3 * sc.season_amp if month in (3, 4, 5) else max(0.3, 1 - 0.15 * sc.season_amp) if month in (11, 12, 1) else 1.0
            uw = max(0.0, g * t["w"] * sw_v * sw * (1 + sc.noise_w * rng.standard_normal()))
            ue = max(0.0, g * t["e"] * se_v * se * (1 + sc.noise_e * rng.standard_normal()))
            label, kind = 0, "normal"
            is_anomaly = k >= 3 and rng.random() < sc.anomaly_rate    # สุ่มครั้งเดียวต่อเดือน
            if is_anomaly and sc.pattern:
                # น้ำขึ้นนิด ไฟลงหน่อยพร้อมกัน (หรือกลับกัน) แต่ละค่าอยู่ใกล้ช่วงปกติ
                up, down = rng.uniform(*sc.pattern_range), 1 / rng.uniform(*sc.pattern_range)
                if rng.random() < 0.5:
                    uw, ue = uw * up, ue * down
                else:
                    uw, ue = uw * down, ue * up
                label, kind = 1, "pattern"
            elif is_anomaly:
                label = 1
                util = "water" if rng.random() < 0.5 else "elec"
                if rng.random() < sc.low_share:
                    mult, kind = rng.uniform(*sc.low_range), f"low_{util}"
                else:
                    mult, kind = rng.uniform(*sc.high_range), f"high_{util}"
                if util == "water":
                    uw *= mult
                else:
                    ue *= mult
            out.append({"stall_id": sid, "type_code": code, "period": p,
                        "use_water": int(round(uw)), "use_elec": int(round(ue)), "label": label, "kind": kind})
    return out


def describe(sc) -> dict:
    """ข้อมูลประจำชุด (datasheet) เก็บคู่กับผลวัด"""
    d = asdict(sc)
    return {"key": d.pop("key"), "title": d.pop("title"), "description": d.pop("description"), "seed": d.pop("seed"),
            "expect": list(d.pop("expect")), "expect_metric": d.pop("expect_metric"), "hypothesis": d.pop("hypothesis"), "params": d}


# ---------------- ไฟล์ทดลองของหน้า "ทำนายจากไฟล์" (web/src/ai/experimentSample.js) ----------------
EXPERIMENT_KEY = "clear"       # ข้อมูลจำลองแบบความบังเอิญต่ำ ผลจ่ายช้าขึ้นกับปัจจัยชัด
EXPERIMENT_SIZE = 200          # บิลล่าสุดของตลาดจำลอง (เลือกตามเวลา ไม่ได้ดูผลทาย)
EXPERIMENT_COLS = ["ref", "stall_type", "due_month", "tenure_years", "n_prior", "late_count", "days_late_total", "bill_total",
                   "prev_avg", "early_days_avg", "seen_count", "app_count", "actual"]


def experiment_rows(key: str = EXPERIMENT_KEY, size: int = EXPERIMENT_SIZE) -> list[dict]:
    """แถวในรูปแบบไฟล์อัปโหลดพร้อมผลจริง คิดจากบิลก่อนหน้าแบบเดียวกับ risk_features ทุกประการ
    (ติดป้ายผลแบบ risk.build_dataset: จ่ายหลังครบกำหนด หรือยังไม่จ่ายและเลยกำหนด = จ่ายช้า)"""
    from .features import days_late_as_of
    sc = next(s for s in RISK_SCENARIOS if s.key == key)
    by_vendor, today = risk_bills(sc)
    rows = []
    for bills in by_vendor.values():
        for i in range(1, len(bills)):
            b = bills[i]
            if b["paid_date"] is not None:
                actual = int(b["paid_date"] > b["due_date"])
            elif today > b["due_date"]:
                actual = 1
            else:
                continue
            prior, asof = bills[:i], b["issue_date"]
            last6, last3 = prior[-6:], prior[-3:]
            late = [days_late_as_of(p, asof) for p in last6]
            known = [p for p in last6 if p.get("paid_date") is not None and p["paid_date"] <= asof]
            ontime = [p for p in known if p["paid_date"] <= p["due_date"]]
            rows.append({
                "_order": (b["period"], b["vendor_id"]), "bill_id": b["id"],
                "stall_type": b["type_code"], "due_month": b["due_date"].month,
                "tenure_years": round(min(max(0.0, (asof - b["since"]).days / 365), 15.0), 2),
                "n_prior": len(last6), "late_count": sum(d > 0 for d in late), "days_late_total": int(sum(late)),
                "bill_total": round(float(b["total"]), 2),
                "prev_avg": round(float(np.mean([p["total"] for p in last3])), 2) if last3 else 0,
                "early_days_avg": round(float(np.mean([(p["due_date"] - p["paid_date"]).days for p in ontime])), 2) if ontime else 0.0,
                "seen_count": sum(p.get("seen_at") is not None and p["seen_at"] <= min(p["due_date"], asof) for p in last6),
                "app_count": sum(p.get("channel") == "app" for p in known),
                "actual": actual,
            })
    rows.sort(key=lambda r: r.pop("_order"))
    rows = rows[-size:]
    for i, r in enumerate(rows, start=1):
        r["ref"] = f"ทดลอง {i:03d}"
    return rows


def _js_value(v) -> str:
    if isinstance(v, str):
        return "'" + v.replace("\\", "\\\\").replace("'", "\'") + "'"
    if isinstance(v, float):
        return ("%.2f" % v).rstrip("0").rstrip(".")
    return str(int(v))


def experiment_js(rows: list[dict], key: str = EXPERIMENT_KEY) -> str:
    """เนื้อหาไฟล์ web/src/ai/experimentSample.js (เว็บใช้สร้างไฟล์ทดลองโดยไม่ต้องเรียกเซิร์ฟเวอร์)"""
    sc = next(s for s in RISK_SCENARIOS if s.key == key)
    late = sum(r["actual"] for r in rows)
    body = ",\n".join("  [" + ", ".join(_js_value(r[c]) for c in EXPERIMENT_COLS) + "]" for r in rows)
    return (
        "/*\n"
        " * ไฟล์ทดลองของหน้า \"ทำนายจากไฟล์\": ข้อมูลจำลองแบบความบังเอิญต่ำพร้อมผลจริง · สร้างอัตโนมัติ ห้ามแก้มือ\n"
        f" * ที่มา: ml/app/synthetic.py ชุด \"{sc.key}\" (seed {sc.seed}) · {len(rows)} บิลล่าสุดของตลาดจำลอง (เลือกตามเวลา ไม่ได้ดูผลทาย)\n"
        " * สร้างใหม่: cd ml && python -m app.benchmark --experiment-js ../web/src/ai/experimentSample.js\n"
        " * ml/tests/test_models.py ตรวจว่าไฟล์นี้ตรงกับตัวสร้างข้อมูลเสมอ\n"
        " */\n"
        f"export const EXPERIMENT_META = {{ scenario: '{sc.key}', seed: {sc.seed}, rows: {len(rows)}, late: {late} }};\n"
        f"/** ลำดับคอลัมน์: {', '.join(EXPERIMENT_COLS)} (actual: 1 = จ่ายช้า, 0 = ตรงเวลา) */\n"
        "export const EXPERIMENT_ROWS = [\n" + body + ",\n];\n"
    )
