const keys = ['verticesPoligono','sectoresVirtuales','posicionNaveMolienda','posicionSiloConos','posicionCajones','posicionConos','elementosMapa'];
const CARDINAL_DEFAULT = { visible: true, x: 900, y: 62, tamano: 34, rotacion: 0 };
const acopioKeys = ['id','nombre','sector','cuadrante','pisos','posX','posY','radioBase','largoEje','activo','esFuturo','forma','textura','calidades','recetaId','origenReceta'];
const pick = (value, fields) => Object.fromEntries(fields.filter(k => value[k] !== undefined).map(k => [k, value[k]]));
export function extractSharedMap(source) {
  const result = { schema: 2 };
  for (const key of keys) result[key] = source[key];
  result.referenciaCardinal = { ...CARDINAL_DEFAULT, ...(source.referenciaCardinal ?? {}) };
  result.acopios = (source.acopios ?? source.stockPlaya ?? []).filter(a => a.enPlano !== false).map(a => ({ forma: 'elipse', calidades: {}, textura: { arcilla: 0, arena: 0, limo: 0 }, ...pick(a, acopioKeys) }));
  result.conos = (source.conos ?? source.stockSilos ?? []).filter(a => a.enPlano !== false).map(a => pick(a, ['id','nombre','activo']));
  result.reservas = (source.reservas ?? source.plan?.recetasAcopio ?? []).map(a => pick(a, ['id','nombreNuevoAcopio','sectorDestino','pisosPrevistos','paladas1','paladas2','componente1','componente2']));
  result.parametros = source.parametros ?? { densidadTierra: source.densidadTierra ?? 1.5, escalaCalidad: source.escalaCalidad ?? 3,
    caracteristicasTierra: source.caracteristicasTierra ?? [] };
  if (!Array.isArray(result.verticesPoligono) || result.verticesPoligono.length < 3 || !Array.isArray(result.sectoresVirtuales) || !Array.isArray(result.elementosMapa) || !result.posicionCajones || !result.posicionConos)
    throw new Error('El archivo no contiene un plano completo.');
  return JSON.parse(JSON.stringify(result));
}
export function mergeMapItems(local, remote, defaults = {}) {
  return [...remote.map(item => ({ ...defaults, ...pick(local.find(a => String(a.id) === String(item.id)) ?? {}, ['toneladas','m3Estimados','paladas','paladasOperativas','humedadNivel']), ...item, enPlano: true })),
    ...local.filter(a => !remote.some(b => String(b.id) === String(a.id))).map(a => ({ ...a, enPlano: false }))];
}
export function withInventory(item, inventory, density = 1.5) {
  const stored = inventory?.find(a => String(a.id) === String(item.id));
  const tonnes = stored ? Number(stored.toneladas) : 0;
  const h = Math.max(0, Math.min(3, Math.round(Number(item.calidades?.Humedad ?? stored?.humedadNivel ?? 1))));
  const rho = Math.round(density * (1 + [0,10,15,20][h] / 100) / 1.1 * 100) / 100;
  const m3 = Math.round(tonnes / rho * 100) / 100;
  return { ...item, toneladas: tonnes, m3Estimados: m3, paladas: Math.round(m3 / 3),
    paladasOperativas: stored?.paladasOperativas ?? 0, humedadNivel: stored?.humedadNivel ?? 1 };
}
