/* ==========================================================================
 * 大分市 町名マップ (MVP)
 * - 地理院タイル(淡色)をベースに MapLibre GL JS で表示
 * - 通称 / 公称 の町名ラベルをトグルで切り替える
 * ========================================================================== */

(function () {
  "use strict";

  // ----- 定数 -----
  var GEOJSON_URL = "data/chomei.geojson";
  var SOURCE_ID = "chomei";
  var LAYER_ID = "chomei-labels";

  var GSI_PALE_TILES = "https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png";
  var GSI_ATTRIBUTION =
    '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">地理院タイル</a>';

  // 状態変数: "tsusho" | "kosho"(初期は通称)
  var currentMode = "tsusho";

  // ----- 地図の初期化 -----
  var map = new maplibregl.Map({
    container: "map",
    style: {
      version: 8,
      // 地理院タイルはラベル用フォントを配布していないため glyphs を用意する。
      // MapLibre 公式デモの glyphs エンドポイントを利用(フォント読み込みのみ)。
      glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
      sources: {
        gsi_pale: {
          type: "raster",
          tiles: [GSI_PALE_TILES],
          tileSize: 256,
          minzoom: 2,
          maxzoom: 18,
          attribution: GSI_ATTRIBUTION,
        },
      },
      layers: [
        {
          id: "gsi_pale_layer",
          type: "raster",
          source: "gsi_pale",
        },
      ],
    },
    center: [131.606, 33.233], // 大分駅付近
    zoom: 14,
    minZoom: 11,
    maxZoom: 18,
    attributionControl: false, // 下でオプション付きの Control を明示追加
    // 日本語(漢字・かな)ラベルはブラウザのローカルフォントで描画する。
    // glyphs サーバー(Latin のみ)には CJK が無いため必須の指定。
    localIdeographFontFamily:
      "'Hiragino Sans', 'Noto Sans JP', 'Yu Gothic', Meiryo, sans-serif",
  });

  // 出典表記(右下・常時表示)とズーム操作 UI
  map.addControl(new maplibregl.AttributionControl({ compact: false }), "bottom-right");
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-left");

  // ----- ラベルレイヤーの追加 -----
  function addLabelLayer() {
    map.addLayer({
      id: LAYER_ID,
      type: "symbol",
      source: SOURCE_ID,
      layout: {
        // 初期は通称。切り替えは setLayoutProperty で text-field を差し替える。
        "text-field": ["get", currentMode],
        "text-font": ["Open Sans Regular"], // glyphs で提供されるフォント
        // ズームに応じて 12〜16px で可変
        "text-size": ["interpolate", ["linear"], ["zoom"], 11, 12, 18, 16],
        "text-anchor": "center",
        "text-max-width": 8,
        "text-allow-overlap": false, // 重なりは MapLibre の自動間引きに任せる
      },
      paint: {
        "text-color": "#12305e", // 濃紺系
        "text-halo-color": "#ffffff", // 白フチ
        "text-halo-width": 1.6,
        "text-halo-blur": 0.3,
      },
    });
  }

  // ----- データ取得 & ソース登録 -----
  function loadData() {
    fetch(GEOJSON_URL)
      .then(function (res) {
        if (!res.ok) {
          throw new Error("HTTP " + res.status);
        }
        return res.json();
      })
      .then(function (geojson) {
        map.addSource(SOURCE_ID, {
          type: "geojson",
          data: geojson,
        });
        addLabelLayer();
      })
      .catch(function (err) {
        showError("町名データの読み込みに失敗しました。時間をおいて再読み込みしてください。");
        // 開発用にコンソールへ詳細を残す
        if (window.console && console.error) {
          console.error("chomei.geojson の取得に失敗:", err);
        }
      });
  }

  // ----- 表示モードの切り替え -----
  function setMode(mode) {
    if (mode !== "tsusho" && mode !== "kosho") return;
    if (mode === currentMode) return;

    currentMode = mode;

    // レイヤーが既に存在する場合のみ text-field を差し替え(再生成はしない)
    if (map.getLayer(LAYER_ID)) {
      map.setLayoutProperty(LAYER_ID, "text-field", ["get", currentMode]);
    }

    updateToggleUI();
  }

  // ----- トグル UI の見た目更新 -----
  var toggleButtons = document.querySelectorAll("#mode-toggle .toggle-btn");

  function updateToggleUI() {
    toggleButtons.forEach(function (btn) {
      var active = btn.getAttribute("data-mode") === currentMode;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  toggleButtons.forEach(function (btn) {
    btn.addEventListener("click", function () {
      setMode(btn.getAttribute("data-mode"));
    });
  });

  // ----- エラー表示 -----
  var errorBanner = document.getElementById("error-banner");

  function showError(message) {
    errorBanner.textContent = message;
    errorBanner.hidden = false;
  }

  // ----- 起動 -----
  map.on("load", function () {
    // 100dvh はレイアウト確定前(初回ペイント前)に 0 と評価されることがあり、
    // その状態で生成された地図キャンバスが既定サイズ(400x300)のまま固定される
    // ケースがある。コンテナ実寸に合わせて明示的にリサイズする。
    map.resize();
    loadData();
  });

  // タイル取得エラー等はエラーバナーではなく地図側で無視されるが、
  // スタイル自体の致命的エラーは通知する。
  map.on("error", function (e) {
    if (window.console && console.warn) {
      console.warn("MapLibre error:", e && e.error ? e.error : e);
    }
  });
})();
