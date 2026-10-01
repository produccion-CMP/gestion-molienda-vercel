# Plano compartido y registro central

Esta versión centraliza la definición del plano y los saldos en la planilla `Reportes SG Molienda`. No incluye contraseñas, token de sincronización ni respaldos personales.

## Qué guarda cada hoja

- `MES_Plano_Actual`: una sola versión vigente del plano. Es la que consulta toda la aplicación.
- `MES_Plano_Elementos`: vista legible de cada acopio, cono, cajón, límite, sector, edificio, elemento y reserva. Se actualiza automáticamente al publicar.
- `MES_Planos`: historial de publicaciones. No se borra ni se edita manualmente.
- `AcopiosPlaya` y `MES_Inventario`: saldos validados de acopios y conos. Los cambios de toneladas se registran como ajustes con responsable y motivo.

Los acopios nuevos que se publiquen se crean con saldo cero. Aparecer en el mapa no significa que haya tierra disponible hasta que se registre su saldo validado.

## 1. Guardar un respaldo

1. Abrí la aplicación actual y, desde Configuración, exportá el JSON completo.
2. Guardalo con fecha en una carpeta conocida. No lo subas a GitHub: puede incluir tu configuración local.
3. Abrí el proyecto de Apps Script. Copiá el contenido actual de `Code.gs` a un archivo de texto de respaldo.

## 2. Actualizar Apps Script

1. En la carpeta del paquete abrí `integrations/Code.gs`.
2. Seleccioná todo, copiá y reemplazá el contenido de `Code.gs` en Apps Script.
3. Guardá el proyecto con Ctrl+S.
4. Ejecutá una sola vez `crearEstructuraHojas` desde el selector de funciones superior. Aceptá los permisos si Google los solicita.
5. Confirmá en la planilla que existan `MES_Plano_Actual` y `MES_Plano_Elementos`. No borres ni cambies sus encabezados.
6. Arriba a la derecha pulsá Implementar → Administrar implementaciones.
7. Elegí la implementación web existente, pulsá el lápiz, seleccioná Nueva versión y pulsá Implementar.
8. Conservá la misma URL terminada en `/exec`. No crees una implementación diferente.

Guardar el editor no actualiza la URL pública. La nueva versión sí.

## 3. Actualizar GitHub

1. Abrí el repositorio y elegí la rama `main`.
2. Pulsá Add file → Upload files.
3. Desde la carpeta extraída, seleccioná y arrastrá estas rutas: `App.jsx`, `components/SharedMapPanel.jsx`, `lib/shared-map.js`, `app/api/sheets/route.js`, `integrations/Code.gs`, `tests/shared-map.test.mjs` y `.env.example`.
4. Si GitHub pregunta si querés reemplazar un archivo existente, aceptá el reemplazo.
5. Escribí como mensaje: `Centralizar plano e inventario en Reportes SG Molienda`.
6. Pulsá Commit changes.

No subas archivos `.env.local`, el respaldo JSON ni ningún PIN.

## 4. Configurar Vercel

1. Abrí Vercel y entrá al proyecto Gestión Molienda.
2. Elegí Settings → Environment Variables.
3. Confirmá que existe `MES_SYNC_TOKEN` y que coincide exactamente con el valor de Propiedades del script llamado `MES_SYNC_TOKEN`.
4. Agregá `MES_MAP_PIN`.
5. Escribí un PIN nuevo de al menos ocho caracteres. Puede mezclar letras y números. No uses el PIN local de cuatro dígitos de la interfaz.
6. Marcá Production. También marcá Preview si querés probar los cambios en una vista previa.
7. Pulsá Save.
8. Entrá a Deployments, abrí el último despliegue y elegí Redeploy. Las variables nuevas se aplican solamente a despliegues nuevos.
9. Esperá el estado Ready y abrí la aplicación. Usá Ctrl+Shift+R para evitar caché del navegador.

## 5. Publicar el plano inicial para todos

1. Entrá a Configuración y desbloqueá el Editor del plano con tu PIN local.
2. Arriba aparece el panel de plano compartido. Ingresá allí el mismo valor de `MES_MAP_PIN` que guardaste en Vercel.
3. Si ya aparece el plano correcto, revisalo. Si no aparece, pulsá Importar plano del respaldo y elegí el JSON exportado en el paso 1.
4. Revisá límites, acopios, conos, cajones, edificios y elementos.
5. Pulsá Publicar plano para todos y confirmá.
6. Esperá el mensaje `Guardado para todos · versión 1` o el número siguiente. Si aparece un error, el cambio no se publicó.
7. Abrí la planilla y verificá: `MES_Plano_Actual` debe tener una fila con la revisión y `MES_Plano_Elementos` debe listar todos los objetos.

## 6. Comprobar con otra persona o navegador

1. Abrí la URL de Vercel en una ventana de incógnito o en otro equipo.
2. Entrá a Plano. Debe verse la misma versión publicada y las mismas posiciones, formas, nombres y propiedades.
3. Seleccioná un acopio o cono: la cantidad se toma de `AcopiosPlaya` o `MES_Inventario`.
4. Si alguien publica una nueva versión, las otras vistas se actualizan al volver a la pestaña o dentro de 30 segundos.

## Uso diario

- Para modificar el mapa: desbloqueá el Editor, hacé los cambios, revisá y pulsá Publicar plano para todos.
- Para corregir tierra disponible: usá Conciliación, ingresá el PIN de publicación, responsable y motivo. El ajuste queda registrado en `MES_Ajustes` y actualiza las hojas de inventario.
- No edites manualmente `MES_Plano_Actual`, `MES_Plano_Elementos` ni `MES_Planos`. Publicá desde la aplicación para conservar controles e historial.
- Antes de cargar la versión de otra persona, descargá tu borrador si todavía no lo publicaste. El sistema evita sobrescribir una revisión más nueva.

## Problemas habituales

- `No autorizado`: `MES_SYNC_TOKEN` no coincide entre Vercel y Propiedades del script, o no actualizaste la implementación.
- `PIN de publicación incorrecto`: el valor escrito en el panel no coincide con `MES_MAP_PIN` de Vercel.
- `Actualizá la implementación de Apps Script`: guardá, elegí Nueva versión y actualizá la implementación existente.
- `Conflicto de versión`: otra persona publicó antes. Descargá el borrador, cargá la versión compartida y repetí los cambios sobre ella.
- `Conciliá el stock`: un acopio o cono todavía tiene toneladas. Ajustá o mové el saldo antes de quitarlo o desactivarlo.
