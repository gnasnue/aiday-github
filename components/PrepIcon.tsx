import { CircleCheck, Droplets, Umbrella } from "lucide-react";
import LineIcon from "@/components/LineIcon";

// 준비물 이름 → 아이콘. 규격은 DESIGN.md "컨테이너 내 18px", stroke는 세트 기본값.
// 색은 부모(아이콘 타일)의 text-* 를 상속한다 — 준비물 아이콘은 상태색이 아니다.
//
// AI가 주는 체크리스트 항목은 "☂️ 우산" 형태이므로 이모지와 이름을 함께 넣어 매칭한다.
// 이모지는 절대 화면에 렌더하지 않는다(이모지 UI 전면 금지) — 매칭 키로만 쓴다.
const CLS = "h-[18px] w-[18px] shrink-0";

export const PrepIcon = ({ icon, text }: { icon?: string; text: string }) => {
  const s = `${icon ?? ""} ${text}`;
  if (/😷|마스크/.test(s)) return <LineIcon name="mask" className={CLS} />;
  if (/🧣|목수건|목도리/.test(s)) return <LineIcon name="scarf" className={CLS} />;
  if (/🧥|겉옷|가디건|외투|점퍼|방한/.test(s)) return <LineIcon name="cardigan" className={CLS} />;
  if (/🧢|👒|모자/.test(s)) return <LineIcon name="cap" className={CLS} />;
  if (/타올|수건/.test(s)) return <LineIcon name="towel" className={CLS} />;
  if (/☂|☔|우산|비옷/.test(s)) return <Umbrella size={18} strokeWidth={1.5} className={CLS} />;
  if (/가습기/.test(s)) return <Droplets size={18} strokeWidth={1.5} className={CLS} />;
  if (/🧴|💧|보습|로션|크림|미온수/.test(s)) return <LineIcon name="droplet" className={CLS} />;
  if (/물병|물통|물/.test(s)) return <LineIcon name="bottle" className={CLS} />;
  if (/☀|🕶|자외선|선크림|햇빛/.test(s)) return <LineIcon name="sun" className={CLS} />;
  if (/통풍|여벌|옷/.test(s)) return <LineIcon name="shirt" className={CLS} />;
  return <CircleCheck size={18} strokeWidth={1.5} className={CLS} />;
};

export default PrepIcon;
