import { describe, expect, it } from "vitest";
import {
  emptyConsentSelection,
  hasAllRequiredConsents,
  hasProfileConsent,
  hasSignupConsent,
  REQUIRED_CONSENT_TYPES,
} from "./consent";

describe("베타 필수 동의", () => {
  it("초기 선택은 모든 필수 항목이 거부 상태다", () => {
    const selection = emptyConsentSelection();
    expect(hasAllRequiredConsents(selection)).toBe(false);
    expect(REQUIRED_CONSENT_TYPES.every((type) => selection[type] === false)).toBe(true);
  });

  it("약관과 건강정보 동의를 각각 필요한 시점에 확인한다", () => {
    const selection = emptyConsentSelection();
    selection.terms_privacy = true;
    expect(hasSignupConsent(selection)).toBe(true);
    expect(hasProfileConsent(selection)).toBe(false);

    selection.sensitive_child_data = true;
    expect(hasProfileConsent(selection)).toBe(true);
    expect(hasAllRequiredConsents(selection)).toBe(true);
  });

  it("행동분석과 마케팅 선택은 필수 통과 여부에 영향을 주지 않는다", () => {
    const selection = emptyConsentSelection();
    for (const type of REQUIRED_CONSENT_TYPES) selection[type] = true;
    selection.marketing = false;
    expect(hasAllRequiredConsents(selection)).toBe(true);
  });
});
