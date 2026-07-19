# GeoVN

Bản đồ GIS hành chính Việt Nam (style bản đỏ) — hiển thị **đủ hai cấp**:

- **34** tỉnh / thành phố
- **3.321** xã / phường / đặc khu

Chạy trên **GitHub Pages** (static HTML + Leaflet).

## Demo local

```bash
cd GeoVN
python3 -m http.server 8080
# mở http://localhost:8080
```

## GitHub Pages

1. Push repo lên GitHub
2. **Settings → Pages → Source**: Deploy from branch `main` / folder `/ (root)`
   hoặc dùng workflow `.github/workflows/pages.yml`

URL dạng: `https://<user>.github.io/GeoVN/`

## Dữ liệu

GeoJSON đã được simplify (mapshaper) từ nguồn:

[thanglequoc/vietnamese-provinces-database](https://github.com/thanglequoc/vietnamese-provinces-database) — MIT License

| File | Nội dung |
|------|----------|
| `data/provinces.geojson` | 34 tỉnh (~0.4 MB) |
| `data/wards.geojson` | 3.321 xã/phường (~14 MB) |
| `data/wards/{code}.geojson` | Wards theo từng tỉnh |

Tái tạo data:

```bash
./scripts/build-data.sh
```

## Tính năng

- Lớp tỉnh + xã/phường cùng lúc (chế độ **Cả hai cấp**)
- Tìm kiếm, sidebar danh sách, click để zoom
- Style đỏ hành chính trên nền bản đồ nhạt
