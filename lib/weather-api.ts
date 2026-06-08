export type DustLevel = "좋음" | "보통" | "나쁨" | "매우나쁨";
export type PollenLevel = "낮음" | "보통" | "높음" | "매우높음";
export type WindLevel = "약함" | "보통" | "강함";
export type UvLevel = "낮음" | "보통" | "강함" | "매우강함";

export interface TimeSlot {
  time: string;
  hour: string;
  icon: string;
  temp: number;
  feels: number;
  dust: DustLevel;
  uv: UvLevel;
  pollen: PollenLevel;
  humidity: number;
  wind: WindLevel;
}

export interface WeatherData {
  temp: number;
  dustLevel: DustLevel;
  pollenLevel: PollenLevel;
  uvIndex: number;
  humidity: number;
  windSpeed: WindLevel;
  timeline: TimeSlot[];
}
