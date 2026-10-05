/**
 * Harry Potter Saga — fuente JS para lolapp
 * Adaptado del plugin Kino (YxhelZvl).
 *
 * getStreams(tmdbId, type, season, episode)
 * - Coincide por ID TMDB (671, 672, …) del JSON remoto.
 * - URLs cifradas YxhelZvl::… necesitan AES-256-GCM + clave hpKey.
 *   En Kino: kino.secret('hpKey'). Aquí: variable HP_KEY (hex 64 chars).
 *   Sin clave no se puede reproducir.
 */

/* global fetch, CryptoJS, module, console, globalThis */

var URL_DATOS =
  'https://raw.githubusercontent.com/YxhelZvl/kino-datasource/refs/heads/main/harry_potter.json';

/**
 * Clave AES-256-GCM en hex (64 caracteres = 32 bytes).
 * En el plugin original venía de kino.secret('hpKey') — no es pública.
 * Si la tienes, pégala aquí para que el addon funcione.
 */
var HP_KEY = '';

var UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function log(msg) {
  if (typeof console !== 'undefined' && console.log) console.log('[HP] ' + msg);
}

async function loadDatos() {
  var res = await fetch(URL_DATOS, { headers: { Accept: 'application/json', 'User-Agent': UA } });
  if (!res.ok) throw new Error('No se pudo cargar harry_potter.json (' + res.status + ')');
  return res.json();
}

function findMovie(datos, tmdbId) {
  var id = String(tmdbId || '').replace(/^tmdb:/i, '').trim();
  var list = (datos && datos.peliculas) || [];
  for (var i = 0; i < list.length; i++) {
    if (String(list[i].id) === id) return list[i];
  }
  // fallback por título parcial si id no coincide
  return null;
}

/**
 * Formato: YxhelZvl::{ivBase64(16 chars)}{ciphertext+tag base64-like}
 * Kino usaba kino.crypto.decrypt('aes-256-gcm', { key hex, iv hex, data }).
 * flutter_js + crypto-js clásico NO implementa GCM de forma fiable.
 * Si no hay HP_KEY, devolvemos error claro.
 */
async function desencriptarUrl(urlOfuscada) {
  if (!urlOfuscada || urlOfuscada.indexOf('YxhelZvl::') !== 0) return urlOfuscada;
  if (!HP_KEY || HP_KEY.length < 32) {
    throw new Error(
      'URL cifrada: falta HP_KEY (clave hpKey de Kino). Sin ella no se puede reproducir.'
    );
  }
  // Intento genérico: el runtime de Kino no está aquí.
  // Dejamos el hook por si en el futuro se inyecta un decrypt nativo.
  if (typeof globalThis.kinoDecryptAesGcm === 'function') {
    var payload = urlOfuscada.substring(10);
    var ivBase64 = payload.substring(0, 16);
    var datosConTag = payload.substring(16);
    return globalThis.kinoDecryptAesGcm({
      key: HP_KEY,
      ivBase64: ivBase64,
      data: datosConTag,
    });
  }
  throw new Error(
    'AES-256-GCM no disponible en este runtime. Usa Kino o un bridge nativo.'
  );
}

