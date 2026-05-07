// ==============================
// 登山道調査マップ app.js
// ==============================

// GAS WebアプリURL
const TRAIL_API_URL = 'https://script.google.com/macros/s/AKfycbz00fjNpq7FEaAE3SbUs1x2Lz0UYyUFnf57CTZmPxthLYhWV_p35C3XGcZhYVcLcE1u/exec';

// 初期表示位置：各務原市周辺
const INITIAL_CENTER = [35.4079, 136.8485];
const INITIAL_ZOOM = 13;

let map;
let trailLayer;
let currentLocationLayer;

let trailPendingLatLng = null;
let trailPendingAccuracy = '';

const TRAIL_DEFAULTS_KEY = 'trailSurveyDefaults';

const TRAIL_TYPE_STYLE = {
  '登山口': { color: '#2e7d32', icon: '入' },
  '駐車場': { color: '#1565c0', icon: 'P' },
  'トイレ': { color: '#0097a7', icon: 'WC' },
  '分岐': { color: '#f9a825', icon: '分' },
  '道標': { color: '#ef6c00', icon: '標' },
  '危険箇所': { color: '#c62828', icon: '!' },
  '休憩地点': { color: '#6a1b9a', icon: '休' },
  '水場': { color: '#0277bd', icon: '水' },
  '携帯電波': { color: '#455a64', icon: '電' },
  'その他': { color: '#616161', icon: '他' }
};

document.addEventListener('DOMContentLoaded', function () {
  initMap();
  initTrailSurvey();
});

// ==============================
// 地図初期化
// ==============================

function initMap() {
  map = L.map('map').setView(INITIAL_CENTER, INITIAL_ZOOM);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  trailLayer = L.layerGroup().addTo(map);
  currentLocationLayer = L.layerGroup().addTo(map);
}

// ==============================
// 登山道調査機能 初期化
// ==============================

function initTrailSurvey() {
  setupTrailFormEvents();
  addTrailCurrentLocationControl();
  loadTrailMarkers();

  map.on('click', function (e) {
    openTrailForm(e.latlng, '');
  });
}

// ==============================
// JSONP通信
// ==============================

function trailJsonp(action, params = {}) {
  return new Promise(function (resolve, reject) {
    const callbackName =
      'trailCallback_' + Date.now() + '_' + Math.random().toString(36).slice(2);

    const url = new URL(TRAIL_API_URL);
    url.searchParams.set('action', action);
    url.searchParams.set('callback', callbackName);

    Object.keys(params).forEach(function (key) {
      const value = params[key];

      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    });

    const script = document.createElement('script');

    const timer = setTimeout(function () {
      cleanup();
      reject(new Error('API通信がタイムアウトしました。'));
    }, 15000);

    function cleanup() {
      clearTimeout(timer);

      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }

      try {
        delete window[callbackName];
      } catch (error) {
        window[callbackName] = undefined;
      }
    }

    window[callbackName] = function (data) {
      cleanup();

      if (data && data.ok) {
        resolve(data);
      } else {
        reject(new Error((data && data.error) ? data.error : 'APIエラーが発生しました。'));
      }
    };

    script.onerror = function () {
      cleanup();
      reject(new Error('APIの読み込みに失敗しました。'));
    };

    script.src = url.toString();
    document.body.appendChild(script);
  });
}

// ==============================
// 登山道マーカー取得
// ==============================

async function loadTrailMarkers() {
  try {
    const result = await trailJsonp('getTrailMarkers');

    trailLayer.clearLayers();

    result.markers.forEach(function (marker) {
      addTrailMarkerToMap(marker);
    });

    console.log('登山道マーカー取得:', result.count + '件');

  } catch (error) {
    console.error('登山道マーカー取得エラー:', error);
    alert('登山道マーカーの取得に失敗しました。\n' + error.message);
  }
}

// ==============================
// 登山道マーカー表示
// ==============================

function addTrailMarkerToMap(marker) {
  const lat = Number(marker.lat);
  const lng = Number(marker.lng);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return;
  }

  const leafletMarker = L.marker([lat, lng], {
    icon: createTrailIcon(marker.point_type)
  });

  leafletMarker.bindPopup(createTrailPopupHtml(marker));
  leafletMarker.addTo(trailLayer);
}

function createTrailIcon(pointType) {
  const style = TRAIL_TYPE_STYLE[pointType] || TRAIL_TYPE_STYLE['その他'];

  return L.divIcon({
    className: 'trail-marker-icon',
    html:
      '<div class="trail-marker-pin" style="background:' + style.color + ';">' +
        '<span>' + style.icon + '</span>' +
      '</div>',
    iconSize: [30, 30],
    iconAnchor: [15, 30],
    popupAnchor: [0, -30]
  });
}

