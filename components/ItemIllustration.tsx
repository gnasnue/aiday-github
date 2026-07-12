/**
 * 추천 아이템 일러스트 4종 — 캐릭터 일러스트와 동일한 작가 톤
 * (파스텔 필 + 2.5px 라운드 스트로크). 디자인 핸드오프 HTML에서 추출.
 * 일러스트 에셋이므로 색은 토큰이 아닌 고정값 (DESIGN.md 캐릭터 예외와 동일 취급).
 */
export type ItemArt = "muffler" | "mask" | "lotion" | "cardigan";

const ART: Record<ItemArt, JSX.Element> = {
  muffler: (
    <>
      <path d="M46 46 L60 79 L74 46 Z" fill="#F6B7AF" stroke="#D07D74" strokeWidth="2.5" strokeLinejoin="round" />
      <path
        d="M28 30 C40 22 80 22 92 30 C96 33 96 39 92 42 C80 50 40 50 28 42 C24 39 24 33 28 30 Z"
        fill="#F2A49B"
        stroke="#D07D74"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <circle cx="44" cy="34" r="2.6" fill="#FFF6F1" />
      <circle cx="60" cy="31" r="2.6" fill="#FFF6F1" />
      <circle cx="76" cy="34" r="2.6" fill="#FFF6F1" />
      <circle cx="52" cy="41" r="2.6" fill="#FFF6F1" />
      <circle cx="68" cy="41" r="2.6" fill="#FFF6F1" />
      <circle cx="60" cy="60" r="2.4" fill="#FFF6F1" />
    </>
  ),
  mask: (
    <>
      <path d="M30 40 C18 41 12 47 12 53 s7 11 17 11" stroke="#9FCDAA" strokeWidth="3.5" strokeLinecap="round" fill="none" />
      <path d="M90 40 C102 41 108 47 108 53 s-7 11-17 11" stroke="#9FCDAA" strokeWidth="3.5" strokeLinecap="round" fill="none" />
      <path
        d="M32 36 C32 29 39 26 46 26 h28 c7 0 14 3 14 10 v12 c0 15-17 25-28 25 S32 73 32 58 Z"
        fill="#FFFDF8"
        stroke="#C4B29C"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path d="M44 42 h32 M44 52 h32 M46 62 h28" stroke="#EADFCC" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="42" cy="57" r="3.5" fill="#F8CFC7" />
      <circle cx="78" cy="57" r="3.5" fill="#F8CFC7" />
    </>
  ),
  lotion: (
    <>
      <path d="M57 10 h15 c3 0 3 6 0 6 h-6" fill="none" stroke="#D9B98F" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M57 10 v14" stroke="#D9B98F" strokeWidth="2.5" strokeLinecap="round" />
      <rect x="50" y="24" width="14" height="9" rx="2.5" fill="#FFE9CF" stroke="#D9B98F" strokeWidth="2.5" />
      <path
        d="M46 33 h22 c5 0 8 4 8 9 v29 c0 6-4 10-10 10 H48 c-6 0-10-4-10-10 V42 c0-5 3-9 8-9 Z"
        fill="#F6C2CE"
        stroke="#D492A4"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <rect x="46" y="47" width="30" height="20" rx="6" fill="#FFFDF8" stroke="#EED3DA" strokeWidth="2" />
      <path d="M61 52 c-2.4 2.6-3.6 4.3-3.6 6a3.6 3.6 0 0 0 7.2 0 c0-1.7-1.2-3.4-3.6-6 Z" fill="#F6C2CE" />
    </>
  ),
  cardigan: (
    <>
      <path
        d="M40 24 c5-6 12-8 20-8 s15 2 20 8 l9 15 -11 7 -4-7 v33 c0 4-3 6-7 6 H53 c-4 0-7-2-7-6 V39 l-4 7 -11-7 Z"
        fill="#F0E1C8"
        stroke="#C9AE85"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path d="M60 18 v60" stroke="#C9AE85" strokeWidth="2" />
      <path d="M51 17 60 32 69 17" fill="none" stroke="#C9AE85" strokeWidth="2" strokeLinejoin="round" />
      <circle cx="66" cy="44" r="2" fill="#C9AE85" />
      <circle cx="66" cy="54" r="2" fill="#C9AE85" />
      <circle cx="66" cy="64" r="2" fill="#C9AE85" />
    </>
  ),
};

const ItemIllustration = ({ art }: { art: ItemArt }) => (
  <svg width="104" height="84" viewBox="0 0 120 96" fill="none" aria-hidden="true">
    {ART[art]}
  </svg>
);

export default ItemIllustration;
