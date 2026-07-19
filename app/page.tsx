"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";

type Point = { lat: number; lng: number };
type Sample = Point & { no: number; distance: number; bearing: number };
type SubPoint = Point & { name: string; parent: string; distance: number; offset: number; side: "left" | "right" };
type UtmPoint = { zone: string; easting: number; northing: number };
type KoreaTmPoint = { easting: number; northing: number };
type WorkMode = "draw" | "test" | "import";

declare global {
  interface Window { naver?: any; initNaverMap?: () => void; navermap_authFailure?: () => void }
}

const CLIENT_ID = "gkiaj1k1r8";
const R = 6371008.8;

function toUtm({ lat, lng }: Point): UtmPoint {
  const a = 6378137;
  const eccSquared = 0.00669438;
  const k0 = 0.9996;
  const zoneNumber = Math.floor((lng + 180) / 6) + 1;
  const longOrigin = (zoneNumber - 1) * 6 - 180 + 3;
  const rad = Math.PI / 180;
  const latRad = lat * rad;
  const longRad = lng * rad;
  const originRad = longOrigin * rad;
  const eccPrimeSquared = eccSquared / (1 - eccSquared);
  const n = a / Math.sqrt(1 - eccSquared * Math.sin(latRad) ** 2);
  const t = Math.tan(latRad) ** 2;
  const c = eccPrimeSquared * Math.cos(latRad) ** 2;
  const A = Math.cos(latRad) * (longRad - originRad);
  const m = a * ((1 - eccSquared / 4 - 3 * eccSquared ** 2 / 64 - 5 * eccSquared ** 3 / 256) * latRad
    - (3 * eccSquared / 8 + 3 * eccSquared ** 2 / 32 + 45 * eccSquared ** 3 / 1024) * Math.sin(2 * latRad)
    + (15 * eccSquared ** 2 / 256 + 45 * eccSquared ** 3 / 1024) * Math.sin(4 * latRad)
    - (35 * eccSquared ** 3 / 3072) * Math.sin(6 * latRad));
  const easting = k0 * n * (A + (1 - t + c) * A ** 3 / 6 + (5 - 18 * t + t ** 2 + 72 * c - 58 * eccPrimeSquared) * A ** 5 / 120) + 500000;
  let northing = k0 * (m + n * Math.tan(latRad) * (A ** 2 / 2 + (5 - t + 9 * c + 4 * c ** 2) * A ** 4 / 24 + (61 - 58 * t + t ** 2 + 600 * c - 330 * eccPrimeSquared) * A ** 6 / 720));
  if (lat < 0) northing += 10000000;
  return { zone: `${zoneNumber}${lat >= 0 ? "N" : "S"}`, easting, northing };
}

function toKoreaCentral({ lat, lng }: Point): KoreaTmPoint {
  const a = 6378137;
  const invF = 298.257222101;
  const f = 1 / invF;
  const e2 = 2 * f - f * f;
  const ep2 = e2 / (1 - e2);
  const k0 = 1;
  const lat0 = 38 * Math.PI / 180;
  const lon0 = 127 * Math.PI / 180;
  const phi = lat * Math.PI / 180;
  const lambda = lng * Math.PI / 180;
  const meridional = (p: number) => a * (
    (1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256) * p
    - (3 * e2 / 8 + 3 * e2 ** 2 / 32 + 45 * e2 ** 3 / 1024) * Math.sin(2 * p)
    + (15 * e2 ** 2 / 256 + 45 * e2 ** 3 / 1024) * Math.sin(4 * p)
    - (35 * e2 ** 3 / 3072) * Math.sin(6 * p)
  );
  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);
  const tanPhi = Math.tan(phi);
  const n = a / Math.sqrt(1 - e2 * sinPhi ** 2);
  const t = tanPhi ** 2;
  const c = ep2 * cosPhi ** 2;
  const A = cosPhi * (lambda - lon0);
  const m = meridional(phi) - meridional(lat0);
  const easting = 200000 + k0 * n * (A + (1 - t + c) * A ** 3 / 6 + (5 - 18 * t + t ** 2 + 72 * c - 58 * ep2) * A ** 5 / 120);
  const northing = 600000 + k0 * (m + n * tanPhi * (A ** 2 / 2 + (5 - t + 9 * c + 4 * c ** 2) * A ** 4 / 24 + (61 - 58 * t + t ** 2 + 600 * c - 330 * ep2) * A ** 6 / 720));
  return { easting, northing };
}

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

