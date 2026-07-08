# 大分市 町名マップ(MVP)

大分市内の町名について、日常的に使われる **通称町名** と登記・公簿上の **公称町名** を、
地図上のラベルとしてボタン 1 つで切り替えて表示する静的 Web アプリです。

サーバーサイド処理は持たず、静的ファイルのみで動作します(GitHub Pages で配信)。

## デモ

GitHub Pages 公開後、以下の URL で動作します(リポジトリ設定に依存):

```
https://<ユーザー名>.github.io/<リポジトリ名>/
```

## 技術構成

| 項目 | 採用技術 |
|---|---|
| 地図ライブラリ | [MapLibre GL JS](https://maplibre.org/) 4.x(CDN 読み込み) |
| ベース地図 | 国土地理院 淡色地図タイル |
| データ形式 | GeoJSON(静的ファイル) |
| 言語 | HTML / CSS / JavaScript(Vanilla、ビルドツール不使用) |
| ホスティング | GitHub Pages(GitHub Actions で自動デプロイ) |

## ディレクトリ構成

```
oita-chomei-map/
├── docs/
│   └── spec-mvp.md          # 仕様書
├── src/
│   ├── index.html           # エントリポイント
│   ├── css/style.css
│   ├── js/app.js            # 地図初期化・切り替えロジック
│   └── data/chomei.geojson  # 町名データ
├── .github/workflows/deploy.yml
├── README.md
└── LICENSE                  # MIT
```

## ローカルでの動作確認

依存パッケージのインストールは不要です。`src/` をルートに簡易サーバーを起動してください
(`file://` 直接オープンでは `fetch` がブロックされるため簡易サーバー推奨)。

```bash
cd src
python3 -m http.server 8000
# ブラウザで http://localhost:8000/ を開く
```

## 使い方

- 画面上部中央の **「通称 / 公称」** トグルで、地図上の町名ラベルを即時に切り替えます。
- 初期表示は「通称」モードです。リロードすると常に「通称」に戻ります(状態は永続化しません)。
- 地図はパン・ズーム・ピンチ操作に対応しています。

## データについて(重要)

`src/data/chomei.geojson` に含まれる町名・座標・公称名は、**本 MVP の動作確認を目的とした
サンプルデータ**です。以下の点にご注意ください。

- 大分市中心部の実在町名を基にしていますが、**座標はおおよその町域中心**であり精度は保証しません。
- **公称町名(`kosho`)の値は動作確認用のサンプル**であり、登記・公簿上の正式名称を
  正確に反映したものではありません。
- 正式な町名対照データの整備は別工程で行う想定です(第 2 弾以降)。

### データ仕様

FeatureCollection 形式。1 Feature = 1 町名地点。

| キー | 型 | 必須 | 説明 |
|---|---|---|---|
| `id` | string | ○ | 4 桁ゼロ埋めの連番 |
| `tsusho` | string | ○ | 通称町名 |
| `kosho` | string | ○ | 公称町名 |
| `note` | string | - | 備考(出典メモ等。MVP では地図に表示しない) |

- 座標系は WGS84(経度, 緯度 の順)。
- 通称と公称が同一の町は `tsusho` と `kosho` に同じ値を入れます。

## デプロイ

`main` ブランチへの push を契機に、GitHub Actions が `src/` 配下を GitHub Pages へデプロイします。

リポジトリの **Settings → Pages → Build and deployment → Source** を
**「GitHub Actions」** に設定してください。

## ライセンス・出典

- コード: [MIT License](./LICENSE)
- 地図タイル: 「[地理院タイル](https://maps.gsi.go.jp/development/ichiran.html)」(国土地理院)。
  出典表記を地図右下に常時表示しています。
- ラベル用フォント glyphs: MapLibre 公式デモ配布の glyphs エンドポイントを利用しています。
