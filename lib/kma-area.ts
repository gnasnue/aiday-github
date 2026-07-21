/**
 * 기상청 생활·보건기상지수 계열 API의 지점 코드(areaNo).
 *
 * 표준 법정동코드(시/도 단위, 10자리, 뒷자리 0 패딩)를 쓴다. 단기예보가 쓰는 격자
 * 좌표(nx/ny)와는 다른 체계이며, 자외선(LivingWthrIdxServiceV5)·꽃가루(HealthWthrIdxServiceV3)
 * 두 서비스가 같은 코드계를 공유한다 — 꽃가루 공식 명세(공공데이터포털 15085289)의 전 언어
 * 샘플이 `areaNo=1100000000`(서울)을 쓰고, 함께 배포되는 행정구역코드 표
 * (`dfs-zone-tree_excel_20260701.xlsx`)도 동일한 10자리 코드를 싣고 있다.
 *
 * 값 자체는 실제 API에 빈 areaNo(전체지점조회)로 질의해 응답에 포함된 시/도 코드로
 * 검증했다(2026-07 기준). 강원/전북은 특별자치도 전환 이후 51/52로 재부여됨.
 */
export const KMA_AREA_CODE_MAP: Record<string, string> = {
  서울: "1100000000",
  부산: "2600000000",
  대구: "2700000000",
  인천: "2800000000",
  광주: "2900000000",
  대전: "3000000000",
  울산: "3100000000",
  세종: "3600000000",
  경기: "4100000000",
  강원: "5100000000",
  충북: "4300000000",
  충남: "4400000000",
  전북: "5200000000",
  전남: "4600000000",
  경북: "4700000000",
  경남: "4800000000",
  제주: "5000000000",
};

/** 시/도명을 지점 코드로. 알 수 없는 지역은 서울로 폴백한다. */
export function resolveKmaArea(regionParam: string | null): {
  region: string;
  areaNo: string;
} {
  const candidate = regionParam ?? "서울";
  const region = candidate in KMA_AREA_CODE_MAP ? candidate : "서울";
  return { region, areaNo: KMA_AREA_CODE_MAP[region] };
}
