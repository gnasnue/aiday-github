export const CONSENT_POLICY_VERSION = "2026-07-20-v2";
export const CONSENT_STORAGE_KEY = "aiday:consents:v2";
export const CONSENT_UPDATED_EVENT = "aiday:consent-updated";

export const SIGNUP_REQUIRED_CONSENT_TYPES = ["terms_privacy"] as const;
export const PROFILE_REQUIRED_CONSENT_TYPES = ["sensitive_child_data"] as const;
export const REQUIRED_CONSENT_TYPES = ["terms_privacy", "sensitive_child_data"] as const;

export type RequiredConsentType = (typeof REQUIRED_CONSENT_TYPES)[number];
export type ConsentType =
  | RequiredConsentType
  | "beta_analytics"
  | "overseas_transfer"
  | "marketing";
export type ConsentSource = "signup" | "onboarding" | "auth_sync";
export type ConsentSelection = Record<ConsentType, boolean>;

type StoredConsent = {
  agreed: boolean;
  agreedAt: string;
};

type StoredConsents = {
  policyVersion: string;
  items: Record<ConsentType, StoredConsent>;
};

export const emptyConsentSelection = (): ConsentSelection => ({
  terms_privacy: false,
  beta_analytics: false,
  sensitive_child_data: false,
  overseas_transfer: false,
  marketing: false,
});

export const hasAllRequiredConsents = (selection: ConsentSelection): boolean =>
  REQUIRED_CONSENT_TYPES.every((type) => selection[type]);

export const hasSignupConsent = (selection: ConsentSelection): boolean =>
  SIGNUP_REQUIRED_CONSENT_TYPES.every((type) => selection[type]);

export const hasProfileConsent = (selection: ConsentSelection): boolean =>
  PROFILE_REQUIRED_CONSENT_TYPES.every((type) => selection[type]);

export const readLocalConsentSelection = (): ConsentSelection => {
  const empty = emptyConsentSelection();
  if (typeof window === "undefined") return empty;

  try {
    const raw = localStorage.getItem(CONSENT_STORAGE_KEY);
    if (!raw) return empty;
    const stored = JSON.parse(raw) as Partial<StoredConsents>;
    if (stored.policyVersion !== CONSENT_POLICY_VERSION || !stored.items) return empty;

    return {
      terms_privacy: stored.items.terms_privacy?.agreed === true,
      beta_analytics: stored.items.beta_analytics?.agreed === true,
      sensitive_child_data: stored.items.sensitive_child_data?.agreed === true,
      overseas_transfer: stored.items.overseas_transfer?.agreed === true,
      marketing: stored.items.marketing?.agreed === true,
    };
  } catch {
    return empty;
  }
};

export const hasAnalyticsConsent = (): boolean =>
  readLocalConsentSelection().beta_analytics;

export const saveLocalConsentSelection = (selection: ConsentSelection): void => {
  if (typeof window === "undefined") return;
  const now = new Date().toISOString();
  const items = Object.fromEntries(
    (Object.keys(selection) as ConsentType[]).map((type) => [
      type,
      { agreed: selection[type], agreedAt: now },
    ])
  ) as StoredConsents["items"];

  localStorage.setItem(
    CONSENT_STORAGE_KEY,
    JSON.stringify({ policyVersion: CONSENT_POLICY_VERSION, items } satisfies StoredConsents)
  );
  window.dispatchEvent(new Event(CONSENT_UPDATED_EVENT));
};

export const syncLocalConsentsToDb = async (
  source: ConsentSource = "auth_sync"
): Promise<boolean> => {
  if (typeof window === "undefined") return false;
  const selection = readLocalConsentSelection();

  const { supabase } = await import("./supabase");
  const { data, error: sessionError } = await supabase.auth.getSession();
  const userId = data.session?.user.id;
  if (sessionError || !userId) return false;

  const raw = localStorage.getItem(CONSENT_STORAGE_KEY);
  if (!raw) return false;
  const stored = JSON.parse(raw) as StoredConsents;
  const rows = (Object.keys(selection) as ConsentType[]).map((type) => ({
    user_id: userId,
    consent_type: type,
    policy_version: CONSENT_POLICY_VERSION,
    agreed: selection[type],
    agreed_at: stored.items[type]?.agreedAt ?? new Date().toISOString(),
    source,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from("user_consents")
    .upsert(rows, { onConflict: "user_id,consent_type,policy_version" });

  if (error && process.env.NODE_ENV === "development") {
    console.warn("[consent] 동의 이력 동기화 실패:", error.message);
  }
  return !error;
};
