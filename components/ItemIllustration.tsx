/**
 * 추천 아이템 일러스트 8종 — 캐릭터 일러스트와 동일한 작가 톤
 * (파스텔 필 + 2.5px 라운드 스트로크). 디자인 핸드오프 HTML에서 추출.
 * 일러스트 에셋이므로 색은 토큰이 아닌 고정값 (DESIGN.md 캐릭터 예외와 동일 취급).
 */
export type ItemArt = "muffler" | "mask" | "lotion" | "cardigan" | "umbrella" | "sunscreen" | "cap" | "bottle";

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
  umbrella: (
    <>
      {/* 캐노피 — 아래 가장자리 스캘럽 */}
      <path
        d="M26 52 C26 30 42 18 60 18 C78 18 94 30 94 52 Q87 60 80 52 Q72.5 60 65 52 Q60 59 55 52 Q47.5 60 40 52 Q33 60 26 52 Z"
        fill="#A9CBE3"
        stroke="#6E9BBB"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path d="M60 18 V52 M60 22 Q45 30 40 53 M60 22 Q75 30 80 53" stroke="#6E9BBB" strokeWidth="1.6" fill="none" />
      <path d="M60 12 v6" stroke="#6E9BBB" strokeWidth="2.5" strokeLinecap="round" />
      {/* 손잡이 */}
      <path d="M60 52 V74 C60 80 51 80 51 73" stroke="#C99A6E" strokeWidth="2.6" strokeLinecap="round" fill="none" />
    </>
  ),
  sunscreen: (
    <>
      <rect x="50" y="20" width="20" height="12" rx="2.5" fill="#E9C6A0" stroke="#C89A6A" strokeWidth="2.5" />
      <path
        d="M46 32 h28 c4 0 6 3 6 7 v33 c0 6-4 10-10 10 H50 c-6 0-10-4-10-10 V39 c0-4 2-7 6-7 Z"
        fill="#FFE7A6"
        stroke="#E0B24E"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <circle cx="60" cy="58" r="8" fill="#F6B24E" />
      <path
        d="M60 44 v4 M60 68 v4 M46 58 h4 M70 58 h4 M50 48 l3 3 M70 48 l-3 3 M50 68 l3-3 M70 68 l-3-3"
        stroke="#F6B24E"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </>
  ),
  cap: (
    <>
      <path
        d="M30 58 C30 38 43 30 60 30 C77 30 90 38 90 58 Z"
        fill="#9FCDAA"
        stroke="#5F9C74"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path
        d="M88 56 C102 55 108 61 104 66 C96 68 88 65 84 61 Z"
        fill="#8ABF98"
        stroke="#5F9C74"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path d="M60 30 V58 M45 33 Q42 46 44 58 M75 33 Q78 46 76 58" stroke="#5F9C74" strokeWidth="1.6" fill="none" />
      <circle cx="60" cy="31" r="3" fill="#8ABF98" stroke="#5F9C74" strokeWidth="1.6" />
    </>
  ),
  bottle: (
    <>
      <rect x="51" y="14" width="18" height="10" rx="2.5" fill="#8FB9D6" stroke="#5E8CAD" strokeWidth="2.5" />
      <path d="M54 24 v6 M66 24 v6" stroke="#5E8CAD" strokeWidth="2.5" strokeLinecap="round" />
      <path
        d="M50 30 c-5 1-8 5-8 10 v33 c0 5 4 9 9 9 h18 c5 0 9-4 9-9 V40 c0-5-3-9-8-10 Z"
        fill="#BEE3DC"
        stroke="#63AC9F"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path d="M42 54 v19 c0 5 4 9 9 9 h18 c5 0 9-4 9-9 V54 Z" fill="#9FD6CC" opacity="0.5" />
      <path d="M42 54 h36" stroke="#63AC9F" strokeWidth="1.8" strokeLinecap="round" />
    </>
  ),
};

const ItemIllustration = ({ art }: { art: ItemArt }) => (
  <svg width="104" height="84" viewBox="0 0 120 96" fill="none" aria-hidden="true">
    {ART[art]}
  </svg>
);

export default ItemIllustration;
