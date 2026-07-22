/**
 * 건강팁 지식 베이스 — 공신력 있는 기관 문서에 근거한 큐레이션 콘텐츠.
 *
 * ## 절대 원칙
 * **팩트와 인용은 런타임에 생성하지 않는다.** LLM은 이 파일을 쓰지 않는다.
 * 사실 주장과 출처는 authoring 시점에 사람이 원문을 확인해 넣고, PR 리뷰로 검증한다.
 * LLM에게 팁을 생성시키면 그럴듯한 가짜 인용(존재하지 않는 논문·URL)이 섞이는데,
 * "근거 기반"을 표방하는 화면에서 그건 제품의 존재 이유를 무너뜨린다.
 *
 * ## 출처 표기 원칙
 * - 기관 홈페이지가 아니라 **문서를 이름으로 특정**한다. "대한피부과학회 → derma.or.kr"은
 *   기관이 존재한다는 것만 증명할 뿐, 근거를 가리키지 않는다.
 * - `pubYear`는 **개정판·발간연도가 확인된 문서에만** 넣는다. 상시 운영되는 기관 안내
 *   (기상청 지수 대응요령 등)는 발행연도가 없는 게 정상이며, 없는 연도를 지어내지 않는다.
 * - `retrievedDate`는 원문을 확인한 날짜다. 링크가 살아 있어도 원문이 개정되면 요약이
 *   최신 합의와 어긋날 수 있어, 이 날짜를 기준으로 사람이 주기적으로 재검토한다.
 * - 원문 복제 금지. 요약·의역 + 링크아웃만 한다.
 *
 * ## 비승인 고지
 * 아래 문구를 출처와 함께 반드시 노출한다 — 기관 실명 옆에 우리 문장을 붙이면
 * "그 기관이 이 문구를 승인했다"고 오해될 수 있기 때문이다.
 */
export const SOURCE_DISCLAIMER =
  "기관 원문을 요약한 것으로, 표현은 아이데이가 작성했습니다. 기관의 검수·승인을 받은 문구가 아닙니다.";

export type TipCategory = "자외선" | "미세먼지" | "꽃가루" | "건조" | "일반";
export type TipSeverity = "정보" | "주의" | "경고";

/** 이 팁이 근거로 삼는 환경 신호. 결측이면 팁 자체를 노출하지 않는다(fail-closed). */
export type TipSignal = "uv" | "air" | "pollen" | "humidity" | null;

/** 프로필 민감도 축 — lib/domain/child-conditions의 판정 함수와 1:1 대응 */
export type TipProfileFlag = "respiratory" | "allergy" | "skin";

export type TipSource = {
  /** 발행 기관 실명 */
  org: string;
  /** 문서명 — 기관 홈페이지가 아니라 문서를 특정한다 */
  docTitle: string;
  /** 딥링크가 있으면 딥링크, 없으면 안정적 랜딩 */
  url: string;
  /** 발간·개정 연도. 확인된 문서만 — 상시 안내는 생략한다 */
  pubYear?: number;
  /** 원문 확인일 (YYYY-MM-DD) */
  retrievedDate: string;
};

export type TipEntry = {
  id: string;
  category: TipCategory;
  /** 필요한 환경 신호. null이면 환경과 무관하게 상시 노출 */
  requires: TipSignal;
  /**
   * 발동 최소 레벨(0~3). 셀렉터가 공인 등급에서 도출한 레벨과 비교한다.
   * requires가 null이면 무시된다.
   */
  minLevel?: number;
  /** 이 레벨 이상이면 "경고" */
  alertLevel?: number;
  /** 발동은 했지만 경고 수준은 아닐 때의 기본 심각도 (기본값 "주의") */
  baseSeverity?: TipSeverity;
  /** 해당 체질이면 심각도를 한 단계 올리고 matchedProfile을 붙인다 */
  profileFlag?: TipProfileFlag;
  /** 프로필 매칭 시 표시할 사유 */
  matchedLabel?: string;
  /** `{level}`·`{value}` 토큰을 셀렉터가 치환한다 */
  title: string;
  summary: string;
  /** 프로필이 매칭됐을 때 대체할 요약 */
  summaryWhenMatched?: string;
  recommendations: string[];
  /** 프로필이 매칭됐을 때만 덧붙이는 권고 */
  recommendationsWhenMatched?: string[];
  /**
   * 마스크 권고가 포함된 항목 표시. 만 2세 미만은 질식 위험으로 마스크를 권하지 않으므로
   * 셀렉터가 `canRecommendMask`로 걸러 아래 대체 문구로 바꾼다.
   */
  maskRecommendationIndex?: number;
  maskAlternative?: string;
  sources: TipSource[];
};

