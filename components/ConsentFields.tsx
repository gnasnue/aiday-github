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
          아이의 부모·법정대리인으로서, 알레르기·비염 등 건강 관련 정보를 맞춤 리포트에
          이용하는 데 동의합니다. 정보는 삭제 요청 또는 동의 철회 시까지 보관됩니다. {" "}
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
          가입에 필요한 개인정보 처리 내용은{" "}
          <Link href="/privacy" className="font-medium text-accent underline underline-offset-2">
            개인정보처리방침
          </Link>
          에서 확인할 수 있어요.
        </p>
      )}
    </div>
  );
}