function bearing(a: Point, b: Point) {
  const rad = Math.PI / 180;
  const p1 = a.lat * rad, p2 = b.lat * rad, dl = (b.lng - a.lng) * rad;
  return (Math.atan2(Math.sin(dl) * Math.cos(p2), Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl)) / rad + 360) % 360;
}

function destination(point: Point, bearingDegrees: number, meters: number): Point {
  const rad = Math.PI / 180;
  const angular = meters / R;
  const p1 = point.lat * rad, l1 = point.lng * rad, direction = bearingDegrees * rad;
  const p2 = Math.asin(Math.sin(p1) * Math.cos(angular) + Math.cos(p1) * Math.sin(angular) * Math.cos(direction));
  const l2 = l1 + Math.atan2(Math.sin(direction) * Math.sin(angular) * Math.cos(p1), Math.cos(angular) - Math.sin(p1) * Math.sin(p2));
  return { lat: p2 / rad, lng: ((l2 / rad + 540) % 360) - 180 };
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
    return { ...interpolate(path[segment], path[segment + 1], ratio), no: index + 1, distance: target, bearing: bearing(path[segment], path[segment + 1]) };
  });
  return { samples, total };
}

function samplesFromPoints(points: Point[]): { samples: Sample[]; total: number } {
  let total = 0;
  const samples = points.map((point, index) => {
    if (index > 0) total += distance(points[index - 1], point);
    const direction = index < points.length - 1
      ? bearing(point, points[index + 1])
      : index > 0 ? bearing(points[index - 1], point) : 0;
    return { ...point, no: index + 1, distance: total, bearing: direction };
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
  const subMarkers = useRef<any[]>([]);
  const testMarker = useRef<any>(null);
  const modeRef = useRef<WorkMode>("test");
  const cadastralLayer = useRef<any>(null);
  const trafficLayer = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [scriptEnabled, setScriptEnabled] = useState(false);
  const [mapError, setMapError] = useState("");
  const [path, setPath] = useState<Point[]>([]);
  const [interval, setInterval] = useState(5);
  const [includeEnd, setIncludeEnd] = useState(true);
  const [enableSubpoints, setEnableSubpoints] = useState(false);
  const [subSpacing, setSubSpacing] = useState(3);
  const [subCount, setSubCount] = useState(4);
  const [subSide, setSubSide] = useState<"left" | "right">("left");
  const [constructionVisible, setConstructionVisible] = useState(true);
  const [showCadastral, setShowCadastral] = useState(false);
  const [showTraffic, setShowTraffic] = useState(false);
  const [mode, setMode] = useState<WorkMode>("test");
  const [importedPoints, setImportedPoints] = useState<Point[]>([]);
  const [importMessage, setImportMessage] = useState("");
  const [testPoint, setTestPoint] = useState<Point | null>(null);
  const [samples, setSamples] = useState<Sample[]>([]);
  const [subPoints, setSubPoints] = useState<SubPoint[]>([]);
  const [total, setTotal] = useState(0);

  const clearSampleMarkers = useCallback(() => {
    sampleMarkers.current.forEach((m) => m.setMap(null));
    sampleMarkers.current = [];
  }, []);

  const clearSubMarkers = useCallback(() => {
    subMarkers.current.forEach((m) => m.setMap(null));
    subMarkers.current = [];
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
      if (modeRef.current === "import") return;
      setPath((prev) => [...prev, { lat: e.coord.lat(), lng: e.coord.lng() }]);
      setSamples([]);
      setSubPoints([]);
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
    lineRef.current.setMap(mapRef.current);
    setConstructionVisible(true);
    lineRef.current.setPath(path.map((p) => new n.LatLng(p.lat, p.lng)));
    vertexMarkers.current.forEach((m) => m.setMap(null));
    vertexMarkers.current = path.map((p, i) => new n.Marker({
      map: mapRef.current, position: new n.LatLng(p.lat, p.lng),
      icon: { content: `<div class="vertex ${i === 0 ? "start" : i === path.length - 1 ? "end" : ""}">${i === 0 ? "시" : i === path.length - 1 ? "종" : ""}</div>`, anchor: new n.Point(8, 8) },
    }));
    clearSampleMarkers();
    clearSubMarkers();
    setSamples([]); setSubPoints([]); setTotal(0);
  }, [path, clearSampleMarkers, clearSubMarkers]);

  useEffect(() => () => {
    if (clickRef.current && window.naver?.maps) window.naver.maps.Event.removeListener(clickRef.current);
  }, []);

  function calculate() {
    if ((mode === "import" ? importedPoints.length : path.length) < 2 || (mode !== "import" && (!Number.isFinite(interval) || interval <= 0))) return;
    const result = mode === "import" ? samplesFromPoints(importedPoints) : createSamples(path, interval, includeEnd);
    setSamples(result.samples); setTotal(result.total); clearSampleMarkers(); clearSubMarkers();
    const n = window.naver.maps;
    sampleMarkers.current = result.samples.map((p) => new n.Marker({
      map: mapRef.current, position: new n.LatLng(p.lat, p.lng),
      title: `t${p.no}`, zIndex: 100, icon: { content: `<div class="sample-marker" title="t${p.no}">t${p.no}</div>`, anchor: new n.Point(15, 15) },
    }));
    const generated: SubPoint[] = [];
    if (enableSubpoints && subSpacing > 0 && subCount > 0) {
      result.samples.forEach((p) => {
        for (let i = 1; i <= Math.floor(subCount); i++) {
          const name = `t${p.no}-${i}`;
          generated.push({ ...destination(p, p.bearing + (subSide === "right" ? 90 : -90), subSpacing * i), name, parent: `t${p.no}`, distance: p.distance, offset: subSpacing * i, side: subSide });
        }
      });
    }
    setSubPoints(generated);
    subMarkers.current = generated.map((p) => new n.Marker({
      map: mapRef.current, position: new n.LatLng(p.lat, p.lng), title: p.name, zIndex: 90,
      icon: { content: `<div class="sub-marker" title="${p.name}"></div>`, anchor: new n.Point(6, 6) },
    }));
  }

  async function importCoordinateFile(file?: File) {
    if (!file) return;
    try {
      const text = (await file.text()).replace(/^\uFEFF/, "");
      const lines = text.split(/\r?\n/).filter((line) => line.trim());
      if (lines.length < 2) throw new Error("좌표 행이 없습니다.");
      const headers = lines[0].split(",").map((value) => value.trim().replace(/^"|"$/g, "").toLowerCase());
      const findColumn = (names: string[]) => headers.findIndex((header) => names.includes(header));
      const latIndex = findColumn(["위도", "latitude", "lat", "y"]);
      const lngIndex = findColumn(["경도", "longitude", "lng", "lon", "long", "x"]);
      const kindIndex = findColumn(["구분", "type", "kind"]);
      if (latIndex < 0 || lngIndex < 0) throw new Error("'위도/경도' 또는 'lat/lng' 열을 찾을 수 없습니다.");
      const points = lines.slice(1).map((line) => line.split(",").map((value) => value.trim().replace(/^"|"$/g, "")))
        .filter((cols) => kindIndex < 0 || !cols[kindIndex] || cols[kindIndex] === "기준점")
        .map((cols) => ({ lat: Number(cols[latIndex]), lng: Number(cols[lngIndex]) }))
        .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng) && Math.abs(point.lat) <= 90 && Math.abs(point.lng) <= 180);
      if (points.length < 2) throw new Error("유효한 기준 좌표가 2개 이상 필요합니다.");
      setImportedPoints(points);
      setPath(points);
      setImportMessage(`${file.name}: 기준 좌표 ${points.length}개를 불러왔습니다.`);
      const n = window.naver?.maps;
      if (n && mapRef.current) {
        const bounds = new n.LatLngBounds();
        points.forEach((point) => bounds.extend(new n.LatLng(point.lat, point.lng)));
        mapRef.current.fitBounds(bounds, { top: 50, right: 50, bottom: 50, left: 50 });
      }
    } catch (error) {
      setImportedPoints([]);
      setImportMessage(error instanceof Error ? error.message : "파일을 읽지 못했습니다.");
    }
  }

  function hideConstruction() {
    if (lineRef.current) lineRef.current.setMap(null);
    vertexMarkers.current.forEach((m) => m.setMap(null));
    vertexMarkers.current = [];
    setConstructionVisible(false);
  }

  function reset() {
    if (lineRef.current) lineRef.current.setPath([]);
    vertexMarkers.current.forEach((m) => m.setMap(null));
    vertexMarkers.current = [];
    clearSampleMarkers();
    clearSubMarkers();
    if (testMarker.current) {
      testMarker.current.setMap(null);
      testMarker.current = null;
    }
    setPath([]);
    setImportedPoints([]);
    setImportMessage("");
    setSamples([]);
    setSubPoints([]);
    setTotal(0);
    setTestPoint(null);
  }

  function downloadCsv() {
    const header = "번호,누적거리_m,위도,경도,UTM_Zone,UTM_E_m,UTM_N_m,EPSG5186_E_m,EPSG5186_N_m\r\n";
    const csvHeader = "이름,구분,기준점,진행거리_m,직각방향,직각거리_m,위도,경도,UTM_Zone,UTM_E_m,UTM_N_m,EPSG5186_E_m,EPSG5186_N_m\r\n";
    const baseRows = samples.map((p) => ({ ...p, name: `t${p.no}`, parent: `t${p.no}`, kind: "기준점", side: "" as const, offset: 0 }));
    const rows = [...baseRows, ...subPoints.map((p) => ({ ...p, kind: "서브포인트" }))].map((p) => {
      const utm = toUtm(p);
      const korea = toKoreaCentral(p);
      const side = p.side === "left" ? "왼쪽" : p.side === "right" ? "오른쪽" : "";
      return `${p.name},${p.kind},${p.parent},${p.distance.toFixed(2)},${side},${p.offset.toFixed(2)},${p.lat.toFixed(7)},${p.lng.toFixed(7)},${utm.zone},${utm.easting.toFixed(3)},${utm.northing.toFixed(3)},${korea.easting.toFixed(3)},${korea.northing.toFixed(3)}`;
    }).join("\r\n");
    const blob = new Blob(["\ufeff" + csvHeader + rows], { type: "text/csv;charset=utf-8" });
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
            <button className={mode === "test" ? "active test" : ""} onClick={() => setMode("test")}>테스트 위치 확인</button>
            <button className={mode === "draw" ? "active" : ""} onClick={() => setMode("draw")}>경로 그리기</button>
            <button className={mode === "import" ? "active import" : ""} onClick={() => setMode("import")}>파일 불러와서 그리기</button>
          </div>
          {mode === "test" && <div className="testPanel">
            <b>확인할 지점을 클릭하세요</b>
            {testPoint ? (() => {
              const utm = toUtm(testPoint);
              const korea = toKoreaCentral(testPoint);
              return <><p>위도 <strong>{testPoint.lat.toFixed(7)}</strong></p><p>경도 <strong>{testPoint.lng.toFixed(7)}</strong></p><div className="utmDivider" /><p>UTM Zone <strong>{utm.zone}</strong></p><p>UTM N <strong>{utm.northing.toFixed(3)} m</strong></p><p>UTM E <strong>{utm.easting.toFixed(3)} m</strong></p><div className="utmDivider" /><p>국내 중부원점 <strong>EPSG:5186</strong></p><p>N (Northing) <strong>{korea.northing.toFixed(3)} m</strong></p><p>E (Easting) <strong>{korea.easting.toFixed(3)} m</strong></p></>;
            })() : <p>클릭한 한 점의 위경도와 UTM 좌표가 여기에 표시됩니다.</p>}
          </div>}
          {mode === "import" && <div className="importPanel">
            <b>기준 좌표 CSV 불러오기</b>
            <p>위도·경도 또는 lat·lng 열이 있는 CSV를 선택하세요. 이 도구에서 저장한 CSV는 기준점만 자동으로 읽습니다.</p>
            <label className="fileButton">CSV 파일 선택<input type="file" accept=".csv,text/csv" onChange={(e) => importCoordinateFile(e.target.files?.[0])} /></label>
            {importMessage && <p className={importedPoints.length ? "importSuccess" : "importError"}>{importMessage}</p>}
          </div>}
          <div className="step"><span>1</span><div><b>{mode === "import" ? "기준 좌표 불러오기" : "경로 그리기"}</b><p>{mode === "import" ? "파일의 좌표 순서대로 기준점과 경로를 지도에 표시합니다." : "지도에서 시점부터 종점까지 도로를 따라 차례로 클릭하세요."}</p></div></div>
          <div className="toolbar"><button className="minor" onClick={() => setPath((p) => p.slice(0, -1))} disabled={!path.length || mode === "import"}>마지막 점 취소</button><button className="minor danger" onClick={reset} disabled={!path.length}>전체 초기화</button></div>
          <div className="step second"><span>2</span><div><b>조사 간격 설정</b><p>전체 경로의 시점부터 입력 거리마다 좌표를 계산합니다.</p></div></div>
          {mode !== "import" && <><label htmlFor="interval">조사 간격</label>
          <div className="inputRow"><input id="interval" type="number" min="0.1" step="0.1" value={interval} onChange={(e) => setInterval(Number(e.target.value))} /><em>m</em></div>
          <label className="check"><input type="checkbox" checked={includeEnd} onChange={(e) => setIncludeEnd(e.target.checked)} /> 마지막 종점 포함</label></>}
          <div className="subOptions">
            <label className="check"><input type="checkbox" checked={enableSubpoints} onChange={(e) => setEnableSubpoints(e.target.checked)} /> 도로 직각 서브포인트 생성</label>
            {enableSubpoints && <div className="subOptionGrid">
              <label>도로 방향<select value={subSide} onChange={(e) => setSubSide(e.target.value as "left" | "right")}><option value="left">진행방향 왼쪽</option><option value="right">진행방향 오른쪽</option></select></label>
              <label>포인트 간격 (m)<input type="number" min="0.1" step="0.1" value={subSpacing} onChange={(e) => setSubSpacing(Number(e.target.value))} /></label>
              <label>포인트 개수<input type="number" min="1" step="1" value={subCount} onChange={(e) => setSubCount(Number(e.target.value))} /></label>
            </div>}
          </div>
          <div className="layerBox">
            <b>지도 레이어</b>
            <p>지도 왼쪽 위 메뉴에서 일반·위성·지형을 전환할 수 있습니다.</p>
            <label className="check"><input type="checkbox" checked={showCadastral} onChange={(e) => setShowCadastral(e.target.checked)} disabled={!ready} /> 지적편집도 표시</label>
            <label className="check"><input type="checkbox" checked={showTraffic} onChange={(e) => setShowTraffic(e.target.checked)} disabled={!ready} /> 교통정보 표시</label>
          </div>
          <button onClick={calculate} disabled={(mode === "import" ? importedPoints.length : path.length) < 2 || (mode !== "import" && interval <= 0)}>{mode === "import" ? "불러온 기준점으로 서브포인트 계산" : "조사 위치 계산"}</button>
          <button className="hideConstruction" onClick={hideConstruction} disabled={!samples.length || !constructionVisible}>폴리라인·그리기 점 숨기기</button>
          <div className="divider" />
          {!!subPoints.length && <p className="subCount">서브포인트 <strong>{subPoints.length}개</strong></p>}
          <dl><div><dt>경로 꼭짓점</dt><dd>{path.length}개</dd></div><div><dt>전체 경로</dt><dd>{total ? total.toFixed(2) : "—"} m</dd></div><div><dt>조사 위치</dt><dd>{samples.length || "—"}개</dd></div></dl>
          <button className="secondary" onClick={downloadCsv} disabled={!samples.length}>CSV 다운로드</button>
        </aside>
        <div className="mapShell"><div ref={mapNode} className="map" />{!ready && <div className={`mapNotice ${mapError ? "error" : ""}`}><h2>{mapError ? "지도를 표시할 수 없습니다" : "네이버 지도를 불러오는 중입니다"}</h2><p>{mapError || "잠시만 기다려 주세요."}</p></div>}<div className="mapBadge">지도를 클릭해 경로를 그리세요</div></div>
      </section>
    </main>
  );
}
