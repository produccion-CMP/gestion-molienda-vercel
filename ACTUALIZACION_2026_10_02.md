# Actualización operativa — 2 de octubre de 2026

## Interfaz e histórico productivo

- El panel de **Indicadores** diferencia inventario actual, cierres auditados e histórico productivo. Muestra toneladas molidas y consumidas hoy, en el mes y en el año, además de la carga a silo por turno.
- El histórico usa el CSV publicado como respaldo de lectura si Apps Script no responde. Solo permite consulta; no altera registros productivos.
- Se muestran los campos operativos relevantes: fecha, turno, supervisor, novedades de molienda/silo, equipo, producción, tiempo de silo, toneladas a silo, cono cargado y balanza de producción.
- Se reforzaron contrastes claro/oscuro, jerarquía visual, tarjetas, barras y acciones principales con una paleta sobria de tierra, acero y verde operacional.
- La configuración se nombra por función: personal, equipos, orígenes, rutas, calidad, plano, comunicaciones, informes y sistema/seguridad.
- Los avisos técnicos de migración y conciliación ya no ocupan la portada; se muestran en el módulo que permite resolverlos.

## Sincronización cooperativa obligatoria

- Google Sheets pasa a ser la fuente compartida para el estado operativo. La aplicación consulta el estado al abrir, cada 30 segundos, al volver a la pestaña y al recuperar conexión.
- La planificación se actualiza por número de revisión. Una versión guardada por otro dispositivo reemplaza la copia local cuando es más nueva; un borrador sin publicar del usuario actual no se sobrescribe silenciosamente.
- Los recordatorios se cargan de forma autoritativa desde la planilla para que altas, cambios de estado y finalizaciones sean iguales en todos los equipos.
- Los últimos cierres confirmados devuelven sus datos operativos, balance de conos e inventario posterior. Así cualquier usuario puede abrir indicadores, balances e informes de cierres realizados por otra persona.
- El plano y el inventario consolidan conos por ID y nombre. Si quedó una duplicación de una configuración vieja, se conserva la definición más reciente publicada y los duplicados dejan de mostrarse.
- En el Pizarrón una tarea pendiente se puede posponer con nueva fecha y hora; el cambio se comparte con todos y se vuelve a programar para Telegram cuando tiene horario.

Después de publicar esta versión es obligatorio reemplazar `integrations/Code.gs`, crear una nueva implementación de Apps Script y reemplazar `App.jsx` en GitHub. Si no se actualiza Apps Script, la aplicación anterior seguirá devolviendo solo resúmenes y no podrá compartir los cierres completos.

## Qué corrige

- Auditoría disponible para cualquier jornada del plan hasta el día actual, incluso desde el acceso directo `Auditoría`.
- Los conos visibles se toman únicamente del plano central publicado. Los IDs antiguos de inventario dejan de mostrarse.
- `MES_Inventario` incorpora `calidadJSON` para conservar la calidad promedio trasladada desde los acopios a cada cono.
- El histórico muestra las columnas operativas de silo y producción y permite abrir cada fila en detalle.
- La fecha y hora de los recordatorios se muestran en formato corto.
- Se agrega el menú `Indicadores` con existencias, ingresos, consumo y tendencia por cierres.

## Pasos de publicación

1. En Apps Script, reemplazá completamente `Code.gs` con `integrations/Code.gs` de esta versión.
2. Guardá y ejecutá `crearEstructuraHojas` una sola vez. No borra registros; agrega el encabezado `calidadJSON` si falta.
3. Elegí Implementar → Administrar implementaciones → lápiz → Nueva versión → Implementar.
4. En GitHub reemplazá `App.jsx`, `lib/shared-map.js`, `integrations/Code.gs` y este archivo de guía. Confirmá el commit en `main`.
5. Esperá el despliegue automático de Vercel o usá Redeploy.
6. Abrí la aplicación y actualizá la página con Ctrl+F5.

## Conos duplicados existentes

La planilla actual contiene cuatro IDs antiguos (`cono-1`, `cono-2`, `cono-3`, `cono-intermedio`) y cuatro IDs del plano vigente. La nueva lógica ignora los antiguos; también descarta nombres de cono repetidos y, al siguiente guardado válido del plano o cierre de auditoría, reescribe `MES_Inventario` con los conos publicados.

No borres filas manualmente antes de publicar esta actualización. Si necesitás conservar una foto del estado actual, descargá primero la hoja `MES_Inventario` como Excel.

## Hojas técnicas ocultas

Se ocultaron `Maestros` (vacía), `MES_Plano_Elementos`, `MES_Planos`, `MES_Planificacion_Detalle` y `MES_TelegramEnvios`. Esto no borra nada. Para mostrarlas de nuevo podés ejecutar `mostrarHojasTecnicas` desde Apps Script.
