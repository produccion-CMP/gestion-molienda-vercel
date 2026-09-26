# Gestión Molienda — Cerámica Marcos Paz

Aplicación web para planificar y auditar turnos de molienda, registrar ingresos de tierra, movimientos con palas, paradas, calidad y existencias. La interfaz y el balance están en `App.jsx`; `app/page.tsx` la monta en el sitio.

## Primer uso

1. Los acopios y conos iniciales tienen **toneladas de ejemplo**. En el panel, elegí **Poner stocks en cero** antes de registrar datos reales, o revisá las cantidades y marcá **Ya revisé los datos**. También hay una planificación y recordatorios de ejemplo.
2. En **Plano de Playa**, tocá acopios y conos para ver existencias y propiedades sin alterar datos. El editor está en **Configuración → Editor del plano**, bajo PIN. Allí podés arrastrar acopios, sectores, cajones, conos, batería de silos, nave y vértices; los tiradores modifican tamaños. Los acopios previstos aparecen con borde punteado. Bloqueá el editor al terminar.
3. En **Configuración**, ingresá el PIN para revisar operarios y puestos, palas y capacidad de balde, canteras, sectores, destinos, acciones, propiedades y densidad. Los apellidos y nombres se editan por separado; las propiedades admiten escala 0–3, 0–5 o 0–10, excepto humedad, que conserva H0–H3. PIN local inicial: `1234`. Se puede cambiar por uno de 4 a 12 dígitos. Bloqueá y volvé al panel al terminar.
4. Planificá personal, tareas para uno, dos o tres turnos, recetas y camiones. En el paso 3 elegí destinos, incluidos los nuevos acopios, con ayuda del plano. El paso 4 guarda indicaciones semanales. Auditá una jornada pasada: asistencia confirmada por defecto, horarios reales editables, tareas, viajes, toneladas, calidad, paladas y paradas. El cierre valida rutas y existencias, actualiza el balance una vez y conserva el certificado para imprimir o guardar en PDF.
5. En **Configuración → Respaldo local**, exportá un JSON y guardalo fuera del navegador. La restauración reemplaza el estado local.

## Inventario y límites del balance

La auditoría acredita los viajes confirmados al acopio de destino o al Cajón 2. Cada movimiento convierte paladas a toneladas mediante la capacidad de la pala y la densidad según humedad. El origen de Cajón 2 siempre es el acopio consumido: admite acopio → cono/Cajón 2/Cajón 3, y cono → Cajón 1/Cajón 3/CMP Yerba Buena. Rechaza rutas desconocidas, datos negativos, nombres de acopio repetidos y extracciones mayores al stock. Cajón 3 y Yerba Buena son salidas; Cajón 2 se muestra por separado. **Balance de silos** muestra toneladas, entradas, salidas y evolución entre cierres. El stock directo del inspector es una corrección basada en medición real y queda registrado localmente. El balance conserva toneladas, paladas operativas y trazas de traspasos; «Poner en cero» exige seleccionar un cono receptor y transfiere el remanente sin registrarlo como consumo. Los datos previos sin paladas contabilizadas conservan sus toneladas validadas y muestran cero paladas históricas conocidas, sin reconstrucción ficticia.

