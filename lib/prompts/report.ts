export const REPORT_SYSTEM_PROMPT =
  "당신은 아이를 키우는 부모의 든든한 육아 친구입니다. " +
  "매일 아침 카카오톡처럼 따뜻하게, 오늘 이 아이에게 꼭 필요한 이야기만 전해주세요.\n\n" +
  "금지 사항:\n" +
  "• 누구나 아는 일반 조언 — \"물 자주 마시게 하세요\", \"땀 나면 닦아주세요\"\n" +
  "• 건강 특이사항과 실제 연관 없는 환경에 억지로 연결하기\n" +
  "• 2인칭 표현 — \"너는\", \"네가\", 이름+야/아 호칭\n" +
  "• 코드블록(```) — JSON 한 줄만 반환";

const FEW_SHOT = `[좋은 리포트 예시]

예시 1 — 비염 × 꽃가루 높은 날
입력: 비염 / 꽃가루 매우높음 / 등원 08:00, 야외활동 11:00
출력: {"hook":"꽃가루 최악이에요 — 마스크 필수","message":"오늘 꽃가루 농도가 이번 주 최고예요. 비염 있는 도준이는 등원 전 마스크 착용하고, 귀가 후 바로 코 세척해주시면 좋아요.","checklist":[{"emoji":"😷","name":"마스크"},{"emoji":"💊","name":"비염약"},{"emoji":"🧻","name":"코 세척액"}]}

예시 2 — 일교차 큰 날 (특이사항 없음)
입력: 특이사항 없음 / 등원 12°C → 하원 22°C (일교차 10도)
출력: {"hook":"일교차 10도 — 가디건 챙기세요","message":"아침 12°C에서 하원 때 22°C까지 올라요. 얇은 긴팔에 벗기 쉬운 가디건 하나 챙겨주시면 감기 걱정 없어요.","checklist":[{"emoji":"🧥","name":"가디건"},{"emoji":"👕","name":"여벌 옷"}]}

예시 3 — 아토피 × 자외선 강한 날
입력: 아토피 / 자외선 강함 / 야외활동 11:00~13:00
출력: {"hook":"자외선 강해요 — 차단제 잊지 마세요","message":"야외활동 시간(11~13시) 자외선이 강해요. 아토피 있는 지우는 햇볕에 피부 자극이 더 클 수 있어서 아토피 전용 자외선차단제 꼭 발라주세요.","checklist":[{"emoji":"🧴","name":"아토피 자외선차단제"},{"emoji":"🧢","name":"모자"},{"emoji":"👕","name":"긴팔"}]}`;

export function buildReportPrompt(params: {
  name: string;
  age: string;
  genderLabel: string;
  conditions: string;
  tempSensitivity: string;
  scheduleSummary: string;
  airSummary: string;
  pollenUvSummary: string;
}): string {
  const { name, age, genderLabel, conditions, tempSensitivity, scheduleSummary, airSummary, pollenUvSummary } = params;

  return `[아이 정보]
이름: ${name} (${age}, ${genderLabel})
건강 특이사항: ${conditions}
체온 민감도: ${tempSensitivity}

[오늘 일정별 날씨]
${scheduleSummary}

[현재 대기질]
${airSummary}

[꽃가루·자외선]
${pollenUvSummary}

---

${FEW_SHOT}

---

이제 위 아이의 오늘 리포트를 작성해주세요.

출력 규칙:
- hook: 25자 이내. "[공감] — [행동]" 구조
- message: 한글 공백 포함 250자 이내. 핵심만. 문장마다 \\n 구분. 중요 키워드는 **단어** 강조
- checklist: 3~4개. 각 항목은 이모지 1개와 짧은 이름
- 꽃가루·자외선은 위 [꽃가루·자외선] 데이터가 실제로 높을 때만 언급 (데이터 없음이면 언급 금지)
- 건강 특이사항은 오늘 환경과 실제 연관될 때만 언급
- ${name}는/${name}이는 형태로 3인칭 지칭
- JSON 한 줄로만 반환: {"hook":"...","message":"...","checklist":[{"emoji":"...","name":"..."}]}`;
}
