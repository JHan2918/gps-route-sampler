import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GPS 경로 좌표 도구",
  description: "폴리라인 경로에서 일정 간격 GPS 좌표를 생성하고 CSV로 저장합니다.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body>{children}</body></html>;
}
