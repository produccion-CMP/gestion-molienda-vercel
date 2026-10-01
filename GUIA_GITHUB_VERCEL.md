# Gestión Molienda: Telegram y publicación en Vercel

Versión del 30/09/2026. Sin funciones de IA. Las rutas antiguas de IA responden «desactivada» y no llaman a proveedores. Conserva guía manual, comentarios y datos anteriores.

## 1. Qué está preparado y qué requiere tu cuenta

Este paquete contiene el código web para Next.js y `integrations/Code.gs` para Apps Script. Telegram registra solicitudes de alta con /start en chats privados, las deja INACTIVAS y envía recordatorios a destinatarios aprobados. No interpreta conversaciones ni consulta todavía las planillas de producción y moldes. No se han instalado disparadores en tu cuenta ni probado mensajes reales: hace falta cargar el token y autorizar Google. No pegues tokens en GitHub ni en chats.

Vercel Hobby permite uso personal no comercial. Para la aplicación de la fábrica elegí un plan comercial (Pro), comprobando su precio antes de contratar. Quitar IA elimina el costo del proveedor de IA, no el alojamiento.

## 2. Preparar Telegram

1. Abrí Telegram y buscá el BotFather oficial. Si ya tenés un bot EXCLUSIVO para Molienda, escribí /mybots, elegilo y abrí API Token. Si ese bot lo usa otro sistema, creá uno nuevo con /newbot: elegí un nombre visible y un usuario terminado en bot. No desconectes un bot de otro proyecto.
2. Copiá el token de forma privada. Guardá también el @usuario público del bot.
3. Abrí la planilla principal Reportes SG Molienda. Elegí Extensiones → Apps Script. Usá el proyecto correspondiente a la URL /exec configurada en la aplicación. Si no coincide, abrí el proyecto que contiene esa implementación desde script.google.com.
4. Hacé un respaldo del código anterior en un archivo local antes de reemplazarlo. No borres la planilla ni sus datos. Abrí `integrations/Code.gs` del ZIP en VS Code, copiá todo y reemplazá el código de esa implementación. Si hay otras automatizaciones propias dentro del mismo archivo, compará y conservá esas funciones; no dupliques doGet, doPost ni las constantes MES.
5. Guardá con Ctrl+S. En Configuración del proyecto (engranaje), buscá Propiedades de la secuencia de comandos → Agregar propiedad. Nombre: MES_TELEGRAM_BOT_TOKEN. Valor: el token de BotFather. Guardá.
6. Volvé al Editor. En la lista de funciones superior elegí verificarTelegram y pulsá Ejecutar. Google pedirá autorización la primera vez: revisá los permisos y usá la cuenta que tiene acceso a la planilla. El registro de ejecución debe mostrar «Bot verificado: @...». Si Google bloquea el acceso por una política de la empresa, consultá al administrador; no intentes eludirla.
7. Ejecutá prepararClaveSincronizacion. Si no existe MES_SYNC_TOKEN, crea una clave aleatoria; si ya existe, la conserva. Volvé a Propiedades del proyecto y copiá su valor para usarlo luego en Vercel. MES_SYNC_TOKEN y MES_TELEGRAM_BOT_TOKEN son claves distintas.
8. Ejecutá crearEstructuraHojas para preparar las hojas faltantes sin borrar registros existentes.
9. Ejecutá instalarRegistroTelegram. Verifica el bot y crea un disparador de cinco minutos. Si avisa que hay un webhook activo, detenete: el bot ya está conectado a otro receptor. Usá un bot exclusivo o revisá esa conexión antes de continuar.
10. Abrí una conversación privada con tu bot desde Telegram y pulsá Iniciar o escribí /start. No hace falta compartir el teléfono.
11. Ejecutá registrarUsuariosTelegram para probar inmediatamente; después lo hará el disparador. Abrí la hoja Cat_Telegram. Debe aparecer tu chatId, el nombre de Telegram, destino PENDIENTE y estado INACTIVO. Repetir /start no debe duplicarte ni reactivar una baja. El bot no envía confirmación conversacional en esta versión.
12. Verificá personalmente quién es el solicitante. Reemplazá destino PENDIENTE por el nombre exacto usado en los avisos (por ejemplo Turno 2 (Mañana)) y el estado por ACTIVO. También podés hacerlo desde Configuración → Avisos Telegram: usá el mismo chat ID y guardá el destinatario con el destino correcto. La opción Todos para un destinatario significa que recibe TODOS los avisos: reservála para quien realmente deba recibirlos.
13. Ejecutá instalarAvisosTelegram para crear el segundo disparador de cinco minutos. En el icono de reloj de Apps Script deben figurar registrarUsuariosTelegram y mesProcesarAvisosTelegram. Ejecutar los instaladores otra vez no duplica esos disparadores.
14. Para pausar Telegram, eliminá esos disparadores desde el reloj. Desactivar un destinatario evita sus envíos, pero no detiene el resto.

