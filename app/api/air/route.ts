import { NextRequest, NextResponse } from "next/server";

// 에어코리아 측정소 목록 (주요 도시 기준)
// 실제 서비스에서는 위경도로 가장 가까운 측정소를 조회해야 하지만
// 초기 버전은 클라이언트가 측정소명을 전달하거나 기본값(서울) 사용
const DEFAULT_STATION = "종로구";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const stationName = searchParams.get("station") ?? DEFAULT_STATION;

  const apiKey = process.env.AIRKOREA_API_KEY;
  if (!apiKey || apiKey === "YOUR_DATA_GO_KR_API_KEY") {
    return NextResponse.json(
      { error: "AIRKOREA_API_KEY가 설정되지 않았습니다." },
      { status: 503 }
    );
  }

  const params = new URLSearchParams({
    serviceKey: apiKey,
    returnType: "json",
    numOfRows: "1",
    pageNo: "1",
    stationName,
    dataTerm: "DAILY",
    ver: "1.3",
  });

  const url = `https://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getMsrstnAcctoRltmMesureDnsty?${params}`;

  try {
    const res = await fetch(url, { next: { revalidate: 3600 } }); // 1시간 캐시
    if (!res.ok) {
      return NextResponse.json(
        { error: `에어코리아 API 오류: ${res.status}` },
        { status: 502 }
      );
    }

    const data = await res.json();
    const item = data?.response?.body?.items?.[0];

    if (!item) {
      return NextResponse.json({ error: "측정 데이터 없음" }, { status: 404 });
    }

    // 통합대기환경지수 등급: 1=좋음, 2=보통, 3=나쁨, 4=매우나쁨
    // pm10Grade1h, pm25Grade1h: 1시간 등급
    return NextResponse.json({
      pm10: item.pm10Value !== "-" ? Number(item.pm10Value) : null,
      pm25: item.pm25Value !== "-" ? Number(item.pm25Value) : null,
      pm10Grade: item.pm10Grade1h !== "-" ? Number(item.pm10Grade1h) : null,
      pm25Grade: item.pm25Grade1h !== "-" ? Number(item.pm25Grade1h) : null,
      khai: item.khaiValue !== "-" ? Number(item.khaiValue) : null,
      khaiGrade: item.khaiGrade !== "-" ? Number(item.khaiGrade) : null,
      o3: item.o3Value !== "-" ? Number(item.o3Value) : null,
      no2: item.no2Value !== "-" ? Number(item.no2Value) : null,
      stationName: item.stationName,
      dataTime: item.dataTime,
    });
  } catch (err) {
    console.error("[air API]", err);
    return NextResponse.json({ error: "대기 데이터를 가져올 수 없습니다." }, { status: 500 });
  }
}
