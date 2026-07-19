"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { nearestSeoulGu } from "@/lib/locations";
import {
  AppLocation,
  LOCATION_CHANGE_EVENT,
  loadLocation,
  saveLocation,
} from "@/lib/location";

/**
 * 전역 위치 상태 훅 — 홈·환경·옷차림·마이가 공유.
 * localStorage(`aiday:location:v1`)를 단일 진실로 삼고, 한 화면에서 위치를 바꾸면
 * 같은 탭의 다른 마운트 화면과 다른 탭 모두에 동기화된다.
 */
export function useLocation() {
  const [location, setLocation] = useState<AppLocation>(loadLocation);
  const [locating, setLocating] = useState(false);

  // 다른 화면/탭에서의 위치 변경을 반영 (마운트 시 최신 저장값 재확인 포함)
  useEffect(() => {
    const sync = () => setLocation(loadLocation());
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener(LOCATION_CHANGE_EVENT, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(LOCATION_CHANGE_EVENT, sync);
    };
  }, []);

  // 위치 버튼: Geolocation → 서울 최근접 구 매핑 → 기준지 변경(라벨·측정소 동시 갱신).
  // 사용자 제스처 안에서만 권한을 요청하고, 서울 밖·거부·실패는 기본 기준지 유지 + 정직한 안내.
  const requestLocation = useCallback(() => {
    if (locating) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      toast("이 기기에서는 위치를 사용할 수 없어요");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const { latitude, longitude } = pos.coords;
        const gu = nearestSeoulGu(latitude, longitude);
        if (!gu) {
          toast("아직 서울 지역만 지원해요 — 기본 기준지(서울 중구)로 보여드려요");
          return;
        }
        const loc: AppLocation = { gu: gu.name, lat: latitude, lon: longitude, station: gu.name };
        setLocation(loc);
        saveLocation(loc);
        toast(`서울 ${gu.name} 기준으로 보여드릴게요`);
      },
      () => {
        setLocating(false);
        toast("위치 권한이 없어 기본 기준지(서울 중구)로 보여드려요");
      },
      { timeout: 8000, maximumAge: 600000 }
    );
  }, [locating]);

  return { location, locating, requestLocation };
}
