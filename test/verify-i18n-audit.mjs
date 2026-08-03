// Auditoría de i18n: paridad estructural entre diccionarios + claves usadas en
// el DOM que realmente resuelven en los 4 idiomas. No es parte de la suite
// automática (no altera exit code de otros tests); es una herramienta de
// diagnóstico puntual.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const raiz = path.resolve('.');
const i18nPath = path.join(raiz, 'assets/js/i18n.js');
const src = fs.readFileSync(i18nPath, 'utf8');

// Ejecutamos el IIFE en un sandbox con stubs de window/document/localStorage
// para poder inspeccionar window.i18n sin un navegador real.
const store = {};
const sandbox = {
  window: {},
  navigator: { language: 'es' },
  localStorage: {
    getItem: (k) => store[k] ?? null,
    setItem: (k, v) => { store[k] = v; },
  },
  document: {
    readyState: 'complete',
    documentElement: { lang: '' },
    addEventListener() {},
    querySelectorAll: () => [],
  },
  console,
};
sandbox.window.i18n = undefined;
vm.createContext(sandbox);
vm.runInContext(src, sandbox, { filename: i18nPath });
const i18n = sandbox.window.i18n;

// Reconstruimos DICTS indirectamente: no está expuesto, así que evaluamos nn
// el archivo de nuevo capturando la variable a través de una copia editada en
// memoria (parcheamos el cierre exponiendo DICTS temporalmente).
const srcConDicts = src.replace(
  'window.i18n = { SUPPORTED, t, getLang, setLang, onChange, updateDOM, mountSwitcher };',
  'window.i18n = { SUPPORTED, t, getLang, setLang, onChange, updateDOM, mountSwitcher, DICTS };'
);
const sandbox2 = { ...sandbox, window: {} };
vm.createContext(sandbox2);
vm.runInContext(srcConDicts, sandbox2, { filename: i18nPath });
const DICTS = sandbox2.window.i18n.DICTS;
const LANGS = sandbox2.window.i18n.SUPPORTED;

let fails = 0;
function fail(msg) { fails++; console.log('  ✗ ' + msg); }
function ok(msg) { console.log('  ✓ ' + msg); }

// ---------------------------------------------------------------
// 1) Paridad estructural: mismas claves-hoja (string) en los 4 idiomas
// ---------------------------------------------------------------
console.log('== 1) Paridad de claves entre idiomas ==');
function hojas(obj, prefijo = '') {
  let out = [];
  for (const k of Object.keys(obj)) {
    const clave = prefijo ? prefijo + '.' + k : k;
    const v = obj[k];
    if (v != null && typeof v === 'object' && !Array.isArray(v)) out = out.concat(hojas(v, clave));
    else out.push(clave);
  }
  return out;
}
const claveSets = {};
for (const lang of LANGS) claveSets[lang] = new Set(hojas(DICTS[lang]));
const base = LANGS[0];
let paridadOk = true;
for (const lang of LANGS) {
  if (lang === base) continue;
  const faltan = [...claveSets[base]].filter(k => !claveSets[lang].has(k));
  const sobran = [...claveSets[lang]].filter(k => !claveSets[base].has(k));
  if (faltan.length) { paridadOk = false; fail(`${lang}: faltan ${faltan.length} claves respecto a ${base}: ${faltan.slice(0,10).join(', ')}${faltan.length>10?'…':''}`); }
  if (sobran.length) { paridadOk = false; fail(`${lang}: tiene ${sobran.length} claves de más respecto a ${base}: ${sobran.slice(0,10).join(', ')}${sobran.length>10?'…':''}`); }
}
if (paridadOk) ok(`las ${claveSets[base].size} claves de "${base}" existen igual en ${LANGS.slice(1).join(', ')}`);

// ---------------------------------------------------------------
// 2) Placeholders {{x}} consistentes entre idiomas para la misma clave
// ---------------------------------------------------------------
console.log('== 2) Placeholders {{x}} consistentes entre idiomas ==');
function resolver(dict, clave) {
  let n = dict;
  for (const parte of clave.split('.')) { if (n == null) return undefined; n = n[parte]; }
  return typeof n === 'string' ? n : undefined;
}
function placeholders(str) {
  return new Set([...str.matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1]));
}
let phOk = true;
for (const clave of claveSets[base]) {
  const refPh = placeholders(resolver(DICTS[base], clave) || '');
  for (const lang of LANGS) {
    if (lang === base) continue;
    const txt = resolver(DICTS[lang], clave);
    if (txt === undefined) continue; // ya reportado arriba
    const ph = placeholders(txt);
    const faltan = [...refPh].filter(p => !ph.has(p));
    const sobran = [...ph].filter(p => !refPh.has(p));
    if (faltan.length || sobran.length) {
      phOk = false;
      fail(`${lang}.${clave}: placeholders distintos (esperados [${[...refPh]}], hallados [${[...ph]}])`);
    }
  }
}
if (phOk) ok('todos los placeholders {{x}} coinciden entre idiomas para la misma clave');

// ---------------------------------------------------------------
// 3) Cada <title> de los puntos de entrada trae data-i18n y resuelve
// ---------------------------------------------------------------
// El <title> es la única pieza de texto visible que NO pasa por
// updateDOM() salvo que se marque explícitamente: si a alguien se le olvida
// el data-i18n aquí, la pestaña del navegador se queda en español para
// siempre sin que ningún otro chequeo lo note (el resto del DOM sí se
// retraduce). Ver commit que rompió esto: los 3 <title> originales no
// tenían data-i18n en absoluto.
console.log('== 3) <title> de cada punto de entrada trae data-i18n y resuelve ==');
const ENTRADAS = [
  'assets/captura-v3/index.html',
  'assets/captura-v3/rol.html',
  'assets/captura-v3/servidor.html',
  'assets/modo-juggernaut/index.html',
];
let titulosOk = true;
for (const rel of ENTRADAS) {
  const html = fs.readFileSync(path.join(raiz, rel), 'utf8');
  const m = html.match(/<title([^>]*)>([^<]*)<\/title>/);
  if (!m) { titulosOk = false; fail(`${rel}: no tiene <title>`); continue; }
  const claveM = m[1].match(/data-i18n="([^"]+)"/);
  if (!claveM) { titulosOk = false; fail(`${rel}: <title> sin data-i18n (queda fijo en un idioma)`); continue; }
  const clave = claveM[1];
  for (const lang of LANGS) {
    if (resolver(DICTS[lang], clave) === undefined) {
      titulosOk = false;
      fail(`${rel}: <title data-i18n="${clave}"> no resuelve en "${lang}"`);
    }
  }
}
if (titulosOk) ok(`los ${ENTRADAS.length} <title> tienen data-i18n y resuelven en los ${LANGS.length} idiomas`);

console.log('\n====================================================');
console.log(fails === 0 ? `Resultado: paridad OK, 0 fallas` : `Resultado: ${fails} FALLAS`);
process.exit(fails ? 1 : 0);
