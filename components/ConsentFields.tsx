"use client";

import Link from "next/link";
import { Checkbox } from "@/components/ui/checkbox";
import type { ConsentSelection, ConsentType } from "@/lib/consent";

type Props = {
  value: ConsentSelection;
  onChange: (next: ConsentSelection) => void;
  context: "signup" | "profile";
};

type ConsentRow = {
  type: ConsentType;
  required: boolean;
  label: React.ReactNode;
};

export default function ConsentFields({ value, onChange, context }: Props) {
  const set = (type: ConsentType, checked: boolean) =>
    onChange({ ...value, [type]: checked });

  const termsRow: ConsentRow = {
      type: "terms_privacy",
      required: true,
      label: (
        <>
          <Link href="/terms" className="font-medium text-accent underline underline-offset-2">
            이용약관
          </Link>
          에 동의합니다.
        </>
      ),
    };

  const profileRow: ConsentRow = {
      type: "sensitive_child_data",
      required: false,
      label: (
        <>
          아이 건강 정보를 맞춤 리포트에 활용하는 데 동의합니다.{" "}
          <Link href="/privacy#sensitive" className="font-medium text-accent underline underline-offset-2">
            자세히
          </Link>
        </>
      ),
    };

  const rows = context === "signup"
    ? [termsRow]
    : [...(value.terms_privacy ? [] : [termsRow]), profileRow];

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
      {context === "signup" && (
        <p className="pl-8 text-xs leading-relaxed text-muted-foreground break-keep">
          베타 기간에는 이용기록·피드백이 서비스 개선에 활용되고 종료 후 90일 이내
          삭제돼요. 자세한 처리 내용은{" "}
          <Link href="/privacy" className="font-medium text-accent underline underline-offset-2">
            개인정보처리방침
          </Link>
          에서 확인할 수 있어요.
        </p>
      )}
    </div>
  );
}
