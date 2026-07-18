# 大分市 現住所確認ツール(v2)

大分市では住居表示の実施により住所が順次変更されており(令和7年11月時点で38地区)、
「旧住所(大字+番地)」や「通称(団地名・建物名)」しか分からない状態から、
**現在の正式住所を検索して確認できる**静的 Web アプリです。

サーバーサイド処理は持たず、静的ファイルのみで動作します(GitHub Pages で配信)。

> v1(通称⇔公称の地図ラベル切り替え MVP)からの転換の経緯は [docs/history.md](docs/history.md) を参照してください。

## 免責事項

本ツールは大分市公開の「住居表示旧新対照簿」を基にした**参考情報**です。
正式な住所の確認は **大分市 市民協働推進課(097-537-7250)** へお問い合わせください。
この免責はアプリ画面下部にも常時表示しています。

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
| データ形式 | JSON(静的ファイル。CSV からビルドスクリプトで生成) |
| 言語 | HTML / CSS / JavaScript(Vanilla、ビルドツール不使用) |
| ホスティング | GitHub Pages(GitHub Actions で自動デプロイ) |

## 使い方

- 画面上部の検索ボックスに、旧住所・通称・新住所のいずれでも自由に入力してください
  (例:「大字木上154」「カームタウン」「木上台一丁目」)。
- 2 文字以上入力すると自動的に検索されます(部分一致)。
- 表記ゆれ(全角/半角、漢数字/算用数字、「番地の」「−」「ー」などの区切り文字)は
  自動的に正規化して同一視します。
- 部分一致で 0 件だった場合は、入力を「空白」や「かな漢字⇔英数字の切り替わり」で
  自動的にキーワード分割し、全キーワードを含む行を検索します(例:
  「カームタウンA-10」→「カームタウン」「A-10」に分割して検索。結果には
  「キーワード分割で検索した結果です」と注記されます)。空白区切りで最初から
  複数キーワードを入力した場合は、この分割検索が注記なしで直接使われます。
- 該当が 50 件を超える場合は上位 50 件のみ表示されるので、検索語を絞り込んでください。
- 結果を選択すると、該当地区のおおよその位置に地図が移動します
  (地区代表点 1 点のみ。番地単位のジオコーディングは行いません)。
- 該当が見つからない場合は、大分市 市民協働推進課の連絡先を案内します。

## ディレクトリ構成

```
oita-chomei-map/
├── docs/
│   ├── spec-mvp.md                    # v1 仕様書
│   ├── spec-v2-address-lookup.md      # v2 仕様書(現行)
│   ├── data-conversion-gemini.md      # v1 データ変換指示書
│   ├── data-conversion-gemini-v2.md   # v2 データ変換指示書(現行)
│   └── history.md                     # v1→v2 転換の経緯
├── data/
│   ├── sources/*.csv                  # 地区別の変換済み対照簿データ(ビルド入力)
│   ├── sources/districts-ledger.csv   # 38地区分の処理管理台帳(ビルド対象外)
│   └── districts.json                 # 地区メタデータ(スラッグ・実施日・代表点座標)
├── scripts/
│   └── build-lookup.mjs               # CSV → src/data/lookup.json 変換スクリプト
├── src/
│   ├── index.html                     # エントリポイント
│   ├── css/style.css
│   ├── js/
│   │   ├── app.js                     # 検索・地図制御ロジック
│   │   ├── normalize.js                # 検索用正規化(ビルド・検索UI 共用)
│   │   └── normalize.test.js           # normalize.js の単体テスト
│   └── data/
│       ├── lookup.json                 # 検索用データ(ビルド生成物。コミット対象)
│       ├── districts.json              # districts.json の複製(ブラウザから参照するため)
│       └── chomei.geojson              # v1 の町名データ(未使用。経緯として保持)
├── tusho_ichiran/                       # 対照簿PDF→CSV変換のワークフロー依頼プロンプト(38地区分)
├── .github/workflows/deploy.yml
├── README.md
└── LICENSE                              # MIT
```

## データパイプライン

1. 大分市公式サイトの「住居表示旧新対照簿」PDF を、`docs/data-conversion-gemini-v2.md` の
   指示に従って地区別 CSV(`data/sources/<地区名>.csv`)に変換する(Gemini 担当)。
