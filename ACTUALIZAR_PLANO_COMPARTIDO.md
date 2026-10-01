# Activar el plano compartido

Este paquete incluye el protocolo de plano compartido y el importador del respaldo. No contiene el respaldo del usuario, PIN ni claves. El archivo original gestion-molienda-2026-10-01.json se conserva en tu computadora y no debe subirse a GitHub.

1. Respaldá el código Apps Script actual. Copiá integrations/Code.gs de este paquete al proyecto que ya usa la aplicación. Conservá MES_SYNC_TOKEN y MES_TELEGRAM_BOT_TOKEN en Propiedades; no cambies sus valores.
2. Guardá. Implementar → Administrar implementaciones → lápiz → Nueva versión → Implementar. Conservá la misma URL /exec. No crees otro proyecto.
3. Actualizá el repositorio existente de GitHub. Los cambios están en App.jsx, components/SharedMapPanel.jsx, lib/shared-map.js, app/api/sheets/route.js. El paquete para Vercel usa runtime nodejs también en weather, history y las rutas antiguas de IA; incorporá la carpeta app/api completa. Las funciones de IA permanecen desactivadas. tests/shared-map.test.mjs incluye comprobaciones del control de versiones.
4. En GitHub podés usar Add file → Upload files desde la raíz del repositorio. Arrastrá los archivos y carpetas DESDE DENTRO de la carpeta extraída (no la carpeta contenedora). Revisá que el resultado sea components/SharedMapPanel.jsx, no otra carpeta/gestion-molienda/components/SharedMapPanel.jsx. Guardá los cambios en main.
5. Esperá el nuevo despliegue Ready en Vercel. Comprobá que corresponde al último commit y abrí https://gestion-molienda-cmp.vercel.app/. MES_SYNC_TOKEN debe seguir configurado. No se necesitan nuevas claves.
6. Abrí Configuración, ingresá tu PIN y entrá a Editor del plano. Arriba debe aparecer un panel con Cargar versión compartida, Publicar plano para todos e Importar solo el plano del respaldo.
7. Si no hay plano compartido, pulsá Importar solo el plano del respaldo y elegí el JSON exportado donde estaba el plano correcto. Se toman límites, sectores, edificios, cajones, conos, elementos y geometría de acopios; no se importan claves, personas ni saldos.
8. Revisá visualmente el plano importado. Pulsá Publicar plano para todos y confirmá la primera publicación. Esperá Guardado para todos · versión 1. Si falla, no lo consideres publicado.
9. En la planilla principal se crea MES_Planos. Cada publicación agrega una fila con revisión, fecha y JSON. No edites sus filas manualmente: son el historial del plano. No borra otras hojas.
10. Abrí Vercel desde otro perfil o equipo autorizado, entrá a Plano de playa y comprobá Plano compartido · versión 1. Las vistas abiertas consultan cada 30 segundos y al recuperar el foco.
11. Para cambios posteriores usá el editor y Publicar plano para todos. Mover un objeto solo modifica el borrador local hasta publicar. Si otro usuario publicó mientras editabas, se bloquea el guardado de una revisión antigua; exportá tu respaldo si querés conservarlo y usá Cargar versión compartida antes de repetir los cambios.

## Límites de esta actualización

Centraliza el plano. No convierte todavía los borradores de planificación/auditoría ni toda la configuración en un sistema multiusuario. Los saldos se siguen consultando mediante la sincronización de inventario ya existente: publicar un dibujo no cambia toneladas. Acopios nuevos del plano necesitan validación del saldo; no deben considerarse inventario disponible solo por aparecer en el dibujo. Acopios quitados del dibujo conservan sus registros de inventario.

El control de revisiones evita sobrescrituras, pero no es un sistema de roles. El PIN es un control local de interfaz; para varios usuarios de producción, Vercel debe tener acceso protegido mientras se implementa autenticación de usuarios y roles en el servidor. No publiques MES_SYNC_TOKEN en GitHub.

Si aparece Actualizá la implementación de Apps Script, repetí el paso 2: guardar el editor no actualiza /exec. Si aparece No autorizado, verificá que MES_SYNC_TOKEN coincida. Si falla la conexión, la vista conserva la copia local y la identifica como Sin sincronizar; no significa que todos estén viendo la misma revisión.