function createTrailPopupHtml(marker) {
  const title = escapeHtml(marker.point_name || marker.point_type || '地点情報');

  const photoSrc = marker.photo_thumb_url || marker.photo_url || '';
  const photoLink = marker.photo_url || marker.photo_thumb_url || '';

  const photoHtml = photoSrc
    ? `
      <hr>
      <a href="${escapeAttribute(photoLink)}" target="_blank" rel="noopener">
        <img
          class="trail-popup-photo"
          src="${escapeAttribute(photoSrc)}"
          alt="現地写真"
          onerror="this.style.display='none';"
        >
      </a>
    `
    : '';

  const memoHtml = marker.memo
    ? '<hr><strong>メモ</strong><br>' + escapeHtml(marker.memo).replace(/\n/g, '<br>')
    : '';

  return `
    <div class="trail-popup">
      <div class="trail-popup-title">${title}</div>
      <hr>
      種別：${escapeHtml(marker.point_type || '')}<br>
      山域：${escapeHtml(marker.mountain_area || '')}<br>
      ルート：${escapeHtml(marker.trail_name || '')}<br>
      状態：${escapeHtml(marker.condition || '')}<br>
      電波：${escapeHtml(marker.mobile_signal || '')}<br>
      調査者：${escapeHtml(marker.user_name || '')}<br>
      登録：${escapeHtml(marker.created_at || '')}
      ${photoHtml}
      ${memoHtml}
    </div>
  `;
}

// ==============================
// フォーム処理
// ==============================

function setupTrailFormEvents() {
  const form = document.getElementById('trail-form');
  const closeBtn = document.getElementById('trail-form-close');
  const cancelBtn = document.getElementById('trail-form-cancel');

  closeBtn.addEventListener('click', closeTrailForm);
  cancelBtn.addEventListener('click', closeTrailForm);

  form.addEventListener('submit', async function (e) {
  e.preventDefault();

  if (!trailPendingLatLng) {
    alert('登録地点がありません。地図をタップしてください。');
    return;
  }

  const submitBtn = document.getElementById('trail-form-submit');
  submitBtn.disabled = true;
  submitBtn.textContent = '保存中...';

  try {
    const payload = buildTrailFormPayload();

    saveTrailDefaults(payload);

    // 先に写真をDriveへアップロード
    setTrailPhotoStatus('写真を確認中...');

    const photoResult = await uploadTrailPhotoIfNeeded(payload);

    payload.photo_url = photoResult.file_url || '';
    payload.photo_file_id = photoResult.file_id || '';
    payload.photo_thumb_url = photoResult.thumbnail_url || '';

    // その後、地点情報をスプレッドシートへ保存
    setTrailPhotoStatus('地点情報を保存中...');

    const result = await trailJsonp('addTrailMarker', payload);

    addTrailMarkerToMap(result.marker);
    closeTrailForm();

    alert('保存しました。');

  } catch (error) {
    console.error('登山道ポイント保存エラー:', error);
    alert('保存に失敗しました。\n' + error.message);

  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = '保存する';
    setTrailPhotoStatus('写真を選択しない場合は、写真なしで保存されます。');
  }
});
}

function openTrailForm(latlng, accuracy) {
  trailPendingLatLng = latlng;
  trailPendingAccuracy = accuracy || '';

  document.getElementById('trail-lat-view').textContent = latlng.lat.toFixed(6);
  document.getElementById('trail-lng-view').textContent = latlng.lng.toFixed(6);
  document.getElementById('trail-accuracy-view').textContent =
    trailPendingAccuracy ? Math.round(trailPendingAccuracy) + 'm' : '未取得';

  loadTrailDefaults();

  document.getElementById('trail-form-backdrop').classList.remove('trail-hidden');
}

function closeTrailForm() {
  document.getElementById('trail-form-backdrop').classList.add('trail-hidden');
  trailPendingLatLng = null;
  trailPendingAccuracy = '';

  document.getElementById('trail-point-name').value = '';
  document.getElementById('trail-memo').value = '';
  document.getElementById('trail-point-type').value = '登山口';
  document.getElementById('trail-condition').value = '要確認';
  document.getElementById('trail-mobile-signal').value = '未確認';

  const photoFile = document.getElementById('trail-photo-file');
  if (photoFile) {
    photoFile.value = '';
  }

  setTrailPhotoStatus('写真を選択しない場合は、写真なしで保存されます。');
}

function buildTrailFormPayload() {
  return {
    user_name: getValue('trail-user-name'),
    mountain_area: getValue('trail-mountain-area'),
    trail_name: getValue('trail-name'),
    point_type: getValue('trail-point-type'),
    point_name: getValue('trail-point-name'),
    lat: trailPendingLatLng.lat,
    lng: trailPendingLatLng.lng,
    accuracy: trailPendingAccuracy,
    status: '有効',
    condition: getValue('trail-condition'),
    mobile_signal: getValue('trail-mobile-signal'),
    photo_url: '',
    photo_file_id: '',
    photo_thumb_url: '',
    memo: getValue('trail-memo'),
    source: '現地確認'
  };
}

