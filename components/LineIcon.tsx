/**
 * 홈 리스타일 1b 커스텀 라인 아이콘.
 * Lucide 세트에 없는 육아 준비물 아이콘을 동일 규격(24 viewBox,
 * stroke 1.5, round cap/join)으로 보완 — 디자인 핸드오프 HTML에서 추출한 path.
 * 색은 currentColor를 따르므로 text-* 유틸리티로 제어한다.
 */
const PATHS = {
  bottle: [
    "M10 2.5h4",
    "M10.5 2.5v2.8c0 .6-.24 1.17-.66 1.59L8.6 8.13A2.25 2.25 0 0 0 8 9.7v9.05c0 1.24 1 2.25 2.25 2.25h3.5c1.24 0 2.25-1 2.25-2.25V9.7c0-.6-.24-1.17-.66-1.59l-1.24-1.24a2.25 2.25 0 0 1-.6-1.58V2.5",
  ],
  cap: ["M4.5 14.5a7.5 7.5 0 0 1 15 0", "M3 14.5h18"],
  towel: [
    "M7.5 3.5h9A1.5 1.5 0 0 1 18 5v15.5H6V5a1.5 1.5 0 0 1 1.5-1.5Z",
    "M9.75 3.5v4.5M14.25 3.5v4.5",
  ],
  shirt: [
    "M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z",
  ],
  mask: [
    "M4.5 10.2A2.2 2.2 0 0 1 6.7 8h10.6a2.2 2.2 0 0 1 2.2 2.2v2c0 3.3-3.9 5.9-7.5 5.9s-7.5-2.6-7.5-5.9Z",
    "M4.5 10.8c-1.5.1-2.6 1.1-2.6 2.3 0 1.1 1 2 2.6 2.1M19.5 10.8c1.5.1 2.6 1.1 2.6 2.3 0 1.1-1 2-2.6 2.1M8.3 11.4h7.4M8.8 13.9h6.4",
  ],
  scarf: [
    "M5.2 7.6c2-1.7 11.6-1.7 13.6 0 .7.6.7 1.6 0 2.2-2 1.7-11.6 1.7-13.6 0-.7-.6-.7-1.6 0-2.2Z",
    "M9.6 10.9 12 18.6l2.4-7.7",
  ],
  droplet: [
    "M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z",
  ],
  cardigan: [
    "M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z",
    "M12 9.5V21",
  ],
  sun: [
    "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z",
    "M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M6 18l-1.4 1.4M18 6l1.4-1.4",
  ],
  cloudsun: [
    "M12 2v2M5.3 5.3l1.4 1.4M20 12h2M18.7 5.3l-1.4 1.4M15.95 12.65a4 4 0 0 0-5.93-4.13",
    "M13 22H7a5 5 0 1 1 4.9-6H13a3 3 0 0 1 0 6Z",
  ],
} as const;

export type LineIconName = keyof typeof PATHS;

const LineIcon = ({
  name,
  size = 19,
  strokeWidth = 1.5,
  className,
}: {
  name: LineIconName;
  size?: number;
  strokeWidth?: number;
  className?: string;
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    {PATHS[name].map((d) => (
      <path key={d} d={d} />
    ))}
  </svg>
);

export default LineIcon;
