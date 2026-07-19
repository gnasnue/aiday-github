import Link from "next/link";
import Logo from "@/components/Logo";
import { ChevronLeft } from "lucide-react";

export const metadata = { title: "개인정보처리방침 — 아이데이" };

export default function PrivacyPage() {
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
          <p className="text-xs font-medium text-accent">2026년 7월 20일 시행 · 베타 v2</p>
          <h1 className="mt-2 text-[1.375rem] font-bold tracking-tight">개인정보처리방침</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground break-keep">
            아이데이는 날씨·대기질 등 환경 데이터를 아이의 특성에 맞게 해석하는 베타
            서비스입니다. 아이데이 운영자(이하 “운영자”)는 이용자의 개인정보를 필요한
            범위에서만 처리하고 안전하게 보호합니다.
          </p>

          <div className="mt-7 space-y-4">
            <PolicySection id="collection" title="1. 수집 항목, 목적 및 보유 기간">
              <p>
                계정, 기본 프로필, 위치 요청 등 서비스 제공에 꼭 필요한 정보는 이용자와의 계약
                체결·이행을 위해 처리하며 별도 동의를 요구하지 않습니다. 건강 관련 정보와 선택적
                베타 분석처럼 동의가 필요한 항목은 실제 이용 시점에 따로 확인합니다.
              </p>
              <PolicyItem
                title="계정 및 인증"
                detail="이메일 주소, 인증 제공자 및 계정 식별값"
                purpose="회원 확인, 로그인, 계정 및 문의 처리"
                period="회원 탈퇴 또는 삭제 요청 시까지"
              />
              <PolicyItem
                title="아동 프로필"
                detail="이름 또는 별명, 출생 연·월, 성별(선택), 건강 특이사항, 온도 민감도, 땀 분비 정도, 생활 일정"
                purpose="맞춤 환경 리포트와 준비 가이드 제공"
                period="프로필 삭제, 회원 탈퇴 또는 동의 철회 시까지"
              />
              <PolicyItem
                title="위치 및 환경 요청"
                detail="기기 위치정보(위도·경도) 또는 선택한 지역, 요청 시각"
                purpose="지역별 날씨·대기질·자외선 정보 제공"
                period="선택 지역은 브라우저에 보관하며 직접 삭제할 때까지, 위치 좌표는 요청 처리 후 별도 DB에 저장하지 않음. 다만 서버 접속기록에는 일시적으로 남을 수 있음"
              />
              <PolicyItem
                title="베타 사용 기록"
                detail="계정 식별값(회원인 경우), 임의 세션 ID, 방문 경로, 기능 사용·오류 이벤트, 앱 버전, 생성 시각, 연령대 구간"
                purpose="온보딩 완료율, 주요 기능 사용성, 오류와 리포트 유용성 분석"
                period="베타 종료 후 90일까지"
              />
              <PolicyItem
                title="의견 및 문의"
                detail="만족도, 자유 의견, 이메일 문의 내용"
                purpose="문제 해결, 제품 개선 및 문의 응대"
                period="베타 종료 후 90일 또는 문의 처리 완료 후 3년 중 먼저 도래하는 시점까지"
              />
              <PolicyItem
                title="동의 기록"
                detail="동의 항목, 동의 여부·시각, 문서 버전"
                purpose="동의 사실 확인 및 분쟁 대응"
                period="회원 탈퇴 시 삭제. 동의 철회 기록은 처리 확인을 위해 최대 1년"
              />
              <p className="text-xs leading-relaxed text-muted-foreground break-keep">
                서비스 이용 과정에서 IP 주소, 브라우저·기기 정보, 접속기록이 호스팅 및 보안
                운영을 위해 자동 생성될 수 있습니다. 법령상 별도 보존 의무가 있으면 해당 기간만
                분리 보관한 뒤 삭제합니다.
              </p>
            </PolicySection>

            <PolicySection id="sensitive" title="2. 아동 및 민감정보의 처리">
              <p>
                알레르기, 비염, 천식, 아토피 등 건강 특이사항은 민감정보에 해당할 수 있어 일반
                개인정보 처리와 분리하여 동의를 받습니다. 입력하지 않아도 기본 리포트를 이용할 수
                있지만 개인화 범위는 줄어들 수 있습니다.
              </p>
              <p>
                아동의 정보를 입력하는 사람은 해당 아동의 법정대리인이어야 합니다. 법정대리인은
                처리 내역 열람·정정·삭제·동의 철회를 요청할 수 있으며, 운영자는 필요할 경우
                이메일 등으로 동의 주체와 관계를 추가 확인할 수 있습니다.
              </p>
            </PolicySection>

            <PolicySection id="beta" title="3. 베타테스트 분석 및 자유 의견">
              <p>
                행동 분석은 별도 동의 후에만 시작합니다. 페이지 방문, 온보딩 단계, 가입 완료,
                리포트 조회·새로고침·오류, 체크리스트 사용을 기록하며 광고 프로파일링에는 사용하지
                않습니다. 동의 전에는 분석 이벤트를 전송하지 않습니다.
              </p>
              <p className="font-medium text-foreground">
                자유 의견에는 아이나 보호자의 이름, 질병명, 연락처 등 개인정보를 적지 마세요.
              </p>
            </PolicySection>

            <PolicySection title="4. AI 리포트와 자동화된 처리">
              <p>
                리포트 생성 시 아동 프로필, 건강 특이사항, 일정 및 지역 환경정보가 Anthropic의
                AI API로 전송될 수 있습니다. 결과는 생활 준비를 돕는 참고 정보이며 의료 진단,
                처방 또는 응급 판단을 대신하지 않습니다. 건강상 우려가 있으면 의료 전문가와
                상담해 주세요.
              </p>
              <p>
                AI 결과가 이용자에게 법적 효력이나 자동적인 불이익을 주는 결정에 사용되지는
                않습니다. AI 처리에 이의가 있거나 설명이 필요하면 아래 연락처로 문의할 수 있습니다.
              </p>
            </PolicySection>

            <PolicySection title="5. 처리 위탁 및 제3자 제공">
              <p>운영자는 서비스를 위해 다음 업체에 개인정보 처리를 위탁합니다.</p>
              <ul className="list-disc space-y-1 pl-5">
                <li>Supabase, Inc.: 회원 인증, 데이터베이스 및 파일 인프라 운영</li>
                <li>Vercel Inc.: 웹사이트 호스팅, 배포 및 접속 로그 운영</li>
                <li>Anthropic, PBC: 맞춤 AI 리포트 생성</li>
              </ul>
              <p>
                위 위탁과 법령상 요구되는 경우를 제외하고 개인정보를 제3자에게 판매하거나 제공하지
                않습니다. 새 제공이 필요하면 법령에 따라 별도 안내와 동의를 받습니다.
              </p>
            </PolicySection>

            <PolicySection id="overseas" title="6. 개인정보의 국외 처리">
              <p>
                아래 처리는 계정 저장과 맞춤 리포트 제공 계약을 이행하기 위해 필요한 처리위탁·보관에
                해당하며, 개인정보 보호법 제28조의8에 따라 이 방침에 공개합니다. 전송은 서비스
                이용 시 암호화된 네트워크를 통해 이루어집니다. 해당 처리를 원하지 않으면 서비스
                이용을 중단하고 삭제를 요청할 수 있습니다.
              </p>
              <PolicyItem
                title="Supabase, Inc."
                detail="프로젝트에 설정된 저장 리전 및 미국 등 하위처리자 소재지 · 계정, 아동 프로필, 동의·사용·의견 기록"
                purpose="인증 및 데이터베이스 운영"
                period="각 정보의 국내 보유 기간과 동일"
              />
              <PolicyItem
                title="Vercel Inc. (미국 등)"
                detail="IP 주소, 접속 요청 및 기술 로그"
                purpose="웹 호스팅, 보안 및 장애 대응"
                period="서비스 운영 및 업체 정책상 필요한 기간"
              />
              <PolicyItem
                title="Anthropic, PBC (미국)"
                detail="아동 프로필·건강 특이사항·일정·환경정보와 리포트 요청 내용"
                purpose="AI 리포트 생성"
                period="API 입력·출력은 원칙적으로 최대 30일"
              />
            </PolicySection>

            <PolicySection title="7. 보관, 파기 및 안전조치">
              <p>
                보유 기간이 끝나거나 목적을 달성한 정보는 복구하기 어려운 방법으로 지체 없이
                삭제합니다. 계정 접근 통제, Supabase 행 수준 보안(RLS), 전송 구간 암호화, 최소
                권한 부여를 적용하며 민감정보가 분석 이벤트에 포함되지 않도록 항목을 제한합니다.
              </p>
              <p>
                브라우저에는 로그인 세션, 선택 지역, 프로필 및 동의 정보가 저장될 수 있습니다.
                공용 기기에서는 이용 후 로그아웃하고 브라우저 사이트 데이터를 삭제해 주세요.
              </p>
            </PolicySection>

            <PolicySection title="8. 이용자와 법정대리인의 권리">
              <p>
                이용자는 자신의 개인정보와 아동 프로필에 대해 열람, 정정, 삭제, 처리정지 및 동의
                철회를 요청할 수 있습니다. 현재 베타에서는 아래 이메일로 계정 이메일과 요청 내용을
                보내주세요. 본인 또는 법정대리인 확인 후 지체 없이 처리하고 결과를 안내합니다.
              </p>
              <a href="mailto:admin.aiday@gmail.com" className="inline-flex min-h-11 items-center font-medium text-accent underline underline-offset-4">
                admin.aiday@gmail.com
              </a>
              <p>동의를 철회하면 해당 정보가 필요한 맞춤 기능은 더 이상 제공되지 않을 수 있습니다.</p>
            </PolicySection>

            <PolicySection title="9. 방침 변경 및 문의">
              <p>
                중요한 내용이 변경되면 시행 전에 서비스 화면 또는 등록 이메일로 알립니다. 개인정보
                처리에 관한 문의, 불만, 삭제 요청은 아이데이 개인정보 보호 담당자에게 보내주세요.
              </p>
              <p className="font-medium text-foreground">담당: 아이데이 개인정보 보호 담당자</p>
              <a href="mailto:admin.aiday@gmail.com" className="inline-flex min-h-11 items-center font-medium text-accent underline underline-offset-4">
                admin.aiday@gmail.com
              </a>
              <p className="text-xs text-muted-foreground">공고일·시행일: 2026년 7월 20일</p>
            </PolicySection>
          </div>
        </main>
      </div>
    </div>
  );
}

function PolicySection({
  id,
  title,
  children,
}: {
  id?: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20 rounded-2xl bg-card p-5 shadow-soft">
      <h2 className="text-[1.0625rem] font-bold tracking-tight">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground break-keep">
        {children}
      </div>
    </section>
  );
}

function PolicyItem({
  title,
  detail,
  purpose,
  period,
}: {
  title: string;
  detail: string;
  purpose: string;
  period: string;
}) {
  return (
    <div className="rounded-xl bg-muted/60 p-4">
      <h3 className="font-semibold text-foreground">{title}</h3>
      <dl className="mt-2 grid gap-1.5 text-xs leading-relaxed">
        <div><dt className="inline font-medium text-foreground">항목 · </dt><dd className="inline">{detail}</dd></div>
        <div><dt className="inline font-medium text-foreground">목적 · </dt><dd className="inline">{purpose}</dd></div>
        <div><dt className="inline font-medium text-foreground">기간 · </dt><dd className="inline">{period}</dd></div>
      </dl>
    </div>
  );
}