## 3. Actualizar la implementación de Apps Script

1. En Apps Script elegí Implementar → Administrar implementaciones.
2. Seleccioná la aplicación web existente y pulsá el lápiz. En Versión, elegí Nueva versión. Añadí una descripción, por ejemplo «Sin IA y registro Telegram».
3. La ejecución debe hacerse con la cuenta autorizada que administra la planilla.
4. El servidor de Vercel no tiene tu sesión de Google. Para el puente actual, la URL debe ser accesible por el servidor sin iniciar sesión de Google; la aplicación valida MES_SYNC_TOKEN. Esto generalmente requiere «Cualquier usuario» en el acceso de la implementación. Si la política de tu organización no permite ese acceso, no lo fuerces: hace falta adaptar la autenticación antes de conectar Vercel.
5. Pulsá Implementar y conservá la URL terminada en /exec. Actualizar una implementación existente mantiene su URL. No uses la URL /dev.
6. Abrir /exec en el navegador sin token puede mostrar «No autorizado»: es esperado. La prueba válida es desde la aplicación con MES_SYNC_TOKEN configurado.

## 4. Preparar el repositorio que YA existe

1. Descargá y descomprimí este ZIP. No subas el ZIP como archivo al repositorio.
2. Abrí VS Code → Archivo → Abrir carpeta y elegí la carpeta local que ya está vinculada a tu repositorio. Si no la tenés: Ctrl+Shift+P → Git: Clone, pegá la URL de TU repositorio, elegí carpeta y abrila.
3. Antes de copiar, guardá tus cambios y sincronizá lo que ya exista en GitHub. Conservá un respaldo. No inicialices otro repositorio ni borres su carpeta .git.
4. Incorporá esta versión en esa carpeta. Si tu repositorio procede del paquete anterior de esta conversación, las actualizaciones funcionales son App.jsx, app/api/assistant/route.js, app/api/organize-note/route.js e integrations/Code.gs; copiá también .env.example y esta guía. Conservá los cambios anteriores del clima: lib/weather-locations.js y app/api/weather/route.js. Si hay modificaciones tuyas, revisá las diferencias antes de sobrescribir.
5. Comprobá que package.json esté en la raíz del proyecto y que su script build diga next build. No uses el proyecto de Sites con vinext ni una salida estática: necesitamos las rutas /api para Sheets y clima.
6. Para probar localmente, instalá Node.js 22.13 o superior, versión LTS compatible. Reiniciá VS Code y abrí Terminal → Nueva terminal. Ejecutá node --version. Si no reconoce node, revisá la instalación y reiniciá la terminal.
7. Ejecutá npm install -g pnpm@10. Si PowerShell bloquea archivos .ps1, elegí Command Prompt desde el menú de la terminal o ejecutá pnpm.cmd; no hace falta desactivar políticas de seguridad.
8. Ejecutá pnpm install --frozen-lockfile, luego pnpm test y luego pnpm build. Si hay error, copiá el primer error real; no borres el lockfile para ocultarlo. Podés hacer el primer build directamente en Vercel si no querés instalar herramientas locales, pero revisá sus logs.
9. Para probar en tu PC: creá .env.local junto a package.json con MES_SYNC_TOKEN= seguido de la misma clave de Apps Script. Este archivo debe quedar excluido de Git por .gitignore. Ejecutá pnpm dev y abrí http://localhost:3000. Ctrl+C detiene el servidor.
10. Abrí Control de código fuente con Ctrl+Shift+G. Revisá las diferencias. No deben subirse .env.local, tokens, node_modules, .next ni respaldos de datos de planta.
11. Prepará los archivos con + (Stage). Escribí «Quitar IA y preparar Telegram» y pulsá Commit. Si Git pide identidad, configurá tu nombre/correo y repetí. Después pulsá Sync Changes o Push y autorizá GitHub si corresponde.
12. Abrí el repositorio en GitHub y comprobá el commit, App.jsx, package.json y la carpeta app. Un repositorio que contiene únicamente el ZIP no está listo para importar.

## 5. Crear el proyecto en Vercel

