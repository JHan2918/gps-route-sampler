"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";

type Point = { lat: number; lng: number };
type Sample = Point & { no: number; distance: number };

declare global {
  interface Window { naver?: any }
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
  const [ready, setReady] = useState(false);
  const [path, setPath] = useState<Point[]>([]);
  const [interval, setInterval] = useState(5);
  const [includeEnd, setIncludeEnd] = useState(true);
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
      zoomControl: true, zoomControlOptions: { position: n.Position.TOP_RIGHT },
    });
    mapRef.current = map;
    lineRef.current = new n.Polyline({ map, path: [], strokeColor: "#03c75a", strokeWeight: 5, strokeOpacity: 0.9 });
    clickRef.current = n.Event.addListener(map, "click", (e: any) => {
      setPath((prev) => [...prev, { lat: e.coord.lat(), lng: e.coord.lng() }]);
      setSamples([]);
    });
    setReady(true);
  }, []);

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

  function reset() { setPath([]); clearSampleMarkers(); }

  function downloadCsv() {
    const header = "번호,누적거리_m,위도,경도\r\n";
    const rows = samples.map((p) => `${p.no},${p.distance.toFixed(2)},${p.lat.toFixed(7)},${p.lng.toFixed(7)}`).join("\r\n");
    const blob = new Blob(["\ufeff" + header + rows], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a");
    a.href = url; a.download = `gps-route-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(url);
  }

  return (
    <main>
      <Script src={`https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${CLIENT_ID}`} strategy="afterInteractive" onLoad={initMap} />
      <header className="topbar">
        <div><p className="eyebrow">FIELD ROUTE SAMPLER</p><h1>GPS 경로 좌표 도구</h1></div>
        <span className={`status ${ready ? "online" : ""}`}><i />{ready ? "네이버 지도 연결됨" : "지도 불러오는 중"}</span>
      </header>
      <section className="workspace">
        <aside className="panel">
          <div className="step"><span>1</span><div><b>경로 그리기</b><p>지도에서 시점부터 종점까지 도로를 따라 차례로 클릭하세요.</p></div></div>
          <div className="toolbar"><button className="minor" onClick={() => setPath((p) => p.slice(0, -1))} disabled={!path.length}>마지막 점 취소</button><button className="minor danger" onClick={reset} disabled={!path.length}>전체 초기화</button></div>
          <div className="step second"><span>2</span><div><b>조사 간격 설정</b><p>전체 경로의 시점부터 입력 거리마다 좌표를 계산합니다.</p></div></div>
          <label htmlFor="interval">조사 간격</label>
          <div className="inputRow"><input id="interval" type="number" min="0.1" step="0.1" value={interval} onChange={(e) => setInterval(Number(e.target.value))} /><em>m</em></div>
          <label className="check"><input type="checkbox" checked={includeEnd} onChange={(e) => setIncludeEnd(e.target.checked)} /> 마지막 종점 포함</label>
          <button onClick={calculate} disabled={path.length < 2 || interval <= 0}>조사 위치 계산</button>
          <div className="divider" />
          <dl><div><dt>경로 꼭짓점</dt><dd>{path.length}개</dd></div><div><dt>전체 경로</dt><dd>{total ? total.toFixed(2) : "—"} m</dd></div><div><dt>조사 위치</dt><dd>{samples.length || "—"}개</dd></div></dl>
          <button className="secondary" onClick={downloadCsv} disabled={!samples.length}>CSV 다운로드</button>
        </aside>
        <div className="mapShell"><div ref={mapNode} className="map" />{!ready && <div className="mapNotice"><h2>네이버 지도를 불러오는 중입니다</h2><p>잠시만 기다려 주세요.</p></div>}<div className="mapBadge">지도를 클릭해 경로를 그리세요</div></div>
      </section>
    </main>
  );
}
