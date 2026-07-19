"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";

type Point = { lat: number; lng: number };
type Sample = Point & { no: number; distance: number };

declare global {
  interface Window { naver?: any; initNaverMap?: () => void; navermap_authFailure?: () => void }
}

const CLIENT_ID = "gkiaj1k1r8";
const R = 6371008.8;

function distance(a: Point, b: Point) {
  const rad = Math.PI / 180;
  const p1 = a.lat * rad, p2 = b.lat * rad;
  const dp = (b.lat - a.lat) * rad, dl = (b.lng - a.lng) * rad;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function interpolate(a: Point, b: Point, ratio: number): Point {
  return { lat: a.lat + (b.lat - a.lat) * ratio, lng: a.lng + (b.lng - a.lng) * ratio };
}

function createSamples(path: Point[], interval: number, includeEnd: boolean) {
  if (path.length < 2 || interval <= 0) return { samples: [] as Sample[], total: 0 };
  const lengths = path.slice(1).map((p, i) => distance(path[i], p));
  const total = lengths.reduce((a, b) => a + b, 0);
  const targets: number[] = [];
  for (let d = 0; d <= total + 1e-7; d += interval) targets.push(Math.min(d, total));
  if (includeEnd && total - targets[targets.length - 1] > 0.01) targets.push(total);
  let segment = 0, passed = 0;
  const samples = targets.map((target, index) => {
    while (segment < lengths.length - 1 && passed + lengths[segment] < target) {
      passed += lengths[segment++];
    }
    const len = lengths[segment];
    const ratio = len ? Math.max(0, Math.min(1, (target - passed) / len)) : 0;
    return { ...interpolate(path[segment], path[segment + 1], ratio), no: index + 1, distance: target };
  });
  return { samples, total };
}

export default function Home() {
  const mapNode = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const lineRef = useRef<any>(null);
  const clickRef = useRef<any>(null);
  const vertexMarkers = useRef<any[]>([]);
  const sampleMarkers = useRef<any[]>([]);
  const testMarker = useRef<any>(null);
  const modeRef = useRef<"draw" | "test">("draw");
  const cadastralLayer = useRef<any>(null);
  const trafficLayer = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [scriptEnabled, setScriptEnabled] = useState(false);
  const [mapError, setMapError] = useState("");
  const [path, setPath] = useState<Point[]>([]);
  const [interval, setInterval] = useState(5);
  const [includeEnd, setIncludeEnd] = useState(true);
  const [showCadastral, setShowCadastral] = useState(false);
  const [showTraffic, setShowTraffic] = useState(false);
  const [mode, setMode] = useState<"draw" | "test">("draw");
  const [testPoint, setTestPoint] = useState<Point | null>(null);
  const [samples, setSamples] = useState<Sample[]>([]);
  const [total, setTotal] = useState(0);

  const clearSampleMarkers = useCallback(() => {
    sampleMarkers.current.forEach((m) => m.setMap(null));
    sampleMarkers.current = [];
  }, []);

  const initMap = useCallback(() => {
    if (!window.naver?.maps || !mapNode.current || mapRef.current) return;
    const n = window.naver.maps;
    const map = new n.Map(mapNode.current, {
      center: new n.LatLng(37.5666103, 126.9783882), zoom: 16,
      mapTypeControl: true,
      mapTypeControlOptions: { style: n.MapTypeControlStyle.DROPDOWN, position: n.Position.TOP_LEFT },
      zoomControl: true, zoomControlOptions: { position: n.Position.TOP_RIGHT },
    });
    mapRef.current = map;
    lineRef.current = new n.Polyline({ map, path: [], strokeColor: "#03c75a", strokeWeight: 5, strokeOpacity: 0.9 });
    cadastralLayer.current = new n.CadastralLayer();
    trafficLayer.current = new n.TrafficLayer();
    clickRef.current = n.Event.addListener(map, "click", (e: any) => {
      if (modeRef.current === "test") {
        const point = { lat: e.coord.lat(), lng: e.coord.lng() };
        setTestPoint(point);
        if (testMarker.current) testMarker.current.setMap(null);
        testMarker.current = new n.Marker({
          map, position: e.coord, zIndex: 200,
          icon: { content: '<div class="test-marker">확인</div>', anchor: new n.Point(24, 38) },
        });
        return;
      }
      setPath((prev) => [...prev, { lat: e.coord.lat(), lng: e.coord.lng() }]);
      setSamples([]);
    });
    n.Event.addListener(map, "idle", () => setReady(true));
    requestAnimationFrame(() => n.Event.trigger(map, "resize"));
  }, []);

  useEffect(() => {
    window.initNaverMap = initMap;
    window.navermap_authFailure = () => {
      setReady(false);
      setMapError("네이버 지도 인증에 실패했습니다. Client ID와 Web 서비스 URL을 확인해 주세요.");
    };
    setScriptEnabled(true);
    return () => {
      delete window.initNaverMap;
      delete window.navermap_authFailure;
    };
  }, [initMap]);

  useEffect(() => {
    if (cadastralLayer.current) cadastralLayer.current.setMap(showCadastral ? mapRef.current : null);
  }, [showCadastral, ready]);

  useEffect(() => {
    if (trafficLayer.current) trafficLayer.current.setMap(showTraffic ? mapRef.current : null);
  }, [showTraffic, ready]);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    const n = window.naver?.maps;
    if (!n || !mapRef.current) return;
    lineRef.current.setPath(path.map((p) => new n.LatLng(p.lat, p.lng)));
    vertexMarkers.current.forEach((m) => m.setMap(null));
    vertexMarkers.current = path.map((p, i) => new n.Marker({
      map: mapRef.current, position: new n.LatLng(p.lat, p.lng),
      icon: { content: `<div class="vertex ${i === 0 ? "start" : i === path.length - 1 ? "end" : ""}">${i === 0 ? "시" : i === path.length - 1 ? "종" : ""}</div>`, anchor: new n.Point(8, 8) },
    }));
    clearSampleMarkers();
    setSamples([]); setTotal(0);
  }, [path, clearSampleMarkers]);

  useEffect(() => () => {
    if (clickRef.current && window.naver?.maps) window.naver.maps.Event.removeListener(clickRef.current);
  }, []);

  function calculate() {
    if (path.length < 2 || !Number.isFinite(interval) || interval <= 0) return;
    const result = createSamples(path, interval, includeEnd);
    setSamples(result.samples); setTotal(result.total); clearSampleMarkers();
    const n = window.naver.maps;
    sampleMarkers.current = result.samples.map((p) => new n.Marker({
      map: mapRef.current, position: new n.LatLng(p.lat, p.lng),
      zIndex: 100, icon: { content: `<div class="sample-marker">${p.no}</div>`, anchor: new n.Point(14, 14) },
    }));
  }

  function reset() {
    if (lineRef.current) lineRef.current.setPath([]);
    vertexMarkers.current.forEach((m) => m.setMap(null));
    vertexMarkers.current = [];
    clearSampleMarkers();
    if (testMarker.current) {
      testMarker.current.setMap(null);
      testMarker.current = null;
    }
    setPath([]);
    setSamples([]);
    setTotal(0);
    setTestPoint(null);
  }

  function downloadCsv() {
    const header = "번호,누적거리_m,위도,경도\r\n";
    const rows = samples.map((p) => `${p.no},${p.distance.toFixed(2)},${p.lat.toFixed(7)},${p.lng.toFixed(7)}`).join("\r\n");
    const blob = new Blob(["\ufeff" + header + rows], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a");
    a.href = url; a.download = `gps-route-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(url);
  }

  return (
    <main>
      {scriptEnabled && <Script
        id="naver-map-sdk"
        src={`https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${CLIENT_ID}`}
        strategy="afterInteractive"
        onLoad={initMap}
        onError={() => setMapError("네이버 지도 파일을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.")}
      />}
      <header className="topbar">
        <div><p className="eyebrow">FIELD ROUTE SAMPLER</p><h1>GPS 경로 좌표 도구</h1></div>
        <span className={`status ${ready ? "online" : mapError ? "failed" : ""}`}><i />{ready ? "네이버 지도 연결됨" : mapError ? "지도 연결 실패" : "지도 불러오는 중"}</span>
      </header>
      <section className="workspace">
        <aside className="panel">
          <div className="modeSwitch" role="group" aria-label="지도 클릭 모드">
            <button className={mode === "draw" ? "active" : ""} onClick={() => setMode("draw")}>경로 그리기</button>
            <button className={mode === "test" ? "active test" : ""} onClick={() => setMode("test")}>테스트 위치 확인</button>
          </div>
          {mode === "test" && <div className="testPanel">
            <b>확인할 지점을 클릭하세요</b>
            {testPoint ? <><p>위도 <strong>{testPoint.lat.toFixed(7)}</strong></p><p>경도 <strong>{testPoint.lng.toFixed(7)}</strong></p></> : <p>클릭한 한 점의 GPS 좌표가 여기에 표시됩니다.</p>}
          </div>}
          <div className="step"><span>1</span><div><b>경로 그리기</b><p>지도에서 시점부터 종점까지 도로를 따라 차례로 클릭하세요.</p></div></div>
          <div className="toolbar"><button className="minor" onClick={() => setPath((p) => p.slice(0, -1))} disabled={!path.length}>마지막 점 취소</button><button className="minor danger" onClick={reset} disabled={!path.length}>전체 초기화</button></div>
          <div className="step second"><span>2</span><div><b>조사 간격 설정</b><p>전체 경로의 시점부터 입력 거리마다 좌표를 계산합니다.</p></div></div>
          <label htmlFor="interval">조사 간격</label>
          <div className="inputRow"><input id="interval" type="number" min="0.1" step="0.1" value={interval} onChange={(e) => setInterval(Number(e.target.value))} /><em>m</em></div>
          <label className="check"><input type="checkbox" checked={includeEnd} onChange={(e) => setIncludeEnd(e.target.checked)} /> 마지막 종점 포함</label>
          <div className="layerBox">
            <b>지도 레이어</b>
            <p>지도 왼쪽 위 메뉴에서 일반·위성·지형을 전환할 수 있습니다.</p>
            <label className="check"><input type="checkbox" checked={showCadastral} onChange={(e) => setShowCadastral(e.target.checked)} disabled={!ready} /> 지적편집도 표시</label>
            <label className="check"><input type="checkbox" checked={showTraffic} onChange={(e) => setShowTraffic(e.target.checked)} disabled={!ready} /> 교통정보 표시</label>
          </div>
          <button onClick={calculate} disabled={path.length < 2 || interval <= 0}>조사 위치 계산</button>
          <div className="divider" />
          <dl><div><dt>경로 꼭짓점</dt><dd>{path.length}개</dd></div><div><dt>전체 경로</dt><dd>{total ? total.toFixed(2) : "—"} m</dd></div><div><dt>조사 위치</dt><dd>{samples.length || "—"}개</dd></div></dl>
          <button className="secondary" onClick={downloadCsv} disabled={!samples.length}>CSV 다운로드</button>
        </aside>
        <div className="mapShell"><div ref={mapNode} className="map" />{!ready && <div className={`mapNotice ${mapError ? "error" : ""}`}><h2>{mapError ? "지도를 표시할 수 없습니다" : "네이버 지도를 불러오는 중입니다"}</h2><p>{mapError || "잠시만 기다려 주세요."}</p></div>}<div className="mapBadge">지도를 클릭해 경로를 그리세요</div></div>
      </section>
    </main>
  );
}