async function resolverYandex(url) {
  if (url.indexOf('http://') !== 0 && url.indexOf('https://') !== 0) url = 'https://' + url;
  log('Yandex HTML: ' + url);
  var r = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:157.0) Gecko/20100101 Firefox/157.0' },
  });
  if (!r.ok) throw new Error('Yandex página HTTP ' + r.status);
  var html = await r.text();
  var match = html.match(/<script[^>]*id=["']store-prefetch["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!match) throw new Error('No store-prefetch en Yandex');
  var store = JSON.parse(match[1]);
  var rootId = store.rootResourceId;
  var resources = store.resources || {};
  var resource = resources[rootId];
  if (!resource) {
    for (var key in resources) {
      if (resources[key] && resources[key].type === 'file') {
        resource = resources[key];
        break;
      }
    }
  }
  if (!resource) throw new Error('Sin recurso file');
  var fileHash = resource.hash || resource.path;
  if (!fileHash) throw new Error('Sin hash/path');
  var environment = store.environment || {};
  var sk = environment.externalSk || environment.sk || environment.authSk;
  if (!sk) throw new Error('Sin sk');
  var postRes = await fetch('https://disk.yandex.ru/public/api/download-url', {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain',
      Accept: 'application/json',
      'User-Agent':
        'Mozilla/5.0 (Linux; Android 5.0.2; SM-G920F Build/LRX22G; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/46.0.2490.76 Mobile Safari/537.36',
    },
    body: JSON.stringify({ hash: fileHash, sk: sk }),
  });
  if (!postRes.ok) throw new Error('Yandex API HTTP ' + postRes.status);
  var postData = await postRes.json();
  if (postData.error) throw new Error('Yandex error: ' + JSON.stringify(postData));
  var downloadUrl = postData.data && postData.data.url;
  if (!downloadUrl) throw new Error('Sin data.url');
  // HEAD para seguir redirección si el runtime lo soporta
  try {
    var redirectRes = await fetch(downloadUrl, { method: 'HEAD' });
    if (redirectRes && redirectRes.url) return String(redirectRes.url).trim();
  } catch (e) {}
  return downloadUrl;
}

async function getStreams(tmdbId, type, season, episode) {
  try {
    var media = String(type || 'movie').toLowerCase();
    if (media === 'tv' || media === 'series') return [];

    var datos = await loadDatos();
    var peli = findMovie(datos, tmdbId);
    if (!peli) {
      log('Sin match TMDB ' + tmdbId);
      return [];
    }

    var urlReal = peli.url;
    try {
      urlReal = await desencriptarUrl(peli.url);
    } catch (e) {
      log(String(e && e.message ? e.message : e));
      return [];
    }

    if (urlReal.indexOf('yadi.sk') >= 0 || urlReal.indexOf('disk.yandex') >= 0) {
      urlReal = await resolverYandex(urlReal);
    }

    if (!urlReal || urlReal.indexOf('YxhelZvl::') === 0) return [];

    var q = String(peli.calidad || '1080').replace(/DUAL\s*/i, '').trim() || '1080';
    return [
      {
        url: urlReal,
        title: peli.titulo + ' · ' + (peli.calidad || 'HD') + ' · «' + peli.titulo + '»',
        quality: q,
        lang: 'lat',
        language: 'lat',
        provider: 'Harry Potter',
        name: 'HP ' + (peli.calidad || ''),
        headers: { 'User-Agent': UA },
      },
      {
        url: urlReal,
        title: peli.titulo + ' · ' + (peli.calidad || 'HD') + ' · Inglés · «' + peli.titulo + '»',
        quality: q,
        lang: 'en',
        language: 'en',
        provider: 'Harry Potter',
        name: 'HP EN',
        headers: { 'User-Agent': UA },
      },
    ];
  } catch (e) {
    log('getStreams error: ' + (e && e.message ? e.message : e));
    return [];
  }
}

/** Catálogo opcional (si el runtime llama getHome). */
async function getHome() {
  try {
    var datos = await loadDatos();
    var items = ((datos && datos.peliculas) || []).map(function (p) {
      return {
        id: 'tmdb:' + p.id,
        title: p.titulo,
        type: 'movie',
        poster: p.imagen,
        year: String(p.anio || ''),
        extra: { tmdbId: p.id, calidad: p.calidad, tamano: p.tamano },
      };
    });
    return { rows: [{ id: 'hp-saga', title: 'Saga Harry Potter', items: items }] };
  } catch (e) {
    return { rows: [] };
  }
}

if (typeof module !== 'undefined') {
  module.exports = { getStreams: getStreams, getHome: getHome };
}
if (typeof globalThis !== 'undefined') {
  globalThis.getStreams = getStreams;
  globalThis.getHome = getHome;
}