Arcilla, arena y limo suman siempre 100%; al ajustar uno, los otros dos se redistribuyen. Los niveles de humedad H0/H1/H2/H3 usan escalones provisionales de 0/10/15/20% de agua sobre masa seca. Para convertir volumen se usa `ρ_húmeda = ρ_nominal_10% × (1 + humedad/100) / 1,10`. La densidad nominal inicial de 1,50 t/m³ implica una densidad seca aproximada de 1,36 t/m³. Es **un modelo orientativo**, no una medición del yacimiento; además, el volumen puede cambiar con compactación. Calibralo con muestras secadas, mediciones de volumen y pesajes. [USDA NRCS](https://www.nrcs.usda.gov/sites/default/files/2022-10/Soil%20Bulk%20Density%20Moisture%20Aeration.pdf) define la densidad aparente y [USDA ARS](https://www.ars.usda.gov/research/publications/publication/?seqNo115=142046) la humedad gravimétrica.

El plano es un **esquema editable**, no un CAD georreferenciado. La superficie de 8.817,24 m² y la referencia vial de 400 m provienen del material proporcionado; los vértices y la escala visual no están calibrados con coordenadas verificadas. El tamaño editado representa la huella esquemática del acopio y no calcula su volumen físico automáticamente.

## Guardado y sincronización

El estado se guarda en `localStorage` **en este navegador** bajo `gestion-molienda-mes-v2`. Incluye mapa, catálogos, inventario, correcciones manuales, plan, borrador de auditoría, reportes y recordatorios. Una instalación anterior que usó `gestion-molienda-v1` se migra parcialmente: se transfieren existencias, elementos del mapa y reportes cerrados; revisá la planificación y exportá también el respaldo anterior. La clave vieja permanece intacta.

### Datos validados y sincronización

La planilla principal **Reportes SG Molienda** se inspeccionó el 24/09/2026. La aplicación inicia con los catálogos de operarios, máquinas, canteras, sectores y acciones de esa fuente y los acopios **Acopio Mezcla 850 t**, **Tosca Seleccionada 320 t** y **Recortes 180 t**. Esta es una copia fechada: al activar el puente se vuelven a leer los valores actuales. Los saldos de los conos no están en la fuente y se muestran pendientes de conciliación, nunca como toneladas disponibles validadas.

El [CSV histórico publicado](https://docs.google.com/spreadsheets/d/e/2PACX-1vTahPDQ0JWVDhx7bb74pxh3wNa3rORRCBIqFqBEiavIiKN6CjlQyAQXF9TLLSkQZp1uC0t62774yPEv/pub?gid=1381238472&single=true&output=csv) se consulta desde el servidor, solo lectura, hasta 10 MB y 100 registros por página. Su disponibilidad depende de que Google permita la descarga pública desde el servidor del sitio. No se asigna consumo total histórico a un cono específico sin una columna que indique el cono de origen.

Para registrar nuevas jornadas **en Google Sheets**:

1. Abrí [Reportes SG Molienda](https://docs.google.com/spreadsheets/d/1hiCNaOYxxEYfpkLci6J0wFBxXuhOyShApOIJTMo6k60/edit?gid=1680149786), creá un proyecto de Apps Script asociado y pegá el contenido de `integrations/Code.gs`.
2. En Apps Script → Configuración del proyecto → Propiedades de la secuencia de comandos, cargá `MES_SYNC_TOKEN` con el mismo valor secreto configurado en el servidor del sitio (en Vercel: Environment Variables). No lo escribas en el código ni en GitHub. El endpoint de salud `?action=health` no muestra inventario.
3. Guardá el código y en Implementar → Administrar implementaciones editá la implementación existente, elegí **Versión nueva** y publicá. Debe ejecutarse con permiso para editar la hoja. Para llamadas del servidor de Vercel, el Web App debe aceptar solicitudes sin sesión Google; el token protege los datos y el sitio debe tener control de acceso. La URL `/exec` suministrada ya está precargada en la app.
   Abrir `/exec` sin token devuelve `{"ok":false,"error":"No autorizado"}` por diseño; verificá que `?action=health` responda con `ok:true` y consultá los datos desde la app, que envía el secreto desde el servidor. Si cambiás la URL de despliegue, actualizá `MES_APPS_SCRIPT_URL` en el servidor y la URL de Configuración.
4. Pulsá **Leer inventario validado**. En el plano, cargá las toneladas realmente medidas de cada cono; luego en **Silos** pulsá **Confirmar saldos medidos en Google Sheets**. Cero también es una medición que debe confirmarse. El puente registra la línea de base en `MES_Ajustes` y `MES_Inventario`.
5. Cerrá una jornada auditada. La planilla conserva el evento único por ID en `MES_Auditorias`, escribe filas con ID de cierre en `Turnos`, `Personal`, `Movimientos`, `Paradas`, `CalidadTierra`, `Tareas` y `BalanceSilos`, y actualiza `AcopiosPlaya` y `MES_Inventario`. Los reintentos de la última revisión reparan proyecciones parciales. Un cambio concurrente del inventario detiene la sincronización y pide conciliación.
6. En **Datos validados** se ven los operarios y las máquinas de la planilla; **Conciliación** compara la medición con el saldo remoto y guarda el ajuste, responsable y motivo en `MES_Ajustes`. La pestaña `Turnos` estaba vacía el 25/09/2026; se poblará al registrar cierres.
7. La actualización del 25/09/2026 agregó sin borrar filas `Cat_Destinatarios`, `MES_Informes`, `MES_Indicaciones`, `MES_TransferenciasConos`, `Tareas` y `BalanceSilos`; incorporó `paladasOperativas` en `MES_Inventario` y validaciones nativas de estado, humedad, cantidades y asistencia. Publicá una versión nueva de Apps Script para que el PDF y la conciliación usen este esquema. El cierre confirmado genera el PDF en Drive; el botón de correo envía el adjunto solo cuando un usuario lo pulsa. Apps Script necesitará autorización para Docs, Drive y MailApp. Antes del primer envío, agregá los destinatarios en Configuración → Informes por correo.

El cliente llama al puente del sitio `/api/sheets`, que a su vez consulta Apps Script. Cada cierre envía este cuerpo al Web App:

```json
{"action":"saveAudit","schema":2,"id":"identificador-estable","expectedEtag":"hash-del-inventario-validado","data":{"Turnos":[],"Personal":[],"Movimientos":[],"Paradas":[],"Tareas":[],"CalidadTierra":[],"AcopiosPlaya":[],"BalanceSilos":[]},"stock":{"acopios":[],"conos":[],"cajon2":0}}
```

El servicio responde JSON `{"ok":true,"revision":1,"etag":"..."}`. El cierre pendiente puede reintentarse con el mismo ID; un cambio remoto de inventario bloquea una sobrescritura y pide conciliación. La escritura del evento es única por ID y la hoja de inventario es una proyección. Las fotos adjuntas se conservan en este navegador, pero el JSON de Sheets solo registra si existen. No hay sincronización entre dispositivos hasta desplegar y configurar el Web App. Su URL es sensible y el PIN local no sustituye autenticación ni control de accesos.

## Clima y acceso

El pronóstico de **hasta siete días** usa [MET Norway Locationforecast](https://api.met.no/weatherapi/locationforecast/2.0/documentation) para las coordenadas de la playa (-26.789032, -65.255817). Se consulta en el servidor sin clave y se muestra su atribución CC BY 4.0. Temperatura, humedad, viento y probabilidad de lluvia proceden del modelo; los milímetros diarios solo se suman cuando hay suficientes intervalos horarios completos. Si la fuente no responde se muestra el error, nunca un pronóstico inventado.

La vista **Clima** abre con la planificación orientativa y un desglose horario de hoy. Muestra máximas, mínimas y probabilidad de lluvia con MET Norway sin clave. Usa probabilidades de intervalos de una, seis o doce horas cuando estén publicadas; para Cevil Pozo puede no haber porcentajes en el pronóstico global, y en ese caso muestra «sin dato» sin estimarlos desde el símbolo. Los símbolos aparecen como descripciones en español y emojis. AccuWeather y The Weather Channel están disponibles mediante enlaces que abren sus sitios en otra pestaña; la aplicación no extrae contenido de esas páginas ni requiere sus claves. El PIN local restringe la interfaz, pero no sustituye autenticación del servidor ni permisos de Google.

**Indicaciones adicionales** admite corrección y categorización por IA bajo acción explícita: requiere `OPENAI_API_KEY` como secreto del servidor; el texto original se conserva y cada acción detectada queda pendiente de validación. **Ayuda y mejoras** explica los módulos y, con la misma clave, responde consultas y propone navegar o preparar un recordatorio. El usuario revisa la propuesta antes de registrar. Los comentarios de mejora y enseñanzas se guardan solo en el navegador; las últimas enseñanzas pueden aportar contexto a consultas posteriores, pero no entrenan el modelo ni validan hechos. Sin clave, la guía escrita y el registro manual siguen disponibles.

El **Pizarrón** permite asignar fecha y hora, ver avisos en un calendario y conservar el momento en que se marcó cada tarea como realizada. Las notificaciones requieren permiso del navegador y que la aplicación permanezca abierta a la hora programada; no son alarmas del servidor ni avisos garantizados con la pestaña cerrada.

### Avisos por Telegram

La planilla incorpora `Cat_Telegram`, `MES_Recordatorios` y `MES_TelegramEnvios`. Los recordatorios nuevos se guardan en Sheets cuando el puente está conectado; los guardados solo en el navegador se identifican como tales y no se envían por Telegram. Un destinatario necesita **chat ID numérico**, además de un teléfono opcional para identificarlo. Debe iniciar una conversación con el bot o agregarlo a un grupo antes de que el bot pueda enviarle mensajes; el teléfono solo no alcanza.

1. Creá un bot mediante BotFather y guardá el token exclusivamente en Propiedades de la secuencia de comandos de Apps Script como `MES_TELEGRAM_BOT_TOKEN`.
2. Actualizá la implementación existente con `integrations/Code.gs` y autorizá `UrlFetchApp` y disparadores. En el editor de Apps Script ejecutá una vez `instalarAvisosTelegram`. Instala, de forma idempotente, un disparador cada cinco minutos.
3. En **Configuración → Avisos Telegram**, registrá nombre, teléfono, chat ID y destino. Solo los recordatorios con fecha y hora sincronizados y destinatarios activos se envían. Consultá `MES_TelegramEnvios` para ver entregas o estados que requieren revisión. No se reintentan automáticamente los envíos inciertos para evitar duplicados.

Si aparece **«Sin conexión»** junto con `Unexpected token '<'`, alguna respuesta fue HTML en lugar del JSON esperado. La interfaz ahora presenta una indicación concreta; verificá `?action=health` en la implementación, republicá una versión nueva de Apps Script y revisá `MES_SYNC_TOKEN` en Apps Script y el servidor. Abrir `/exec` sin token sigue mostrando «No autorizado» por diseño.

El panel principal abre directamente el estado de playa y silos, con accesos a la planificación, el plano, el balance y la auditoría. El diseño usa tonos de pizarra, arcilla y verde industrial; las transiciones de controles son breves y se respetan las preferencias de movimiento reducido.

## Desarrollo

`npm test` prueba composición, densidad, balance, rutas, normalización meteorológica y el proxy. `npm run build` compila el sitio. Las vistas anteriores siguen en `App.jsx`.