/* ----------------------------- 출처 (원문 확인: 2026-07-22) ----------------------------- */

const KMA_UV: TipSource = {
  org: "기상청",
  docTitle: "「자외선지수」 단계별 대응요령 (생활기상지수)",
  url: "https://www.weather.go.kr/w/theme/daily-life/life-weather-info-index.do",
  retrievedDate: "2026-07-22",
};

const MFDS_SUNSCREEN: TipSource = {
  org: "식품의약품안전처",
  docTitle: "「자외선차단제 올바른 사용법·주의사항」 안내",
  url: "https://www.mfds.go.kr/",
  retrievedDate: "2026-07-22",
};

const AIR_CENTER: TipSource = {
  org: "국가미세먼지정보센터",
  docTitle: "「고농도 미세먼지 대응요령」",
  url: "https://www.air.go.kr/contents/view.do?contentsId=13&menuId=45",
  retrievedDate: "2026-07-22",
};

const KMA_POLLEN: TipSource = {
  org: "기상청",
  docTitle: "「꽃가루농도위험지수」 단계별 대응요령 (생활기상지수)",
  url: "https://www.weather.go.kr/w/resources/jsp/life/popup_health_06.jsp",
  retrievedDate: "2026-07-22",
};

const KADA_GUIDELINE: TipSource = {
  org: "대한아토피피부염학회",
  docTitle: "「한국 아토피피부염 치료 가이드라인」",
  url: "https://atopy.re.kr/",
  pubYear: 2024,
  retrievedDate: "2026-07-22",
};

const KDCA_HANDWASH: TipSource = {
  org: "질병관리청",
  docTitle: "「올바른 손씻기 6단계」 실천 매뉴얼",
  url: "https://www.kdca.go.kr/",
  retrievedDate: "2026-07-22",
};

/* ----------------------------- 콘텐츠 테이블 ----------------------------- */

/**
 * 선언적 테이블. 항목마다 판정 클로저를 두지 않는 이유는, 이 표가 결국 도메인
 * 전문가의 감사 대상이 되기 때문이다 — 코드를 읽을 수 없는 사람도 "무슨 조건에서
 * 무슨 근거로 무엇을 권하는가"를 표 한 장으로 확인할 수 있어야 한다.
 */
