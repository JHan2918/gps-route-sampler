import type { Metadata } from "next";
import Image from "next/image";

export const metadata: Metadata = {
  title: "서비스 일시 중단",
  description: "서비스 점검 안내",
  robots: { index: false, follow: false },
};

export default function MaintenancePage() {
  return (
    <main className="maintenancePage">
      <section className="maintenanceCard" aria-labelledby="maintenance-title">
        <div className="maintenanceGlow" aria-hidden="true" />
        <Image className="maintenanceImage" src="/gps-maintenance.png" width={420} height={420} priority alt="지도와 GPS 위치 핀 일러스트" />
        <p className="maintenanceLabel">GPS</p>
        <h1 id="maintenance-title">서비스 일시 중단</h1>
        <p className="maintenanceMessage">
          더 나은 서비스를 위해 잠시 점검 중입니다.
          <br />
          이용에 불편을 드려 죄송합니다.
        </p>
      </section>
    </main>
  );
}
