const keys = ['verticesPoligono','sectoresVirtuales','posicionNaveMolienda','posicionSiloConos','posicionCajones','posicionConos','elementosMapa'];
const acopioKeys = ['id','nombre','sector','cuadrante','pisos','posX','posY','radioBase','largoEje','activo','esFuturo'];
export function extractSharedMap(source) {
  const result = { schema: 1 };
  for (const key of keys) result[key] = source[key];
  result.acopios = (source.acopios ?? source.stockPlaya ?? []).map(a => Object.fromEntries(acopioKeys.filter(k => a[k] !== undefined).map(k => [k,a[k]])));
  if (!Array.isArray(result.verticesPoligono) || result.verticesPoligono.length < 3 || !Array.isArray(result.sectoresVirtuales) || !Array.isArray(result.elementosMapa) || !result.posicionCajones || !result.posicionConos)
    throw new Error('El archivo no contiene un plano completo.');
  return JSON.parse(JSON.stringify(result));
}
