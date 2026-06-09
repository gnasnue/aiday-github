import { NextRequest, NextResponse } from "next/server";

// 기상청 꽃가루농도위험지수 (3.0)
// 지역 코드: 11=서울, 21=부산, 22=대구, 23=인천, 24=광주, 25=대전, 26=울산, 29=세종
// 31=경기, 32=강원, 33=충북, 34=충남, 35=전북, 36=전남, 37=경북, 38=경남, 39=제주
const AREA_CODE_MAP: Record<string, string> = {
  서울: "11",
  부산: "21",
  대구: "22",
  인천: "23",
  광주: "24",
  대전: "25",
  울산: "26",
  세종: "29",
  경기: "31",
  강원: "32",
  충북: "33",
  충남: "34",
  전북: "35",
  전남: "36",
  경북: "37",
  경남: "38",
  제주: "39",
};

function getTodayKST(): string {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return (
    String(kst.getUTCFullYear()) +
    String(kst.getUTCMonth() + 1).padStart(2, "0") +
    String(kst.getUTCDate()).padStart(2, "0")
  );
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const region = searchParams.get("region") ?? "서울";
  const areaNo = AREA_CODE_MAP[region] ?? "11";
  const today = getTodayKST();

  const apiKey = process.env.POLLEN_API_KEY;
  if (!apiKey || apiKey === "YOUR_DATA_GO_KR_API_KEY") {
    return NextResponse.json(
      { error: "POLLEN_API_KEY가 설정되지 않았습니다." },
      { status: 503 }
    );
  }

  const params = new URLSearchParams({
    serviceKey: apiKey,
    numOfRows: "10",
    pageNo: "1",
    dataType: "JSON",
    areaNo,
    time: today,
  });

  const url = `https://apis.data.go.kr/1360000/HealthWthrIdxServiceV3/getPollenRiskIdxV3?${params}`;

  try {
    const res = await fetch(url, { next: { revalidate: 3600 * 6 } }); // 6시간 캐시
    if (!res.ok) {
      return NextResponse.json(
        { error: `꽃가루 API 오류: ${res.status}` },
        { status: 502 }
      );
    }

    const data = await res.json();
    const items: Array<Record<string, string>> =
      data?.response?.body?.items?.item ?? [];

    if (!items.length) {
      return NextResponse.json({ oak: null, pine: null, weed: null, date: today });
    }

    const item = items[0];

    // 등급: 1=낮음, 2=보통, 3=높음, 4=매우높음
    return NextResponse.json({
      oak: item.oak !== "-" ? Number(item.oak) : null,       // 참나무
      pine: item.pine !== "-" ? Number(item.pine) : null,    // 소나무
      weed: item.weed !== "-" ? Number(item.weed) : null,    // 잡초
      region,
      date: today,
    });
  } catch (err) {
    console.error("[pollen API]", err);
    return NextResponse.json({ error: "꽃가루 데이터를 가져올 수 없습니다." }, { status: 500 });
  }
}
