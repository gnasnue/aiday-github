export type GrowthView = "today" | "month";

export default function GrowthViewSegment({
  value,
  onChange,
}: {
  value: GrowthView;
  onChange: (value: GrowthView) => void;
}) {
  return (
    // 탭 실측 44px 확보: p-1(4px) 안쪽 버튼이 min-h-11이어야 한다. 컨테이너에만
    // min-h-11을 걸면 패딩만큼 줄어 실제 탭 영역이 36px가 된다.
    <div className="flex rounded-full bg-muted p-1" role="group" aria-label="성장 노트 기간">
      <button
        type="button"
        aria-pressed={value === "today"}
        onClick={() => onChange("today")}
        className={`min-h-11 flex-1 rounded-full px-4 text-sm transition active:scale-[0.97] ${
          value === "today" ? "bg-card font-bold text-foreground shadow-soft" : "font-medium text-muted-foreground"
        }`}
      >
        오늘 알림장
      </button>
      <button
        type="button"
        aria-pressed={value === "month"}
        onClick={() => onChange("month")}
        className={`min-h-11 flex-1 rounded-full px-4 text-sm transition active:scale-[0.97] ${
          value === "month" ? "bg-card font-bold text-foreground shadow-soft" : "font-medium text-muted-foreground"
        }`}
      >
        30일 성장
      </button>
    </div>
  );
}
