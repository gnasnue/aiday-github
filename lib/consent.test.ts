import { describe, expect, it } from "vitest";
import {
  emptyConsentSelection,
  hasAllRequiredConsents,
  REQUIRED_CONSENT_TYPES,
} from "./consent";

describe("베타 필수 동의", () => {
  it("초기 선택은 모든 필수 항목이 거부 상태다", () => {
    const selection = emptyConsentSelection();
    expect(hasAllRequiredConsents(selection)).toBe(false);
    expect(REQUIRED_CONSENT_TYPES.every((type) => selection[type] === false)).toBe(true);
  });

  it("네 개의 분리된 필수 항목을 모두 선택해야 통과한다", () => {
    const selection = emptyConsentSelection();
    for (const type of REQUIRED_CONSENT_TYPES) selection[type] = true;
    expect(hasAllRequiredConsents(selection)).toBe(true);

    selection.sensitive_child_data = false;
    expect(hasAllRequiredConsents(selection)).toBe(false);
  });

  it("선택 동의는 필수 통과 여부에 영향을 주지 않는다", () => {
    const selection = emptyConsentSelection();
    for (const type of REQUIRED_CONSENT_TYPES) selection[type] = true;
    selection.marketing = false;
    expect(hasAllRequiredConsents(selection)).toBe(true);
  });
});