export const TIP_ENTRIES: TipEntry[] = [
  {
    id: "uv-high",
    category: "자외선",
    requires: "uv",
    minLevel: 2, // 기상청 "높음"(6) 이상
    alertLevel: 3, // "매우높음"(8+)
    title: "자외선 {level} — 영유아 피부 보호",
    summary:
      "영유아 피부는 성인보다 얇고 멜라닌 색소가 적어 같은 햇빛에도 손상을 더 크게 받습니다. 기상청은 자외선지수 '높음' 단계부터 한낮 야외활동을 피하고 차단을 권합니다.",
    recommendations: [
      "외출 15분 전 자외선차단제를 충분한 양으로 고르게 바르기",
      "땀을 많이 흘리거나 물놀이를 하면 수시로 덧바르기 (내수성 제품도 약 2시간마다)",
      "챙 넓은 모자·긴소매 옷으로 물리적 차단 병행",
      "자외선이 강한 한낮에는 그늘·실내 활동 위주로",
      "생후 6개월 미만은 자외선차단제 사용 전 전문가와 상담 (피부층이 얇아 자극에 민감)",
      "어린이에게 처음 쓰는 제품은 손목 안쪽에 소량 발라 반응을 먼저 확인",
    ],
    sources: [KMA_UV, MFDS_SUNSCREEN],
  },
  {
    id: "pm-high",
    category: "미세먼지",
    requires: "air",
    minLevel: 2, // 에어코리아 "나쁨" 이상
    alertLevel: 3, // "매우나쁨"
    profileFlag: "respiratory",
    matchedLabel: "호흡기 민감 (비염·천식 등)",
    title: "미세먼지 {level} — 호흡기 보호",
    summary:
      "어린이는 체중 대비 호흡량이 많아 같은 농도에서도 더 많은 오염물질을 들이마십니다. 고농도일 때는 실외 활동을 줄이는 것이 가장 확실한 대응입니다.",
    summaryWhenMatched:
      "{name}의 호흡기 민감 정보를 반영했습니다. 어린이는 체중 대비 호흡량이 많아 같은 농도에서도 더 많은 오염물질을 들이마시고, 호흡기가 민감한 경우 증상이 먼저 나타날 수 있습니다.",
    recommendations: [
      "외출 시 보건용 마스크(KF80 이상) 착용",
      "장시간 야외활동·격렬한 운동은 다른 날로 미루기",
      "외출 후 손·얼굴 씻기",
      "실내 환기는 짧게, 공기청정기 활용",
      "물을 자주 마셔 점막이 마르지 않게",
    ],
    recommendationsWhenMatched: [
      "기존에 처방받은 약이 있다면 복용 계획을 담당의와 미리 상의",
    ],
    maskRecommendationIndex: 0,
    maskAlternative:
      "만 2세 미만은 마스크 대신 외출 자체를 줄이기 (질식 위험으로 마스크를 권하지 않습니다)",
    sources: [AIR_CENTER],
  },
  {
    id: "pollen-high",
    category: "꽃가루",
    requires: "pollen",
    minLevel: 2, // 기상청 "높음" 이상
    alertLevel: 3, // "매우높음"
    profileFlag: "allergy",
    matchedLabel: "알레르기 체질",
    title: "꽃가루 {level} — 알레르기 대비",
    summary:
      "기상청은 꽃가루농도위험지수 '높음' 단계부터 대개 알레르기 환자에게 증상이 나타난다고 안내합니다.",
    summaryWhenMatched:
      "{name}의 알레르기 정보를 반영했습니다. 기상청은 꽃가루농도위험지수 '높음' 단계부터 대개 알레르기 환자에게 증상이 나타난다고 안내합니다.",
    recommendations: [
      "창문을 닫고 야외활동 자제하기",
      "외출 시 마스크·모자·선글라스 착용",
      "귀가 후 손·얼굴·눈을 물로 씻고, 코는 식염수로 세척",
      "털이 붙기 쉬운 니트·털옷은 피하기",
      "빨래는 실내에서 말리기",
    ],
    recommendationsWhenMatched: [
      "증상이 반복되면 소아청소년과·이비인후과에서 대비 방법을 미리 상의",
    ],
    sources: [KMA_POLLEN],
  },
  {
    id: "dry-skin",
    category: "건조",
    requires: "humidity",
    minLevel: 1, // 앱 표시 기준 "건조"(습도 30% 이하)
    alertLevel: 2, // 습도만으로는 도달하지 않는다 — 체질 매칭이 있을 때만 경고로 올라간다
    baseSeverity: "정보", // 건조 자체는 경고가 아니라 정보 — 과잉 경고를 만들지 않는다
    profileFlag: "skin",
    matchedLabel: "민감 피부 / 아토피",
    title: "습도 {value}% 건조 — 피부 보습",
    summary:
      "건조한 환경은 피부 장벽을 약하게 하고 호흡기 점막을 자극할 수 있습니다.",
    summaryWhenMatched:
      "{name}의 피부 정보를 반영했습니다. 아토피피부염은 피부 장벽 기능 저하가 바탕에 있어, 건조한 환경에서 증상이 나빠지기 쉽습니다. 보습은 치료의 기본으로 권고됩니다.",
    recommendations: [
      "목욕은 미지근한 물로 짧게, 자극이 적은 세정제 사용",
      "목욕 직후 물기를 가볍게 닦고 바로 보습제 바르기",
      "하루 여러 번, 충분한 양의 보습제 사용",
      "실내 습도를 적정 수준으로 올리기 (가습기·젖은 빨래)",
    ],
    recommendationsWhenMatched: [
      "증상이 심해지면 자가 판단으로 스테로이드를 쓰지 말고 소아청소년과·피부과 상담",
    ],
    sources: [KADA_GUIDELINE],
  },
  {
    id: "general-hygiene",
    category: "일반",
    requires: null, // 환경과 무관하게 상시 — 계절 표현을 쓰지 않는다
    baseSeverity: "정보",
    title: "기본 위생 — 손씻기 30초",
    summary:
      "손씻기는 감염병 예방의 기본입니다. 질병관리청은 흐르는 물에 비누로 30초 이상, 6단계로 씻기를 권합니다.",
    recommendations: [
      "흐르는 물에 비누로 30초 이상 — 손바닥·손등·손가락 사이·두 손 모아·엄지·손톱 밑 6단계",
      "외출 후, 식사 전, 기침 후에 씻기",
      "씻지 않은 손으로 눈·코·입 만지지 않기",
      "기침은 옷소매 안쪽으로",
      "예방접종 일정 확인하기",
    ],
    sources: [KDCA_HANDWASH],
  },
];
