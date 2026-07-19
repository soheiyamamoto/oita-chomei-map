/* ==========================================================================
 * 大分市 現住所確認ツール (v2)
 * - 旧住所・通称・新住所のいずれからでも現在の正式住所を検索できる
 * - 結果行を選択すると、該当地区のおおよその位置を地図で表示する(補助)
 * ========================================================================== */

(function () {
  "use strict";

  // ----- 定数 -----
  var LOOKUP_URL = "data/lookup.json";
  var DISTRICTS_URL = "data/districts.json";

  var MIN_QUERY_LENGTH = 2;
  var DEBOUNCE_MS = 300;
  var MAX_RESULTS = 50;
  var CITY_CONTACT = "大分市 市民協働推進課(097-537-7250)";

  var GSI_PALE_TILES = "https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png";
  var GSI_ATTRIBUTION =
    '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">地理院タイル</a>';

  var DEFAULT_CENTER = [131.606, 33.233]; // 大分市中心(大分駅付近)の初期位置
  var DEFAULT_ZOOM = 14;
  var SELECTED_ZOOM = 15;

  var searchRecords = window.OitaNormalize.searchRecords;

  // ----- 状態 -----
  var records = []; // lookup.json の records(norm フィールド付き)
  var districtPositions = {}; // 地区名 -> { lat, lng }(null の場合あり)
  var marker = null;
  var selectedItem = null;
  var debounceTimer = null;

  // ----- DOM 参照 -----
  var searchInput = document.getElementById("search-input");
  var resultsList = document.getElementById("results-list");
  var resultsSummary = document.getElementById("results-summary");
  var appMain = document.getElementById("app-main");
  var mapPanel = document.getElementById("map-panel");
  var errorBanner = document.getElementById("error-banner");

  function showError(message) {
    errorBanner.textContent = message;
    errorBanner.hidden = false;
  }

  // ----- 地図初期化(地理院淡色タイル。v1 のスタイル設定を踏襲) -----
  var map = new maplibregl.Map({
    container: "map",
    style: {
      version: 8,
      // 地理院タイルはラベル用 glyphs を配布していないため、
      // MapLibre 公式デモの glyphs エンドポイントを利用する。
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
      layers: [{ id: "gsi_pale_layer", type: "raster", source: "gsi_pale" }],
    },
    center: DEFAULT_CENTER,
    zoom: DEFAULT_ZOOM,
    minZoom: 9,
    maxZoom: 18,
    attributionControl: false,
    localIdeographFontFamily:
      "'Hiragino Sans', 'Noto Sans JP', 'Yu Gothic', Meiryo, sans-serif",
  });

  map.addControl(new maplibregl.AttributionControl({ compact: false }), "bottom-right");
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-left");

  map.on("load", function () {
    map.resize();
  });

  map.on("error", function (e) {
    if (window.console && console.warn) {
      console.warn("MapLibre error:", e && e.error ? e.error : e);
    }
  });

  // モバイルでは #map-panel が「非表示(高さ0)→ 結果選択時に下半分」と
  // サイズが変化する。MapLibre はコンテナのリサイズを検知できないことが
  // あるため、明示的に resize() を呼んで追従させる。
  if (window.ResizeObserver) {
    new ResizeObserver(function () {
      map.resize();
    }).observe(mapPanel);
  }

  // ----- データ取得 -----
  Promise.all([fetch(LOOKUP_URL), fetch(DISTRICTS_URL)])
    .then(function (responses) {
      responses.forEach(function (res) {
        if (!res.ok) {
          throw new Error("HTTP " + res.status + " (" + res.url + ")");
        }
      });
      return Promise.all(
        responses.map(function (res) {
          return res.json();
        })
      );
    })
    .then(function (results) {
      var lookup = results[0];
      var districts = results[1];

      records = lookup.records || [];
      districts.forEach(function (d) {
        districtPositions[d.name] = { lat: d.lat, lng: d.lng };
      });
    })
    .catch(function (err) {
      showError("住所データの読み込みに失敗しました。時間をおいて再読み込みしてください。");
      if (window.console && console.error) {
        console.error("lookup.json / districts.json の取得に失敗:", err);
      }
    });

  // ----- 検索 -----
  // 2段階検索: ①まず部分一致 → ②0件のときのみ文字種境界(かな漢字⇔英数字)で
  // トークン分割してAND検索にフォールバックする。空白区切りで複数キーワードが
  // 入力された場合は、最初からAND検索として扱う(詳細は normalize.js 参照)。
  function performSearch(rawQuery) {
    var trimmed = rawQuery.trim();

    if (trimmed.length < MIN_QUERY_LENGTH) {
      renderIdle();
      return;
    }

    var result = searchRecords(records, trimmed);
    renderResults(result.hits, result.usedFallback);
  }

  function renderIdle() {
    resultsList.innerHTML = "";
    resultsSummary.textContent = "町名・旧住所・通称のいずれかを2文字以上入力してください。";
  }

  function renderResults(hits, usedFallback) {
    resultsList.innerHTML = "";

    if (hits.length === 0) {
      resultsSummary.textContent =
        "該当が見つかりません。未収録の地区の可能性があります。正式な住所は " +
        CITY_CONTACT +
        " へお問い合わせください。";
      return;
    }

    var shown = hits.slice(0, MAX_RESULTS);

    var summaryText =
      hits.length > MAX_RESULTS
        ? "該当 " + hits.length + " 件中、上位 " + MAX_RESULTS + " 件を表示しています。絞り込んでください。"
        : "該当 " + hits.length + " 件";

    if (usedFallback) {
      summaryText += "(完全一致では見つからなかったため、キーワード分割で検索した結果です)";
    }

    resultsSummary.textContent = summaryText;

    shown.forEach(function (record) {
      resultsList.appendChild(buildResultItem(record));
    });
  }

  // 資料上その列の情報が実質存在しない値かどうかを判定する。
  // 空文字列に加え、「★」(法人等を示す記号のみが残るケース)のように
  // 実質的な内容を持たない値もここでまとめて扱う。
  var BLANK_LIKE_PATTERN = /^[★\s]*$/;
  function isBlankLike(value) {
    if (value === null || value === undefined) return true;
    return BLANK_LIKE_PATTERN.test(String(value));
  }
  var NOT_RECORDED_TEXT = "(資料に記載なし)";

  function buildResultItem(record) {
    var li = document.createElement("li");
    li.className = "result-item";

    var button = document.createElement("button");
    button.type = "button";
    button.className = "result-button";

    var primary = document.createElement("div");
    primary.className = "result-primary";
    primary.textContent = record.new_town + record.block + "番" + record.house + "号";

    var secondary = document.createElement("div");
    secondary.className = "result-secondary";
    var oldText = isBlankLike(record.old) ? NOT_RECORDED_TEXT : record.old;
    var aliasText = isBlankLike(record.alias) ? NOT_RECORDED_TEXT : record.alias;
    var secondaryText = "旧住所: " + oldText + " ／ 通称: " + aliasText;
    secondary.textContent = secondaryText;

    var meta = document.createElement("div");
    meta.className = "result-meta";
    meta.textContent = record.district + " ・ 実施日: " + (record.date || "確認中");

    button.appendChild(primary);
    button.appendChild(secondary);
    button.appendChild(meta);

    if (record.conf === "low") {
      var badge = document.createElement("span");
      badge.className = "badge-check";
      badge.textContent = "要確認";
      button.appendChild(badge);
    }

    button.addEventListener("click", function () {
      selectResult(record, li);
    });

    li.appendChild(button);
    return li;
  }

  // ----- 結果選択 → 地図移動 -----
  function selectResult(record, li) {
    if (selectedItem) {
      selectedItem.classList.remove("is-selected");
    }
    li.classList.add("is-selected");
    selectedItem = li;

    appMain.classList.add("has-selection");

    var pos = districtPositions[record.district];
    if (pos && typeof pos.lat === "number" && typeof pos.lng === "number") {
      if (marker) marker.remove();
      marker = new maplibregl.Marker().setLngLat([pos.lng, pos.lat]).addTo(map);
      map.flyTo({ center: [pos.lng, pos.lat], zoom: SELECTED_ZOOM });
    } else {
      // 代表点が未確定の地区は、地図を初期位置に留めマーカーは表示しない。
      if (marker) {
        marker.remove();
        marker = null;
      }
      map.flyTo({ center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM });
    }
  }

  // ----- 検索入力(2文字以上・debounce 300ms) -----
  searchInput.addEventListener("input", function () {
    if (debounceTimer) clearTimeout(debounceTimer);
    var value = searchInput.value;
    debounceTimer = setTimeout(function () {
      performSearch(value);
    }, DEBOUNCE_MS);
  });

  renderIdle();
})();