// ==============================
// 現在地から登録
// ==============================

function addTrailCurrentLocationControl() {
  const control = L.control({ position: 'topleft' });

  control.onAdd = function () {
    const div = L.DomUtil.create('div', 'trail-location-control');
    div.innerHTML = '<button type="button">現在地で登録</button>';

    L.DomEvent.disableClickPropagation(div);

    div.querySelector('button').addEventListener('click', function () {
      map.locate({
        setView: true,
        maxZoom: 17,
        enableHighAccuracy: true,
        timeout: 10000
      });
    });

    return div;
  };

  control.addTo(map);

  map.on('locationfound', function (e) {
    showCurrentLocation(e);
    openTrailForm(e.latlng, e.accuracy);
  });

  map.on('locationerror', function (e) {
    alert('現在地を取得できませんでした。\n' + e.message);
  });
}

function showCurrentLocation(e) {
  currentLocationLayer.clearLayers();

  L.circle(e.latlng, {
    radius: e.accuracy,
    color: '#1565c0',
    fillColor: '#1565c0',
    fillOpacity: 0.12
  }).addTo(currentLocationLayer);

  L.circleMarker(e.latlng, {
    radius: 7,
    color: '#1565c0',
    fillColor: '#1565c0',
    fillOpacity: 1
  }).addTo(currentLocationLayer);
}

// ==============================
// 前回入力値保存
// ==============================

function saveTrailDefaults(payload) {
  const defaults = {
    user_name: payload.user_name,
    mountain_area: payload.mountain_area,
    trail_name: payload.trail_name
  };

  localStorage.setItem(TRAIL_DEFAULTS_KEY, JSON.stringify(defaults));
}

function loadTrailDefaults() {
  try {
    const raw = localStorage.getItem(TRAIL_DEFAULTS_KEY);

    if (!raw) {
      return;
    }

    const defaults = JSON.parse(raw);

    setValue('trail-user-name', defaults.user_name || '');
    setValue('trail-mountain-area', defaults.mountain_area || '');
    setValue('trail-name', defaults.trail_name || '');

  } catch (error) {
    console.warn('前回入力値の復元に失敗:', error);
  }
}

// ==============================
// 共通関数
// ==============================

function getValue(id) {
  const el = document.getElementById(id);
  return el ? el.value.trim() : '';
}

function setValue(id, value) {
  const el = document.getElementById(id);

  if (el) {
    el.value = value;
  }
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, '&#096;');
}

// ==============================
// 写真アップロード
// ==============================

function uploadTrailPhotoIfNeeded(payload) {
  const fileInput = document.getElementById('trail-photo-file');

  if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
    return Promise.resolve({
      file_url: '',
      file_id: '',
      thumbnail_url: ''
    });
  }

  const file = fileInput.files[0];

  if (!file.type || file.type.indexOf('image/') !== 0) {
    return Promise.reject(new Error('画像ファイルを選択してください。'));
  }

  if (file.size > 10 * 1024 * 1024) {
    return Promise.reject(new Error('写真サイズが大きすぎます。10MB以下の写真を選択してください。'));
  }

  return new Promise(function (resolve, reject) {
    const token =
      'upload_' + Date.now() + '_' + Math.random().toString(36).slice(2);

    const form = document.getElementById('trail-photo-upload-form');

    document.getElementById('trail-upload-token').value = token;
    document.getElementById('trail-upload-point-name').value = payload.point_name || '';
    document.getElementById('trail-upload-mountain-area').value = payload.mountain_area || '';
    document.getElementById('trail-upload-trail-name').value = payload.trail_name || '';

    form.action = TRAIL_API_URL;

    const timer = setTimeout(function () {
      cleanup();
      reject(new Error('写真アップロードがタイムアウトしました。'));
    }, 30000);

    function cleanup() {
      clearTimeout(timer);
      window.removeEventListener('message', onMessage);
    }

    function onMessage(event) {
      const data = event.data;

      if (!data || data.source !== 'trailPhotoUpload') {
        return;
      }

      if (data.upload_token !== token) {
        return;
      }

      cleanup();

      if (data.ok) {
        resolve(data);
      } else {
        reject(new Error(data.error || '写真アップロードに失敗しました。'));
      }
    }

    window.addEventListener('message', onMessage);

    setTrailPhotoStatus('写真をアップロード中...');

    form.submit();
  });
}


function setTrailPhotoStatus(message) {
  const el = document.getElementById('trail-photo-status');

  if (el) {
    el.textContent = message;
  }
}