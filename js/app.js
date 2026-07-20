/* GeoVN — Vietnamese administrative GIS map (GitHub Pages) */
(() => {
  const VN_BOUNDS = [
    [8.1, 102.1],
    [23.6, 109.7],
  ];

  const FALLBACK_PALETTE = { fill: "#64748b", stroke: "#334155", soft: "#cbd5e1", softStroke: "#475569" };

  const state = {
    provinces: null,
    wards: null,
    provinceIndex: new Map(),
    wardIndex: new Map(),
    wardsByProvince: new Map(),
    provinceColors: new Map(),
    mode: "both",
    showLabels: true,
    selected: null,
    basemap: "light",
    measuring: false,
  };

  function colorForProvince(code) {
    return state.provinceColors.get(String(code)) || FALLBACK_PALETTE;
  }

  function darkenHex(hex, amount = 0.18) {
    const h = String(hex).replace("#", "");
    if (h.length !== 6) return hex;
    const mix = (c) => Math.max(0, Math.round(parseInt(c, 16) * (1 - amount)));
    return `#${[h.slice(0, 2), h.slice(2, 4), h.slice(4, 6)].map((p) => mix(p).toString(16).padStart(2, "0")).join("")}`;
  }

  const el = {
    loader: document.getElementById("loader"),
    loaderText: document.getElementById("loader-text"),
    progress: document.getElementById("progress-bar"),
    info: document.getElementById("info"),
    tree: document.getElementById("tree"),
    legend: document.getElementById("legend"),
    search: document.getElementById("search"),
    searchResults: document.getElementById("search-results"),
    layerProvinces: document.getElementById("layer-provinces"),
    layerWards: document.getElementById("layer-wards"),
    layerLabels: document.getElementById("layer-labels"),
    toggleSidebar: document.getElementById("toggle-sidebar"),
    app: document.getElementById("app"),
    basemapPanel: document.getElementById("basemap-panel"),
    measureHint: document.getElementById("measure-hint"),
    coords: document.getElementById("coords"),
    scaleText: document.getElementById("scale-text"),
    toolMeasure: document.getElementById("tool-measure"),
  };

  const map = L.map("map", {
    zoomControl: false,
    preferCanvas: true,
    maxBounds: [
      [5, 95],
      [26, 120],
    ],
    maxBoundsViscosity: 0.6,
  }).fitBounds(VN_BOUNDS, { padding: [20, 20] });

  const basemaps = {
    satellite: L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      {
        attribution: "Tiles &copy; Esri",
        maxZoom: 19,
      }
    ),
    light: L.tileLayer("https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
      subdomains: "abcd",
      maxZoom: 18,
    }),
    osm: L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap",
      maxZoom: 19,
    }),
  };

  let activeBase = basemaps.light.addTo(map);

  function setBasemap(name) {
    if (!basemaps[name] || state.basemap === name) {
      state.basemap = name;
      syncBasemapUI();
      return;
    }
    map.removeLayer(activeBase);
    activeBase = basemaps[name].addTo(map);
    state.basemap = name;
    syncBasemapUI();
    provinceLayer.setStyle(provinceStyle);
    wardLayer.setStyle(wardStyle);
  }

  function syncBasemapUI() {
    document.querySelectorAll('input[name="basemap"]').forEach((r) => {
      r.checked = r.value === state.basemap;
    });
    document.querySelectorAll(".status-chip[data-basemap]").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.basemap === state.basemap);
    });
  }

  const provinceLayer = L.geoJSON(null, {
    style: provinceStyle,
    onEachFeature: (feature, layer) => bindUnit(feature, layer, "province"),
    renderer: L.canvas({ padding: 0.5 }),
  }).addTo(map);

  const wardLayer = L.geoJSON(null, {
    style: wardStyle,
    onEachFeature: (feature, layer) => bindUnit(feature, layer, "ward"),
    renderer: L.canvas({ padding: 0.5 }),
  }).addTo(map);

  function provinceStyle(feature) {
    const code = feature.properties.code;
    const c = colorForProvince(code);
    const selected = state.selected?.code === code && state.selected?.level === "province";
    const sat = state.basemap === "satellite";
    return {
      color: selected ? "#0b1220" : c.stroke,
      weight: selected ? 3.2 : sat ? 1.8 : 1.35,
      opacity: 0.95,
      fillColor: selected ? darkenHex(c.fill, 0.14) : c.fill,
      fillOpacity: state.mode === "ward" ? 0.05 : selected ? 0.78 : sat ? 0.42 : 0.62,
    };
  }

  function wardStyle(feature) {
    const p = feature.properties;
    const c = colorForProvince(p.provinceCode || "00");
    const selected = state.selected?.code === p.code && state.selected?.level === "ward";
    const sat = state.basemap === "satellite";
    return {
      color: selected ? "#0b1220" : c.softStroke,
      weight: selected ? 2.4 : sat ? 0.9 : 0.55,
      opacity: 0.9,
      fillColor: selected ? c.fill : c.soft,
      fillOpacity: state.mode === "province" ? 0.02 : selected ? 0.55 : sat ? 0.18 : 0.42,
    };
  }

  function unitLabel(level, p) {
    return p.fullName || p.name || p.code;
  }

  function bindUnit(feature, layer, level) {
    const p = feature.properties;
    layer.on({
      mouseover: (e) => {
        if (state.measuring) return;
        e.target.setStyle({
          weight: level === "province" ? 3 : 2.2,
          fillOpacity: Math.min(0.82, (e.target.options.fillOpacity || 0.2) + 0.18),
        });
        if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) e.target.bringToFront();
      },
      mouseout: (e) => {
        if (level === "province") provinceLayer.resetStyle(e.target);
        else wardLayer.resetStyle(e.target);
      },
      click: () => {
        if (state.measuring) return;
        selectUnit(level, p.code, { fit: false, openPopup: true });
      },
    });
  }

  function popupHtml(level, p, province) {
    const code = level === "province" ? p.code : p.provinceCode;
    const c = colorForProvince(code);
    const parent =
      level === "ward" && province
        ? `<div class="popup-sub">(${escapeHtml(province.fullName || province.name)})</div>`
        : "";
    return `<div class="popup-title"><span class="dot" style="background:${c.fill}"></span>${escapeHtml(unitLabel(level, p))}</div>
      ${parent}
      <div class="popup-meta">
        Mã: <b>${escapeHtml(p.code)}</b><br/>
        Diện tích: <b>${p.areaKm2 != null ? `${Number(p.areaKm2).toLocaleString("vi-VN")} km²` : "—"}</b>
      </div>`;
  }

  function setProgress(pct, text) {
    el.progress.style.width = `${Math.max(0, Math.min(100, pct))}%`;
    if (text) el.loaderText.textContent = text;
  }

  async function loadJson(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Không tải được ${url} (${res.status})`);
    return res.json();
  }

  async function boot() {
    try {
      setProgress(5, "Đang tải bảng màu tỉnh…");
      const colorTable = await loadJson("data/province-colors.json");
      for (const [code, palette] of Object.entries(colorTable)) {
        state.provinceColors.set(String(code), palette);
      }

      setProgress(15, "Đang tải ranh giới tỉnh/thành…");
      const provinces = await loadJson("data/provinces.geojson");
      setProgress(40, "Đang tải 3.321 xã/phường…");
      const wards = await loadJson("data/wards.geojson");
      setProgress(78, "Đang vẽ bản đồ…");

      state.provinces = provinces;
      state.wards = wards;
      indexData();

      provinceLayer.clearLayers();
      provinceLayer.addData(provinces);
      wardLayer.clearLayers();
      wardLayer.addData(wards);

      setProgress(92, "Đang dựng danh sách…");
      buildLegend();
      buildTree();
      refreshLabels();
      applyMode("both");
      updateScale();
      syncBasemapUI();

      setProgress(100, "Hoàn tất");
      setTimeout(() => el.loader.classList.add("hidden"), 250);
    } catch (err) {
      console.error(err);
      el.loaderText.textContent = `Lỗi tải dữ liệu: ${err.message}`;
      el.progress.style.width = "100%";
    }
  }

  function indexData() {
    state.provinceIndex.clear();
    state.wardIndex.clear();
    state.wardsByProvince.clear();

    for (const f of state.provinces.features) {
      state.provinceIndex.set(f.properties.code, f);
    }
    for (const f of state.wards.features) {
      const p = f.properties;
      state.wardIndex.set(p.code, f);
      const pc = p.provinceCode;
      if (!state.wardsByProvince.has(pc)) state.wardsByProvince.set(pc, []);
      state.wardsByProvince.get(pc).push(f);
    }
  }

  function buildLegend() {
    if (!el.legend) return;
    const sorted = [...state.provinces.features].sort((a, b) =>
      (a.properties.name || "").localeCompare(b.properties.name || "", "vi")
    );
    el.legend.innerHTML = "";
    const frag = document.createDocumentFragment();
    for (const pf of sorted) {
      const c = colorForProvince(pf.properties.code);
      const sw = document.createElement("span");
      sw.style.background = c.fill;
      sw.title = pf.properties.name;
      frag.appendChild(sw);
    }
    el.legend.appendChild(frag);
  }

  function buildTree() {
    const frag = document.createDocumentFragment();
    const sorted = [...state.provinces.features].sort((a, b) =>
      (a.properties.name || "").localeCompare(b.properties.name || "", "vi")
    );

    for (const pf of sorted) {
      const p = pf.properties;
      const c = colorForProvince(p.code);
      const details = document.createElement("details");
      const summary = document.createElement("summary");
      const wards = state.wardsByProvince.get(p.code) || [];

      const dot = document.createElement("span");
      dot.className = "dot";
      dot.style.background = c.fill;
      summary.appendChild(dot);
      summary.appendChild(document.createTextNode(p.name));
      const count = document.createElement("span");
      count.className = "count";
      count.textContent = String(wards.length);
      summary.appendChild(count);

      summary.addEventListener("dblclick", (e) => {
        e.preventDefault();
        selectUnit("province", p.code, { fit: true, openPopup: true });
      });

      const provBtn = document.createElement("button");
      provBtn.type = "button";
      provBtn.className = "prov-link";
      provBtn.textContent = "→ Xem toàn tỉnh";
      provBtn.addEventListener("click", () =>
        selectUnit("province", p.code, { fit: true, openPopup: true })
      );

      const ul = document.createElement("ul");
      const wardSorted = [...wards].sort((a, b) =>
        (a.properties.name || "").localeCompare(b.properties.name || "", "vi")
      );
      for (const wf of wardSorted) {
        const li = document.createElement("li");
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = wf.properties.fullName || wf.properties.name;
        btn.addEventListener("click", () =>
          selectUnit("ward", wf.properties.code, { fit: true, openPopup: true })
        );
        li.appendChild(btn);
        ul.appendChild(li);
      }

      details.appendChild(summary);
      details.appendChild(provBtn);
      details.appendChild(ul);
      frag.appendChild(details);
    }
    el.tree.innerHTML = "";
    el.tree.appendChild(frag);
  }

  function selectUnit(level, code, { fit = true, openPopup = false } = {}) {
    const feature =
      level === "province" ? state.provinceIndex.get(code) : state.wardIndex.get(code);
    if (!feature) return;

    state.selected = { level, code };
    provinceLayer.setStyle(provinceStyle);
    wardLayer.setStyle(wardStyle);

    const p = feature.properties;
    const province =
      level === "province" ? p : state.provinceIndex.get(p.provinceCode)?.properties;
    const colorCode = level === "province" ? p.code : p.provinceCode;
    const c = colorForProvince(colorCode);

    el.info.classList.remove("empty");
    el.info.innerHTML = `
      <div class="swatch-row">
        <span class="swatch" style="background:${c.fill}"></span>
        <div class="title">${escapeHtml(unitLabel(level, p))}</div>
      </div>
      <dl>
        <dt>Cấp</dt><dd>${level === "province" ? "Tỉnh / Thành phố" : "Xã / Phường / Đặc khu"}</dd>
        <dt>Mã</dt><dd>${escapeHtml(p.code)}</dd>
        <dt>Tên EN</dt><dd>${escapeHtml(p.fullNameEn || p.nameEn || "—")}</dd>
        ${
          province && level === "ward"
            ? `<dt>Thuộc</dt><dd>${escapeHtml(province.fullName || province.name)}</dd>`
            : ""
        }
        <dt>Diện tích</dt><dd>${p.areaKm2 != null ? `${Number(p.areaKm2).toLocaleString("vi-VN")} km²` : "—"}</dd>
      </dl>`;

    const layer = findLayer(level, code);
    if (layer) {
      layer.unbindPopup();
      layer.bindPopup(popupHtml(level, p, province));
      if (fit) {
        map.fitBounds(layer.getBounds(), { padding: [48, 48], maxZoom: level === "ward" ? 13 : 9 });
      }
      if (openPopup || fit) layer.openPopup();
    }

    if (window.matchMedia("(max-width: 860px)").matches) {
      el.app.classList.remove("sidebar-open");
    }
  }

  function findLayer(level, code) {
    const group = level === "province" ? provinceLayer : wardLayer;
    let found = null;
    group.eachLayer((layer) => {
      if (layer.feature?.properties?.code === code) found = layer;
    });
    return found;
  }

  function applyMode(mode) {
    state.mode = mode;
    document.querySelectorAll(".mode").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.mode === mode);
    });

    if (mode === "both") {
      el.layerProvinces.checked = true;
      el.layerWards.checked = true;
    } else if (mode === "province") {
      el.layerProvinces.checked = true;
      el.layerWards.checked = false;
    } else if (mode === "ward") {
      el.layerProvinces.checked = false;
      el.layerWards.checked = true;
    }
    syncLayers();
  }

  function syncLayers() {
    if (el.layerProvinces.checked) {
      if (!map.hasLayer(provinceLayer)) map.addLayer(provinceLayer);
    } else if (map.hasLayer(provinceLayer)) {
      map.removeLayer(provinceLayer);
    }

    if (el.layerWards.checked) {
      if (!map.hasLayer(wardLayer)) map.addLayer(wardLayer);
    } else if (map.hasLayer(wardLayer)) {
      map.removeLayer(wardLayer);
    }

    provinceLayer.setStyle(provinceStyle);
    wardLayer.setStyle(wardStyle);
    refreshLabels();
  }

  const labelLayer = L.layerGroup().addTo(map);
  const labelCenterCache = new Map();

  function ringArea(ring) {
    let a = 0;
    for (let i = 0; i < ring.length - 1; i++) {
      a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
    }
    return a / 2;
  }

  function ringCentroid(ring) {
    const a = ringArea(ring);
    if (Math.abs(a) < 1e-18) {
      let sx = 0;
      let sy = 0;
      for (const p of ring) {
        sx += p[0];
        sy += p[1];
      }
      return [sx / ring.length, sy / ring.length];
    }
    let cx = 0;
    let cy = 0;
    for (let i = 0; i < ring.length - 1; i++) {
      const x1 = ring[i][0];
      const y1 = ring[i][1];
      const x2 = ring[i + 1][0];
      const y2 = ring[i + 1][1];
      const f = x1 * y2 - x2 * y1;
      cx += (x1 + x2) * f;
      cy += (y1 + y2) * f;
    }
    return [cx / (6 * a), cy / (6 * a)];
  }

  function pointInRing(x, y, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0];
      const yi = ring[i][1];
      const xj = ring[j][0];
      const yj = ring[j][1];
      const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-30) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  }

  function exteriorRings(geometry) {
    if (!geometry) return [];
    if (geometry.type === "Polygon") return [geometry.coordinates[0]];
    if (geometry.type === "MultiPolygon") return geometry.coordinates.map((poly) => poly[0]);
    return [];
  }

  function visualCenter(geometry) {
    const rings = exteriorRings(geometry);
    if (!rings.length) return null;
    rings.sort((a, b) => Math.abs(ringArea(b)) - Math.abs(ringArea(a)));
    const ring = rings[0];

    // Coarse pole-of-inaccessibility on largest landmass
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const [x, y] of ring) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    const steps = 12;
    const dx = (maxX - minX) / steps;
    const dy = (maxY - minY) / steps;
    let best = null;
    let bestScore = -1;

    function scoreAt(x, y) {
      if (!pointInRing(x, y, ring)) return -1;
      let minD = Infinity;
      for (let i = 0; i < ring.length - 1; i++) {
        const ax = ring[i][0];
        const ay = ring[i][1];
        const bx = ring[i + 1][0];
        const by = ring[i + 1][1];
        const vx = bx - ax;
        const vy = by - ay;
        const t =
          vx === 0 && vy === 0
            ? 0
            : Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy)));
        const px = ax + t * vx;
        const py = ay + t * vy;
        const d = (x - px) * (x - px) + (y - py) * (y - py);
        if (d < minD) minD = d;
      }
      return minD;
    }

    for (let i = 1; i < steps; i++) {
      for (let j = 1; j < steps; j++) {
        const x = minX + dx * i;
        const y = minY + dy * j;
        const s = scoreAt(x, y);
        if (s > bestScore) {
          bestScore = s;
          best = [x, y];
        }
      }
    }

    if (!best) {
      best = ringCentroid(ring);
      if (!pointInRing(best[0], best[1], ring)) {
        // fallback: average of vertices of largest ring
        let sx = 0;
        let sy = 0;
        for (const p of ring) {
          sx += p[0];
          sy += p[1];
        }
        best = [sx / ring.length, sy / ring.length];
      }
    }
    return best;
  }

  function labelLatLng(feature) {
    const p = feature.properties || {};
    const key = p.code;
    if (labelCenterCache.has(key)) return labelCenterCache.get(key);

    let ll = null;
    if (p.labelLat != null && p.labelLng != null) {
      ll = L.latLng(p.labelLat, p.labelLng);
    } else {
      const center = visualCenter(feature.geometry);
      if (center) ll = L.latLng(center[1], center[0]);
    }
    if (ll) labelCenterCache.set(key, ll);
    return ll;
  }

  function addLabelMarker(text, latlng, className, level, code) {
    const icon = L.divIcon({
      className: `geo-label-marker ${className}`,
      html: `<span class="geo-label-hit">${escapeHtml(text)}</span>`,
      iconSize: [1, 1],
      iconAnchor: [0, 0],
    });
    const marker = L.marker(latlng, { icon, interactive: true, keyboard: false, zIndexOffset: level === "province" ? 400 : 200 }).addTo(labelLayer);
    marker.on("click", (e) => {
      L.DomEvent.stopPropagation(e);
      if (state.measuring) return;
      selectUnit(level, code, { fit: true, openPopup: true });
    });
  }

  function refreshLabels() {
    labelLayer.clearLayers();
    if (!state.showLabels) return;

    const zoom = map.getZoom();
    const bounds = map.getBounds().pad(0.05);

    if (el.layerProvinces.checked) {
      provinceLayer.eachLayer((layer) => {
        const feature = layer.feature;
        if (!feature?.properties) return;
        const ll = labelLatLng(feature);
        if (!ll || !bounds.contains(ll)) return;
        addLabelMarker(
          unitLabel("province", feature.properties),
          ll,
          "geo-label-province",
          "province",
          feature.properties.code
        );
      });
    }

    if (el.layerWards.checked && zoom >= 9) {
      let shown = 0;
      const maxLabels = zoom >= 13 ? 900 : zoom >= 11 ? 500 : 280;
      wardLayer.eachLayer((layer) => {
        if (shown >= maxLabels) return;
        const feature = layer.feature;
        if (!feature?.properties) return;
        const b = layer.getBounds?.();
        if (!b || !bounds.intersects(b)) return;
        const ll = labelLatLng(feature);
        if (!ll || !bounds.contains(ll)) return;
        addLabelMarker(
          unitLabel("ward", feature.properties),
          ll,
          "geo-label-ward",
          "ward",
          feature.properties.code
        );
        shown += 1;
      });
    }
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  const measureLayer = L.layerGroup().addTo(map);
  let measurePoints = [];

  function haversineKm(a, b) {
    const R = 6371;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  function totalMeasureKm() {
    let sum = 0;
    for (let i = 1; i < measurePoints.length; i++) {
      sum += haversineKm(measurePoints[i - 1], measurePoints[i]);
    }
    return sum;
  }

  function redrawMeasure() {
    measureLayer.clearLayers();
    measurePoints.forEach((ll) => {
      L.circleMarker(ll, { radius: 4, color: "#fff", fillColor: "#2dd4bf", fillOpacity: 1, weight: 2 }).addTo(
        measureLayer
      );
    });
    if (measurePoints.length >= 2) {
      L.polyline(measurePoints, { color: "#fbbf24", weight: 3 }).addTo(measureLayer);
      const km = totalMeasureKm();
      const label = km < 1 ? `${(km * 1000).toFixed(0)} m` : `${km.toFixed(2)} km`;
      L.tooltip({ permanent: true, direction: "right", className: "geo-label geo-label-ward" })
        .setContent(label)
        .setLatLng(measurePoints[measurePoints.length - 1])
        .addTo(measureLayer);
    }
  }

  function stopMeasure() {
    state.measuring = false;
    el.toolMeasure.classList.remove("active");
    el.measureHint.hidden = true;
    map.getContainer().style.cursor = "";
  }

  function clearMeasure() {
    measurePoints = [];
    measureLayer.clearLayers();
  }

  function toggleMeasure() {
    if (state.measuring) {
      stopMeasure();
      return;
    }
    state.measuring = true;
    clearMeasure();
    el.toolMeasure.classList.add("active");
    el.measureHint.hidden = false;
    el.basemapPanel.hidden = true;
    map.getContainer().style.cursor = "crosshair";
  }

  map.on("click", (e) => {
    if (!state.measuring) return;
    measurePoints.push(e.latlng);
    redrawMeasure();
  });
  map.on("dblclick", (e) => {
    if (!state.measuring) return;
    L.DomEvent.stop(e);
    stopMeasure();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && state.measuring) stopMeasure();
  });

  function updateScale() {
    const y = map.getSize().y / 2;
    const meters = map.distance(map.containerPointToLatLng([0, y]), map.containerPointToLatLng([100, y]));
    el.scaleText.textContent =
      meters >= 1000 ? `~ ${(meters / 1000).toFixed(1)} km / 100px` : `~ ${Math.round(meters)} m / 100px`;
  }

  el.search.addEventListener("input", () => {
    const q = el.search.value.trim().toLowerCase();
    if (q.length < 2) {
      el.searchResults.hidden = true;
      el.searchResults.innerHTML = "";
      return;
    }

    const hits = [];
    for (const f of state.provinces.features) {
      const p = f.properties;
      const hay = `${p.name} ${p.fullName} ${p.nameEn} ${p.code}`.toLowerCase();
      if (hay.includes(q)) hits.push({ level: "province", p });
      if (hits.length >= 20) break;
    }
    if (hits.length < 20) {
      for (const f of state.wards.features) {
        const p = f.properties;
        const hay = `${p.name} ${p.fullName} ${p.nameEn} ${p.code}`.toLowerCase();
        if (hay.includes(q)) hits.push({ level: "ward", p });
        if (hits.length >= 20) break;
      }
    }

    el.searchResults.hidden = hits.length === 0;
    el.searchResults.innerHTML = hits
      .map((h) => {
        const colorCode = h.level === "province" ? h.p.code : h.p.provinceCode;
        const fill = colorForProvince(colorCode).fill;
        return `<button type="button" data-level="${h.level}" data-code="${escapeHtml(h.p.code)}">
          <span class="hit-swatch" style="background:${fill}"></span>${escapeHtml(h.p.fullName || h.p.name)}
          <div class="meta">${h.level === "province" ? "Tỉnh/TP" : "Xã/phường"} · ${escapeHtml(h.p.code)}</div>
        </button>`;
      })
      .join("");
  });

  el.searchResults.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-code]");
    if (!btn) return;
    selectUnit(btn.dataset.level, btn.dataset.code, { fit: true, openPopup: true });
    el.searchResults.hidden = true;
  });

  el.layerProvinces.addEventListener("change", syncLayers);
  el.layerWards.addEventListener("change", syncLayers);
  el.layerLabels.addEventListener("change", () => {
    state.showLabels = el.layerLabels.checked;
    refreshLabels();
  });

  document.querySelectorAll(".mode").forEach((btn) => {
    btn.addEventListener("click", () => applyMode(btn.dataset.mode));
  });

  el.toggleSidebar.addEventListener("click", () => {
    el.app.classList.toggle("sidebar-open");
    if (!window.matchMedia("(max-width: 860px)").matches) {
      const aside = document.getElementById("sidebar");
      const hidden = aside.style.display === "none";
      aside.style.display = hidden ? "" : "none";
      setTimeout(() => map.invalidateSize(), 50);
    }
  });

  document.getElementById("tool-search").addEventListener("click", () => {
    el.app.classList.add("sidebar-open");
    document.getElementById("sidebar").style.display = "";
    el.search.focus();
    setTimeout(() => map.invalidateSize(), 50);
  });

  document.getElementById("tool-layers").addEventListener("click", () => {
    el.basemapPanel.hidden = !el.basemapPanel.hidden;
  });

  document.getElementById("tool-measure").addEventListener("click", toggleMeasure);
  document.getElementById("tool-zoom-in").addEventListener("click", () => map.zoomIn());
  document.getElementById("tool-zoom-out").addEventListener("click", () => map.zoomOut());
  document.getElementById("tool-home").addEventListener("click", () =>
    map.fitBounds(VN_BOUNDS, { padding: [20, 20] })
  );
  document.getElementById("tool-locate").addEventListener("click", () => {
    map.locate({ setView: true, maxZoom: 14 });
  });
  map.on("locationfound", (e) => {
    L.circleMarker(e.latlng, { radius: 7, color: "#fff", fillColor: "#2dd4bf", fillOpacity: 1, weight: 2 }).addTo(
      map
    );
  });
  map.on("locationerror", () => alert("Không lấy được vị trí. Hãy cho phép truy cập định vị."));

  document.getElementById("tool-fullscreen").addEventListener("click", () => {
    const root = document.documentElement;
    if (!document.fullscreenElement) root.requestFullscreen?.();
    else document.exitFullscreen?.();
  });

  document.querySelectorAll('input[name="basemap"]').forEach((r) => {
    r.addEventListener("change", () => {
      if (r.checked) setBasemap(r.value);
    });
  });
  document.querySelectorAll(".status-chip[data-basemap]").forEach((btn) => {
    btn.addEventListener("click", () => setBasemap(btn.dataset.basemap));
  });

  map.on("mousemove", (e) => {
    el.coords.textContent = `X: ${e.latlng.lng.toFixed(6)} | Y: ${e.latlng.lat.toFixed(6)}`;
  });
  map.on("zoomend moveend", () => {
    refreshLabels();
    updateScale();
  });

  boot();
})();
