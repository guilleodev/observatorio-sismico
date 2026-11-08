// Mutaciones del frontend de 6.2 (F6, T024): cada cambio deliberado de src/app DEBE hacer fallar alguna prueba (`node --test`); el original se restaura SIEMPRE.
// Uso (desde la raíz del repositorio):  node scripts/f6/mutaciones_62_front.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const SRC = 'frontend/src/app/';
const MUT = [
  ['mode=live también envía parámetros', 'modo.ts', "if (modo !== 'replay') return {};", 'if (false) return {};'],
  ['run viaja sin mode=replay', 'modo.ts', "{ mode: 'replay', run }", "{ run }"],
  ['el periodo de la ejecución excluye su último evento', 'modo.ts', 'endMs: h + 1', 'endMs: h'],
  ['el periodo personalizado se ignora en replay', 'modo.ts', "filtros.preajuste === 'personalizado' ? resolver(filtros, base.endMs) : base", 'base'],
  ['la etiqueta no dice qué ejecución es', 'modo.ts', 'ejecución ${e.run_id} · ', ''],
  ['la etiqueta no dice la velocidad', 'modo.ts', '${textoVelocidad(e.velocidad)} · ', ''],
  ['los títulos de las gráficas nunca llevan etiqueta', 'modo.ts', 'return replay ? `${titulo} · ${ETIQUETA_REPLAY}` : titulo;', 'return titulo;'],
  ['la ficha de replay no lleva etiqueta', 'modo.ts', "if (!replay) return '';", "return '';"],
  ['la ficha también se etiqueta en vivo', 'modo.ts', "if (!replay) return '';", 'if (false) return "";'],
  ['el caso controlado no se reconoce', 'modo.ts', "return typeof p?.caso === 'string' && p.caso !== '';", 'return false;'],
  ['la lectura vacía conserva la ejecución anterior', 'modo.ts', 'ejecucion: null, total: null', "ejecucion: { run_id: 'anterior' } as never, total: null"],
  ['la lectura vacía conserva el total anterior', 'modo.ts', 'ejecucion: null, total: null', 'ejecucion: null, total: 99'],
  ['el resumen de replay sigue diciendo «últimas 24 h»', 'modo.ts', "'toda la ejecución')", "'últimas 24 h')"],
  ['sin ejecuciones no se explica cómo lanzarla', 'estado.ts', "e.modo === 'replay' && e.sinEjecuciones && !e.error", 'false'],
  ['la reproducción se presenta como «Datos al día»', 'estado.ts', "if (e.modo === 'replay') return { nivel: 'ok'", "if (false) return { nivel: 'ok'"],
  ['sin conexión no advierte de que es una reproducción', 'estado.ts', "(e.modo === 'replay' ? ' Son una reproducción histórica, no actividad actual.' : '')", "''"],
  ['sin ejecuciones se avisa de «sin eventos»', 'estado.ts', '!e.error && !e.sinEjecuciones && e.hayLectura', '!e.error && e.hayLectura'],
  ['el servicio acepta estadísticas sin comparación', 'api.service.ts', "('reciente' in c ? !!c.reciente : c.comparacion_disponible === false && typeof c.motivo === 'string')", 'true'],
  ['/api/salud ignora el modo', 'api.service.ts', "'/api/salud', params, externa", "'/api/salud', {}, externa"],
  ['la tabla pierde el caso controlado', 'tabla.ts', "typeof p?.caso === 'string' && p.caso !== '' ? p.caso : null,", 'null,'],
  ['el mapa no lleva etiqueta', 'app.component.html', '<p class="etiqueta-mapa" role="note">{{ e }}</p>', ''],
  ['la tabla no recibe la etiqueta', 'app.component.html', '<app-tabla [etiqueta]="etiquetaVista()"', '<app-tabla'],
  ['una gráfica no lleva etiqueta', 'app.component.html', `[titulo]="rotular('Terremotos por país')"`, 'titulo="Terremotos por país"'],
  ['el estado no recibe la ejecución', 'app.component.html', '[ejecucion]="ejecucion()" (cargarResto)', '(cargarResto)'],
  ['la comparación se muestra también en replay', 'app.component.html', '@if (comparacionVivo(); as cmp)', '@if (estadisticas()?.comparacion; as cmp)'],
  ['el cambio de modo no se anuncia con el texto del modo', 'app.component.ts', "'Modo REPRODUCCIÓN: datos históricos reproducidos, no actividad actual.'", "''"],
  ['el cambio de modo conserva los datos anteriores', 'app.component.ts', '    this.descartarLectura();\n    this.anuncioModo', '    this.anuncioModo'],
  ['el cambio de modo no cancela la petición en curso', 'app.component.ts', '    this.ultima.cancelar();\n    this.modoVista.set(modo);', '    this.modoVista.set(modo);'],
  ['la ficha del mapa no lleva la etiqueta de replay', 'app.component.ts', 'fichaReplay(p, this.ejecucion(), this.esReplay()) + ', ''],
];

const ejecutar = () => {
  const p = spawnSync(process.execPath, ['--test', '--no-warnings', ...readdirTests()], { encoding: 'utf8', timeout: 120000 });
  const r = (p.stdout ?? '').split('\n').find((l) => l.startsWith('ℹ fail')) ?? '';
  return { rc: p.status, texto: r.replace('ℹ ', '') };
};
import { readdirSync } from 'node:fs';
function readdirTests() { return readdirSync('frontend/tests').filter((f) => f.endsWith('.test.ts')).map((f) => `frontend/tests/${f}`); }

const base = ejecutar();
console.log(`# 6.2 T024 - mutaciones del frontend\nBase sin mutar: ${base.rc === 0 ? 'OK' : 'FALLA'} (${base.texto})\n`);
if (base.rc !== 0) process.exit(1);
const supervivientes = [];
for (const [descripcion, archivo, original, mutante] of MUT) {
  const ruta = SRC + archivo;
  const texto = readFileSync(ruta, 'utf8');
  const apariciones = texto.split(original).length - 1;
  if (apariciones !== 1) { console.log(`  ?? ${descripcion}: el original aparece ${apariciones} veces (se esperaba 1)`); supervivientes.push(`${descripcion} (no aplicable)`); continue; }
  let r;
  try { writeFileSync(ruta, texto.replace(original, () => mutante)); r = ejecutar(); } finally { writeFileSync(ruta, texto); }
  if (r.rc === 0) supervivientes.push(descripcion);
  console.log(`  ${r.rc === 0 ? 'SOBREVIVE ' : 'DETECTADA '} ${descripcion}  [${r.texto}]`);
}
const final = ejecutar();
console.log(`\nRestaurado: ${final.rc === 0 ? 'OK' : 'FALLA'} (${final.texto})`);
console.log(`Mutaciones: ${MUT.length} | detectadas: ${MUT.length - supervivientes.length} | supervivientes: ${supervivientes.length ? JSON.stringify(supervivientes) : 'ninguna'}`);
process.exit(supervivientes.length || final.rc !== 0 ? 1 : 0);
