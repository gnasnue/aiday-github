import type { WeatherData } from "./weather-api";

export const mockWeather: WeatherData = {
  temp: 15,
  dustLevel: "보통",
  pollenLevel: "높음",
  uvIndex: 4,
  humidity: 42,
  windSpeed: "강함",
  timeline: [
    { time: "등원시간", hour: "08:00", icon: "⛅", temp: 12, feels: 10, dust: "보통", uv: "낮음", pollen: "높음", humidity: 45, wind: "약함" },
    { time: "야외활동", hour: "11:00", icon: "☀️", temp: 18, feels: 17, dust: "보통", uv: "보통", pollen: "높음", humidity: 38, wind: "보통" },
    { time: "하원시간", hour: "15:00", icon: "🌤️", temp: 21, feels: 20, dust: "나쁨", uv: "강함", pollen: "매우높음", humidity: 35, wind: "강함" },
    { time: "저녁", hour: "18:00", icon: "🌥️", temp: 16, feels: 14, dust: "보통", uv: "낮음", pollen: "보통", humidity: 50, wind: "강함" },
  ],
};