1. Entrá a https://vercel.com/new e iniciá sesión con Continue with GitHub.
2. Elegí la cuenta/equipo y un plan apto para uso comercial. Revisá los costos y límites antes de contratar.
3. En Import Git Repository buscá tu repositorio y pulsá Import. Si no aparece, usá Configure GitHub App/Adjust GitHub App Permissions para otorgar acceso únicamente al repositorio correspondiente; luego volvé a la lista.
4. En Project Name elegí un nombre, por ejemplo gestion-molienda-cmp.
5. Framework Preset: Next.js. Root Directory: ./ si allí está package.json; si está dentro de una subcarpeta, elegí ESA carpeta.
6. Dejá Build Command y Output Directory en sus valores automáticos. El build debe ejecutar next build; no uses dist ni output: export. Dejá que Vercel detecte pnpm mediante el lockfile.
7. En Environment Variables agregá MES_SYNC_TOKEN y pegá exactamente el valor de Apps Script. Seleccioná Production. Para Preview usá preferentemente una base de prueba: no copies permisos de producción a una vista de pruebas sin querer.
8. No agregues OPENAI_API_KEY: ya no se usa. El token del bot queda solamente en Apps Script; Vercel no lo necesita.
9. Pulsá Deploy. Esperá hasta que el estado sea Ready. Si falla, abrí Build Logs y copiá el primer error, no solo el mensaje final «Build failed».
10. Al terminar, pulsá Visit y guardá el enlace .vercel.app. Ese es el sitio de Vercel; el sitio chatgpt.site continúa siendo otra publicación independiente.
11. Revisá la rama de producción en Settings → Git (habitualmente main). Los siguientes Push a esa rama deben iniciar nuevos despliegues.
12. Si agregás o cambiás MES_SYNC_TOKEN después de publicar: guardá la variable, abrí Deployments → menú del último despliegue → Redeploy. Cambiar una variable no modifica un despliegue ya existente.
13. Antes de cargar datos reales, configurá Deployment Protection para limitar el acceso a las personas de la fábrica que correspondan y verificá que cubra producción. El PIN local de Configuración no reemplaza autenticación del servidor. Si la protección disponible no cubre a tus supervisores, hace falta autenticación propia antes de uso compartido. El proxy actual a Sheets posee una clave de servidor y no valida roles individuales.

## 6. Prueba completa

1. Abrí la URL de Vercel. Verificá que en Ayuda haya guía manual y no aparezca el botón de IA en Planificación.
2. Revisá la conexión a Sheets y los datos validados. Si aparece No autorizado, compará MES_SYNC_TOKEN en ambos sitios y verificá la nueva implementación de Apps Script. Si aparece HTML en vez de JSON, revisá /exec y su acceso desde el servidor.
3. Los borradores y planos locales pertenecen a cada navegador y dominio. Exportá un respaldo desde el sitio anterior e importalo en el nuevo si necesitás conservarlos; no supongas que GitHub traslada esos datos.
4. Aprobá solo tu propio destinatario de Telegram para la prueba. En Pizarrón creá un aviso dirigido a vos, con fecha de hoy y hora unos diez minutos posterior, en hora argentina. Confirmá que aparezca sincronizado y que la fila exista en MES_Recordatorios. Un aviso «Solo en este navegador» no lo recibirá Telegram.
5. Esperá el horario y el siguiente disparador (hasta unos cinco minutos adicionales; Google puede demorar su ejecución). Revisá Telegram y MES_TelegramEnvios. ENVIADO indica entrega aceptada por la API; REVISAR requiere leer el detalle. Una demora o error de Google/Telegram no debe interpretarse como confirmación de recepción humana.
6. Comprobá que la nota se pueda marcar realizada. Después aprobá a los demás supervisores, cada uno identificado por su chat ID y destino. No hay IA ni lectura automática de las planillas de moldes/producción en esta versión.

## Errores frecuentes

- Falta MES_SYNC_TOKEN: agregar secreto a Vercel y redesplegar.
- No autorizado: las claves difieren o la implementación /exec no se actualizó.
- Telegram 401: token inválido o revocado; corregirlo en Apps Script.
- Telegram 403: el usuario bloqueó el bot o no hay acceso al chat.
- No aparece el alta: escribir /start en privado, revisar ejecución registrarUsuariosTelegram, webhook existente y permisos.
- Aparece INACTIVO: es correcto hasta la aprobación del supervisor administrador.
- No llega aviso: revisar ACTIVO, destino exacto, fecha/hora, estado PENDIENTE en Sheets y disparador instalado.
- Se ve una versión vieja: comprobar último commit de GitHub, rama de producción, estado Ready y dominio abierto.

## Fuentes oficiales consultadas

https://core.telegram.org/bots/api
https://developers.google.com/apps-script/guides/web
https://developers.google.com/apps-script/guides/properties
https://vercel.com/docs/git
https://vercel.com/docs/environment-variables/managing-environment-variables
https://vercel.com/docs/plans/hobby
