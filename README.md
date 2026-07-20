# GeoVN

Bản đồ GIS hành chính Việt Nam — hiển thị **đủ hai cấp**:

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

URL: https://truongdinh018.github.io/GeoVN/

## Dữ liệu (nguồn chính)

GeoVN lấy GIS từ fork riêng (canonical cho project này):

**[truongdinh018/vietnamese-provinces-database](https://github.com/truongdinh018/vietnamese-provinces-database)**

Fork từ upstream MIT:

[thanglequoc/vietnamese-provinces-database](https://github.com/thanglequoc/vietnamese-provinces-database)

| File | Nội dung |
|------|----------|
| `data/provinces.geojson` | 34 tỉnh (~0.4 MB) |
| `data/wards.geojson` | 3.321 xã/phường (~14 MB) |
| `data/wards/{code}.geojson` | Wards theo từng tỉnh |
| `data/source.json` | Metadata nguồn build gần nhất |

Tái tạo data từ fork:

```bash
./scripts/build-data.sh
```

Đổi nguồn tạm thời (nếu cần):

```bash
DATA_OWNER=thanglequoc ./scripts/build-data.sh
```

Đồng bộ fork với upstream:

```bash
gh repo sync truongdinh018/vietnamese-provinces-database --source thanglequoc/vietnamese-provinces-database --branch master
```

## Tính năng

- Mỗi tỉnh một màu riêng (không trùng), ưu tiên khác màu tỉnh giáp nhau
- Nhãn đặt tại tâm vùng đất lớn nhất
- Lớp tỉnh + xã/phường, tìm kiếm, đo khoảng cách
