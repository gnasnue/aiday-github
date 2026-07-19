import Link from "next/link";
import Logo from "@/components/Logo";
import { ChevronLeft } from "lucide-react";

export const metadata = { title: "이용약관 — 아이데이" };

export default function TermsPage() {
  return (
    <div className="page-shell">
      <div className="page-frame">
        <header className="sticky top-0 z-40 border-b border-border/60 bg-background/90 backdrop-blur-md">
          <div className="container-mobile flex h-14 items-center gap-2">
            <Link href="/" className="flex h-11 w-11 items-center justify-center -ml-3 text-muted-foreground hover:text-foreground" aria-label="홈으로">
              <ChevronLeft size={22} strokeWidth={1.75} />
            </Link>
            <Logo />
          </div>
        </header>
        <main className="container-mobile py-8">
          <p className="text-xs font-medium text-accent">2026년 7월 20일 시행 · 베타 v1</p>
          <h1 className="mt-2 text-[1.375rem] font-bold tracking-tight">이용약관</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground break-keep">
            이 약관은 아이데이 운영자(이하 “운영자”)가 제공하는 아이데이 베타 서비스의 이용
            조건과 운영자 및 이용자의 권리·의무를 정합니다.
          </p>

          <div className="mt-7 space-y-4">
            <TermsSection title="1. 서비스의 목적과 범위">
              <p>
                아이데이는 날씨, 대기질, 자외선 등 환경 데이터를 아동의 연령과 입력된 특성에 맞게
                해석하여 옷차림, 준비물, 생활 관리에 관한 참고 정보를 제공합니다. 베타 기간에는
                기능, 화면, 데이터 출처와 제공 방식이 수시로 개선될 수 있습니다.
              </p>
            </TermsSection>

            <TermsSection title="2. 이용 자격과 법정대리인">
              <p>
                계정을 만들고 아동 정보를 입력하는 이용자는 만 14세 이상이어야 하며, 해당 아동의
                부모 또는 적법한 법정대리인이어야 합니다. 다른 아동의 정보를 권한 없이 입력해서는
                안 됩니다.
              </p>
            </TermsSection>

            <TermsSection title="3. 계정과 정보 관리">
              <ul className="list-disc space-y-1.5 pl-5">
                <li>이용자는 정확한 이메일을 사용하고 계정 접근 정보를 안전하게 관리해야 합니다.</li>
                <li>아동 이름은 가능하면 실명 대신 별명을 사용해 주세요.</li>
                <li>자유 의견에는 이름, 질병명, 연락처 등 개인정보를 적지 마세요.</li>
                <li>계정 도용이나 무단 사용을 알게 되면 즉시 운영자에게 알려야 합니다.</li>
              </ul>
            </TermsSection>

            <TermsSection title="4. 의료·안전 관련 중요 안내">
              <div className="rounded-xl bg-primary-tint p-4 font-medium text-foreground">
                아이데이는 의료기관이 아니며, 서비스의 정보와 AI 리포트는 의료 진단, 처방, 치료,
                응급 판단을 제공하지 않습니다.
              </div>
              <p>
                환경 데이터는 관측 지연, 위치 차이, 외부 제공기관의 오류로 실제 상황과 다를 수
                있습니다. 아동의 증상, 알레르기 반응 또는 응급 상황은 서비스 정보만으로 판단하지
                말고 의료 전문가 또는 관계 기관의 안내를 우선해 주세요.
              </p>
            </TermsSection>

            <TermsSection title="5. 베타테스트 참여">
              <p>
                베타 서비스는 완성 전 단계로 오류, 일시 중단, 데이터 지연 또는 기능 변경이 발생할
                수 있습니다. 운영자는 별도 동의를 받은 이용 기록과 의견을 서비스 안정성·사용성
                개선에 활용합니다. 이용자는 언제든 참여를 중단하고 동의를 철회하거나 데이터 삭제를
                요청할 수 있습니다.
              </p>
            </TermsSection>

            <TermsSection title="6. 이용자의 금지 행위">
              <ul className="list-disc space-y-1.5 pl-5">
                <li>타인의 개인정보나 아동 정보를 권한 없이 입력하는 행위</li>
                <li>서비스를 역설계하거나 보안·접근 통제를 우회하는 행위</li>
                <li>자동화 수단으로 서비스 또는 외부 데이터 제공처에 과도한 부하를 주는 행위</li>
                <li>불법, 기만, 위해 또는 타인의 권리를 침해하는 목적으로 이용하는 행위</li>
                <li>서비스 결과를 의료 진단이나 전문적 조언으로 표시하여 재배포하는 행위</li>
              </ul>
            </TermsSection>

            <TermsSection title="7. 서비스 변경과 중단">
              <p>
                운영자는 점검, 장애, 외부 API 중단, 보안 위험 또는 베타 운영 종료 등의 사유로
                서비스 일부 또는 전부를 변경·중단할 수 있습니다. 예측 가능한 중요한 변경은 서비스
                화면 또는 등록 이메일을 통해 미리 알리며, 긴급한 보안·장애 대응은 사후에 알릴 수
                있습니다.
              </p>
            </TermsSection>

            <TermsSection title="8. 지식재산권과 이용자 의견">
              <p>
                서비스 화면, 문구, 로고와 소프트웨어에 관한 권리는 운영자 또는 정당한 권리자에게
                있습니다. 이용자가 제공한 의견의 권리는 이용자에게 남으며, 운영자는 개인을 식별하지
                않는 범위에서 제품 분석과 개선에 이를 이용할 수 있습니다.
              </p>
            </TermsSection>

            <TermsSection title="9. 책임과 손해">
              <p>
                운영자는 합리적인 수준으로 정확성과 안정성을 높이기 위해 노력합니다. 다만 천재지변,
                통신 장애, 외부 데이터·AI 제공자의 오류처럼 운영자가 통제하기 어려운 사유로 발생한
                중단이나 부정확성에 대해서는 관련 법령이 허용하는 범위에서 책임이 제한될 수 있습니다.
                운영자의 고의 또는 중대한 과실로 인한 책임과 법령상 제한할 수 없는 소비자 권리는
                배제하지 않습니다.
              </p>
            </TermsSection>

            <TermsSection title="10. 탈퇴, 동의 철회 및 데이터 삭제">
              <p>
                현재 베타에서는 아래 이메일로 계정 이메일과 요청 내용을 보내 탈퇴, 동의 철회 또는
                데이터 삭제를 요청할 수 있습니다. 운영자는 본인 또는 법정대리인 확인 후 처리 결과를
                안내합니다. 처리 방식과 기간은 개인정보처리방침을 따릅니다.
              </p>
              <a href="mailto:admin.aiday@gmail.com" className="inline-flex min-h-11 items-center font-medium text-accent underline underline-offset-4">
                admin.aiday@gmail.com
              </a>
            </TermsSection>

            <TermsSection title="11. 약관 변경과 분쟁">
              <p>
                약관이 중요한 내용으로 변경되면 시행 전에 서비스 화면 또는 등록 이메일로 알립니다.
                이용자에게 불리한 중요한 변경은 법령이 정한 절차에 따릅니다. 이 약관은 대한민국
                법령을 따르며, 분쟁이 발생하면 당사자 간 협의를 우선하고 해결되지 않으면 관련 법령이
                정한 관할 법원에서 해결합니다.
              </p>
              <p className="text-xs text-muted-foreground">공고일·시행일: 2026년 7월 20일</p>
            </TermsSection>

            <TermsSection title="12. 문의">
              <p>서비스 및 약관 문의는 아래 연락처로 보내주세요.</p>
              <a href="mailto:admin.aiday@gmail.com" className="inline-flex min-h-11 items-center font-medium text-accent underline underline-offset-4">
                admin.aiday@gmail.com
              </a>
            </TermsSection>
          </div>
        </main>
      </div>
    </div>
  );
}

function TermsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-card p-5 shadow-soft">
      <h2 className="text-[1.0625rem] font-bold tracking-tight">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground break-keep">
        {children}
      </div>
    </section>
  );
}
