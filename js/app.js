/* GeoVN — Vietnamese administrative GIS map (GitHub Pages) */
(() => {
  const VN_BOUNDS = [
    [8.1, 102.1],
    [23.6, 109.7],
  ];

  const state = {
    provinces: null,
    wards: null,
    provinceIndex: new Map(),
    wardIndex: new Map(),
    wardsByProvince: new Map(),
    mode: "both",
    showLabels: true,
    selected: null,
  };

  const el = {
    loader: document.getElementById("loader"),
    loaderText: document.getElementById("loader-text"),
    progress: document.getElementById("progress-bar"),
    info: document.getElementById("info"),
    tree: document.getElementById("tree"),
    search: document.getElementById("search"),
    searchResults: document.getElementById("search-results"),
    layerProvinces: document.getElementById("layer-provinces"),
    layerWards: document.getElementById("layer-wards"),
    layerLabels: document.getElementById("layer-labels"),
    toggleSidebar: document.getElementById("toggle-sidebar"),
    app: document.getElementById("app"),
  };

  const map = L.map("map", {
    zoomControl: true,
    preferCanvas: true,
    maxBounds: [
      [5, 95],
      [26, 120],
    ],
    maxBoundsViscosity: 0.6,
  }).fitBounds(VN_BOUNDS, { padding: [20, 20] });

  L.tileLayer("https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png", {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
    subdomains: "abcd",
    maxZoom: 18,
  }).addTo(map);

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
    const selected = state.selected?.code === feature.properties.code && state.selected?.level === "province";
    return {
      color: "#7f1515",
      weight: selected ? 2.5 : 1.4,
      opacity: 0.95,
      fillColor: selected ? "#c62828" : "#e53935",
      fillOpacity: state.mode === "ward" ? 0.05 : selected ? 0.55 : 0.38,
    };
  }

  function wardStyle(feature) {
    const selected = state.selected?.code === feature.properties.code && state.selected?.level === "ward";
    return {
      color: selected ? "#4a0000" : "#b71c1c",
      weight: selected ? 2 : 0.45,
      opacity: 0.9,
      fillColor: selected ? "#ef5350" : "#ffcdd2",
      fillOpacity: state.mode === "province" ? 0.05 : selected ? 0.7 : 0.42,
    };
  }

  function bindUnit(feature, layer, level) {
    const p = feature.properties;
    layer.on({
      mouseover: (e) => {
        e.target.setStyle({
          weight: level === "province" ? 2.5 : 1.5,
          fillOpacity: 0.7,
        });
        if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) {
          e.target.bringToFront();
        }
      },
      mouseout: (e) => {
        if (level === "province") provinceLayer.resetStyle(e.target);
        else wardLayer.resetStyle(e.target);
      },
      click: () => selectUnit(level, p.code, { fit: false }),
    });

    layer.bindPopup(
      `<div class="popup-title">${escapeHtml(p.fullName || p.name)}</div>
       <div>${level === "province" ? "Cấp tỉnh" : "Cấp xã/phường"} · Mã ${escapeHtml(p.code)}</div>`
    );
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
      setProgress(8, "Đang tải ranh giới tỉnh/thành…");
      const provinces = await loadJson("data/provinces.geojson");
      setProgress(35, "Đang tải 3.321 xã/phường…");
      const wards = await loadJson("data/wards.geojson");
      setProgress(75, "Đang vẽ bản đồ…");

      state.provinces = provinces;
      state.wards = wards;
      indexData();

      provinceLayer.clearLayers();
      provinceLayer.addData(provinces);
      wardLayer.clearLayers();
      wardLayer.addData(wards);

      setProgress(92, "Đang dựng danh sách…");
      buildTree();
      refreshLabels();
      applyMode("both");

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

  function buildTree() {
    const frag = document.createDocumentFragment();
    const sorted = [...state.provinces.features].sort((a, b) =>
      (a.properties.name || "").localeCompare(b.properties.name || "", "vi")
    );

    for (const pf of sorted) {
      const p = pf.properties;
      const details = document.createElement("details");
      const summary = document.createElement("summary");
      const wards = state.wardsByProvince.get(p.code) || [];
      summary.textContent = `${p.name} (${wards.length})`;
      summary.addEventListener("click", (e) => {
        // allow expand; also select province on double intent via button below
      });
      summary.addEventListener("dblclick", (e) => {
        e.preventDefault();
        selectUnit("province", p.code, { fit: true });
      });

      const provBtn = document.createElement("button");
      provBtn.type = "button";
      provBtn.textContent = `→ Xem toàn tỉnh`;
      provBtn.style.fontWeight = "600";
      provBtn.style.color = "#8b1a1a";
      provBtn.addEventListener("click", () => selectUnit("province", p.code, { fit: true }));

      const ul = document.createElement("ul");
      const wardSorted = [...wards].sort((a, b) =>
        (a.properties.name || "").localeCompare(b.properties.name || "", "vi")
      );
      for (const wf of wardSorted) {
        const li = document.createElement("li");
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = wf.properties.fullName || wf.properties.name;
        btn.addEventListener("click", () => selectUnit("ward", wf.properties.code, { fit: true }));
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

  function selectUnit(level, code, { fit = true } = {}) {
    const feature =
      level === "province" ? state.provinceIndex.get(code) : state.wardIndex.get(code);
    if (!feature) return;

    state.selected = { level, code };
    provinceLayer.setStyle(provinceStyle);
    wardLayer.setStyle(wardStyle);

    const p = feature.properties;
    const province =
      level === "province"
        ? p
        : state.provinceIndex.get(p.provinceCode)?.properties;

    el.info.classList.remove("empty");
    el.info.innerHTML = `
      <div class="title">${escapeHtml(p.fullName || p.name)}</div>
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

    if (fit) {
      const layer = findLayer(level, code);
      if (layer) {
        map.fitBounds(layer.getBounds(), { padding: [40, 40], maxZoom: level === "ward" ? 12 : 9 });
        layer.openPopup();
      }
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

  function refreshLabels() {
    provinceLayer.eachLayer((layer) => {
      if (layer.getTooltip()) layer.unbindTooltip();
      if (state.showLabels && el.layerProvinces.checked && map.getZoom() <= 9) {
        layer.bindTooltip(layer.feature.properties.name, {
          permanent: true,
          direction: "center",
          className: "geo-label",
          interactive: false,
        });
      }
    });
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  // Search
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
      .map(
        (h) => `<button type="button" data-level="${h.level}" data-code="${escapeHtml(h.p.code)}">
          ${escapeHtml(h.p.fullName || h.p.name)}
          <div class="meta">${h.level === "province" ? "Tỉnh/TP" : "Xã/phường"} · ${escapeHtml(h.p.code)}</div>
        </button>`
      )
      .join("");
  });

  el.searchResults.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-code]");
    if (!btn) return;
    selectUnit(btn.dataset.level, btn.dataset.code, { fit: true });
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
  });

  map.on("zoomend", refreshLabels);

  boot();
})();
