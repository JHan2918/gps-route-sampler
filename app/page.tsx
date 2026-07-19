export const metadata = {
  title: "GPS 경로 좌표 도구",
  description: "네이버 지도에서 경로를 그리고 일정 간격의 GPS 좌표를 만드는 도구",
};

export default function Home() {
  return (
    <main>
      <header className="topbar">
        <div>
          <p className="eyebrow">FIELD ROUTE SAMPLER</p>
          <h1>GPS 경로 좌표 도구</h1>
        </div>
        <span className="status"><i /> 지도 API 연결 준비 중</span>
      </header>

      <section className="workspace">
        <aside className="panel">
          <div className="step"><span>1</span><div><b>경로 그리기</b><p>지도에서 시점부터 종점까지 도로를 따라 클릭합니다.</p></div></div>
          <div className="step"><span>2</span><div><b>조사 간격 설정</b><p>경로 위 조사 위치의 간격을 미터 단위로 입력합니다.</p></div></div>
          <label htmlFor="interval">조사 간격</label>
          <div className="inputRow"><input id="interval" type="number" min="0.1" step="0.1" defaultValue="5" disabled /><em>m</em></div>
          <button disabled>조사 위치 계산</button>
          <div className="divider" />
          <dl><div><dt>전체 경로</dt><dd>— m</dd></div><div><dt>조사 위치</dt><dd>— 개</dd></div></dl>
          <button className="secondary" disabled>CSV 다운로드</button>
        </aside>

        <div className="mapShell" aria-label="네이버 지도 표시 예정 영역">
          <div className="grid" />
          <div className="mapNotice">
            <span className="pin">●</span>
            <h2>지도 영역 준비 완료</h2>
            <p>배포 주소를 네이버 클라우드 플랫폼에 등록한 뒤<br />Client ID를 연결하면 지도가 표시됩니다.</p>
          </div>
          <div className="mapBadge">NAVER MAP 연결 예정</div>
        </div>
      </section>
    </main>
  );
}
