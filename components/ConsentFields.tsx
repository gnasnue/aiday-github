"use client";

import Link from "next/link";
import { Checkbox } from "@/components/ui/checkbox";
import type { ConsentSelection, ConsentType } from "@/lib/consent";

type Props = {
  value: ConsentSelection;
  onChange: (next: ConsentSelection) => void;
  showMarketing?: boolean;
};

type ConsentRow = {
  type: ConsentType;
  required: boolean;
  label: React.ReactNode;
};

export default function ConsentFields({ value, onChange, showMarketing = true }: Props) {
  const set = (type: ConsentType, checked: boolean) =>
    onChange({ ...value, [type]: checked });

  const rows: ConsentRow[] = [
    {
      type: "terms_privacy",
      required: true,
      label: (
        <>
          <Link href="/terms" className="font-medium text-accent underline underline-offset-2">
            이용약관
          </Link>
          과{" "}
          <Link href="/privacy#collection" className="font-medium text-accent underline underline-offset-2">
            개인정보 수집·이용
          </Link>
          에 동의합니다. 계정·아동 프로필을 맞춤 서비스 제공에 이용하며, 탈퇴·삭제 요청
          시까지 보관합니다.
        </>
      ),
    },
    {
      type: "beta_analytics",
      required: true,
      label: (
        <>
          베타테스트 참여 및 사용 기록 분석에 동의합니다. 페이지 방문·기능 사용·오류·의견을
          제품 개선 목적으로 수집합니다. 자유 의견에는 이름이나 질병명을 적지 마세요. {" "}
          <Link href="/privacy#beta" className="font-medium text-accent underline underline-offset-2">
            자세히
          </Link>
        </>
      ),
    },
    {
      type: "sensitive_child_data",
      required: true,
      label: (
        <>
          저는 입력할 아동의 법정대리인이며, 건강 특이사항을 맞춤 리포트 제공에 이용하고
          철회 시까지 보관하는 민감정보 처리에 별도로 동의합니다. {" "}
          <Link href="/privacy#sensitive" className="font-medium text-accent underline underline-offset-2">
            자세히
          </Link>
        </>
      ),
    },
    {
      type: "overseas_transfer",
      required: true,
      label: (
        <>
          Supabase·Vercel·Anthropic을 통한 개인정보 국외 처리에 별도로 동의합니다. {" "}
          <Link href="/privacy#overseas" className="font-medium text-accent underline underline-offset-2">
            자세히
          </Link>
        </>
      ),
    },
  ];

  if (showMarketing) {
    rows.push({
      type: "marketing",
      required: false,
      label: "서비스 소식 및 설문 안내 수신에 동의합니다. 동의하지 않아도 이용할 수 있습니다.",
    });
  }

  return (
    <div className="space-y-3 rounded-2xl bg-card p-4 shadow-soft">
      {rows.map((row) => {
        const id = `consent-${row.type}`;
        return (
          <div key={row.type} className="flex items-start gap-3">
            <Checkbox
              id={id}
              checked={value[row.type]}
              onCheckedChange={(checked) => set(row.type, checked === true)}
              className="mt-1 h-5 w-5"
            />
            <label htmlFor={id} className="min-h-11 flex-1 cursor-pointer text-sm leading-relaxed text-foreground break-keep">
              <span className={row.required ? "font-semibold text-accent" : "text-muted-foreground"}>
                [{row.required ? "필수" : "선택"}]
              </span>{" "}
              {row.label}
            </label>
          </div>
        );
      })}
    </div>
  );
}
