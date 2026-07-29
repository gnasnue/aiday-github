// @ts-check
const { FlatCompat } = require("@eslint/eslintrc");
const compat = new FlatCompat({ baseDirectory: __dirname });

// localStorage 키 규율 (PRODUCT-DECISIONS §3-4).
// 네임스페이스를 `aiday:`로 통일하기로 확정한 뒤에도 부채가 번진 이유는, 키가 화면
// 14곳에 리터럴로 흩어져 있어 새 화면이 기존 화면을 복사할 때 구 접두어가 따라온 것이다.
// 규칙을 문서에만 두면 또 번지므로 린트가 막는다.
const storageKeyRules = {
  "no-restricted-syntax": [
    "error",
    {
      selector: "Literal[value=/^aiweather:/]",
      message:
        "구 localStorage 접두어 `aiweather:`를 직접 쓰지 마세요 — lib/storage-keys.ts의 키 상수를 import 하세요.",
    },
    {
      // 호출 자리에 키 문자열을 바로 적는 것만 막는다 — 키가 화면에서 태어나면
      // 다음 화면이 그걸 복사하면서 이원화가 시작된다. 이름 붙은 상수·헬퍼(`CACHE_KEY`,
      // `ratedKey(id)`)를 쓰는 기존 패턴은 통과한다. (sessionStorage는 이 부채의
      // 대상이 아니라 제외 — 필요해지면 같은 selector를 추가하면 된다.)
      // 첫 인자(키)만 본다 — 값 인자(`setItem(KEY, "1")`)는 대상이 아니다.
      selector:
        "CallExpression[callee.object.name='localStorage'][arguments.0.type='Literal']",
      message:
        "localStorage 키를 호출 자리에 문자열로 적지 마세요 — lib/storage-keys.ts(공유 키) 또는 파일 상단의 이름 붙은 상수로 정의하세요.",
    },
  ],
};

module.exports = [
  ...compat.extends("next/core-web-vitals"),
  {
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "react/no-unescaped-entities": "off",
      "@next/next/no-img-element": "off",
    },
  },
  {
    // 화면(app/**)·컴포넌트에만 적용한다. lib/은 저장소를 실제로 다루는 계층이라
    // 예외이며, 그 안의 키 정의는 lib/storage-keys.ts 한 곳으로 모아둔다.
    files: ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}"],
    rules: storageKeyRules,
  },
];
