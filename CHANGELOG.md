# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [0.1.1.0] - 2026-06-11

### Changed
- **AI 리포트 프롬프트**: 부모에게 전달하는 3인칭 문장으로 수정 — 기존 프롬프트가 아이에게 직접 말 거는 2인칭("지우야, 오늘은...") 문장을 생성하던 버그 수정
- **AI 리포트 컨텍스트**: 아이 일정(등원·야외활동·하원)과 시간대별 날씨를 프롬프트에 주입 — 일정 시간대 기온·강수확률·하늘 상태 기반으로 구체적인 조언 생성
- **기상청 API**: 오늘 3시간 간격 시간대별 예보(`hourlyForecast`) 반환 추가 — 06:00~21:00 슬롯
- **아이 프로파일**: `conditionEtc`(기타 건강 메모) 및 `schedule` 필드를 AI 리포트 API 페이로드에 포함
- **캐시 키**: v3 → v4로 업그레이드하여 구형 캐시 자동 무효화

### Fixed
- **AI 리포트 temperature**: Anthropic API 허용 범위(0~1.0) 초과 값(`1.2`) → `1.0`으로 수정

## [0.1.0.1] - 2026-06-10

### Fixed
- **꽃가루 API**: 한국환경공단 V3 API의 실제 오퍼레이션(`getOakPollenRiskIdxV3`, `getPinePollenRiskIdxV3`)으로 수정 — 기존 코드가 존재하지 않는 엔드포인트를 호출해 404 오류 발생
- **자외선 API**: KST 06:00 이전에는 어제 데이터로 자동 fallback — 기상청이 매일 06시에 당일 자외선 데이터를 발행하므로 그 이전 시간대에 오류 발생하던 문제 해소
- **자외선 API**: 네트워크 오류나 JSON 파싱 실패 시 날짜 fallback이 동작하지 않던 버그 수정 (try/catch 추가)
- **꽃가루 API**: `Number()` 변환 시 NaN 가드 추가 및 잘못된 `h12` fallback 필드 제거
- **지역 파라미터**: `region` 쿼리 파라미터가 정의된 지역 코드 목록에 없는 경우 서울로 fallback (비정상 입력 방어)
- **홈 화면**: AI 리포트 카드 디자인 개선 및 어투 개선
- **홈 화면**: AI 로딩 중 프로토타입 flash 제거 — 로딩 및 AI 생성 중 전체 skeleton 유지
- **프로파일**: 데모 프로파일 실데이터로 업데이트

## [0.1.0.0] - 2026-06-01

### Added
- 초기 릴리스: 날씨, 대기, 꽃가루, 자외선 환경 데이터 대시보드
- AI 기반 건강 리포트 생성 (Claude API)
- 지역별 환경 지수 조회 (서울 기본값, 17개 광역 지자체 지원)
