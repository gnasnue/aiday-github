import type { ReactNode } from "react";
import Logo from "@/components/Logo";

/**
 * 앱 상단바 — 5개 BottomNav 탭(home·env·outfit·tips·me) 공용.
 *
 * v3 원칙(2026-07-16 일관성 감사): 최상위 탭은 뒤로가기를 노출하지 않는다
 * (부모 화면이 없어 의미 없음 — 토스·당근 패턴). 좌측은 항상 브랜드 로고,
 * 우측은 그 화면의 의미 있는 액션 슬롯(children). 액션 버튼은 아래 headerBtn
 * 클래스로 44px 터치 타겟을 보장한다.
 */
export default function PageHeader({ right }: { right?: ReactNode }) {
  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background/90 backdrop-blur-md">
      <div className="container-mobile flex h-14 items-center justify-between">
        <Logo />
        {right ? <div className="flex items-center gap-1">{right}</div> : null}
      </div>
    </header>
  );
}

/** 헤더 우측 아이콘 버튼 공통 클래스 — 44px 터치 타겟(p-3 + 20px 아이콘) */
export const headerBtn =
  "flex h-11 w-11 items-center justify-center rounded-full text-foreground hover:bg-muted disabled:opacity-50";