2. `data/districts.json` に地区のスラッグ・実施日・代表点座標(緯度経度)を登録する。
3. 以下のビルドスクリプトを実行し、`src/data/lookup.json`(検索用データ)と
   `src/data/districts.json`(地図移動用の地区座標。GitHub Pages が `src/` 配下のみを
   配信するための複製)を生成する。

`data/sources/districts-ledger.csv` は、地区別の PDF URL・実施日・処理状況を管理する
**処理管理台帳**です(38地区分)。`status` 列を `pending → in_progress → done` と
更新しながら、残り地区のデータ整備を1地区ずつ進める進捗管理に使います。
対照簿データ本体ではないため、`build-lookup.mjs` の変換対象からは除外しています。

```bash
node scripts/build-lookup.mjs
```

- 追加の依存パッケージのインストールは不要です(Node.js 標準機能のみで動作)。
- 入力バリデーション(ヘッダー一致・必須列の空欄チェック・街区番号/住居番号の数値チェック・
  完全重複行チェック)に1つでも違反があると、行番号付きのエラーを表示してビルドが失敗します。
- 生成された `src/data/lookup.json` はリポジトリにコミットします
  (GitHub Pages はビルドなしで `src/` 配下をそのまま配信するため)。

### データ更新手順(地区を追加する場合)

1. 新しい地区の CSV を `data/sources/<地区名>.csv` に追加する(`docs/data-conversion-gemini-v2.md` の形式)。
2. `data/districts.json` に同名の地区エントリ(`slug` / `name` / `date` / `lat` / `lng`)を追加する。
   代表点座標が未確定の間は `lat` / `lng` を `null` のままにしてよい(UI は「確認中」表示になる)。
3. `node scripts/build-lookup.mjs` を再実行し、検証結果(件数・エラー有無)を確認する。
4. 生成された `src/data/lookup.json` と `src/data/districts.json` をコミットする。

### 正規化ロジックのテスト

```bash
node --test src/js/normalize.test.js
```

## ローカルでの動作確認

依存パッケージのインストールは不要です。`src/` をルートに簡易サーバーを起動してください
(`file://` 直接オープンでは `fetch` がブロックされるため簡易サーバー推奨)。

```bash
cd src
python3 -m http.server 8000
# ブラウザで http://localhost:8000/ を開く
```

## データについて(現状のスコープ)

- v2.0 時点では **カームタウン木ノ上地区のみ収録**しています(255 件)。
  他の 37 地区は今後段階的に追加します(仕様書 §8 参照)。
- `data/districts.json` の実施日・代表点座標は本リポジトリでは未確定(空値・`null`)です。
  値が未確定の間、UI は実施日を「確認中」と表示し、地図は初期位置のままマーカーを表示しません。
- v1 で使用していた `src/data/chomei.geojson`(町名ポイントのサンプルデータ)は
  削除せずリポジトリに残していますが、v2 のアプリからは読み込みません。

## データ出典・利用条件について(要確認)

データ出典は大分市公式サイト「[住居表示旧新対照簿](https://www.city.oita.oita.jp/o040/kurashi/sumaijoho/)」です。

**このサイトのコンテンツ利用条件(転載・二次利用の可否)は、本セッションでは確認できていません。**
自動化ツールからのアクセスが 403 Forbidden で拒否されたため、利用規約ページの内容を
直接確認できませんでした。公開・運用前に、ブラウザで同ページ(または大分市の
著作権・利用規約ページ)を人手で確認し、この節を実際の確認結果で更新してください。

## デプロイ

`main` ブランチへの push を契機に、GitHub Actions が `src/` 配下を GitHub Pages へデプロイします。

リポジトリの **Settings → Pages → Build and deployment → Source** を
**「GitHub Actions」** に設定してください。

## ライセンス・出典

- コード: [MIT License](./LICENSE)
- 地図タイル: 「[地理院タイル](https://maps.gsi.go.jp/development/ichiran.html)」(国土地理院)。
  出典表記を地図右下に常時表示しています。
- ラベル用フォント glyphs: MapLibre 公式デモ配布の glyphs エンドポイントを利用しています。
- 住所データ: 大分市「住居表示旧新対照簿」(利用条件は上記「要確認」参照)。
