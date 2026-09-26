# Publicar Gestión Molienda con VS Code, GitHub y Vercel

Esta carpeta está preparada para **Next.js en Vercel**. No subas el archivo ZIP a GitHub: primero descomprimilo y publicá la carpeta que contiene `package.json`.

## 1. Preparar la computadora

Instalá [Visual Studio Code](https://code.visualstudio.com/), [Git](https://git-scm.com/downloads) y [Node.js 22](https://nodejs.org/). Cerrá y volvé a abrir VS Code después de instalarlos. En la terminal integrada (**Terminal → New Terminal**) comprobá:

```powershell
node --version
git --version
```

Node debe ser al menos 22.13. Instalá pnpm compatible con el lockfile y con Vercel:

```powershell
npm install -g pnpm@10
pnpm --version
```

Si Windows bloquea la instalación global, ejecutá la terminal con permisos adecuados o instalá pnpm con Corepack; no hace falta modificar el código.

## 2. Abrir y probar el proyecto

1. Descomprimí el ZIP en una carpeta normal de tu PC, por ejemplo `Documentos\gestion-molienda-vercel`.
2. En VS Code elegí **File → Open Folder** y seleccioná esa carpeta. En el explorador debe verse `package.json` en la raíz.
3. En la terminal de VS Code ejecutá:

```powershell
pnpm install --frozen-lockfile
pnpm test
pnpm build
pnpm dev
```

Abrí `http://localhost:3000`. Para detener el servidor usá **Ctrl+C**. El clima de MET Norway no necesita clave. La lectura del CSV y del clima sí necesita conexión a Internet. Los saldos locales del navegador de la instalación anterior no se transfieren automáticamente a esta URL; exportá e importá un respaldo desde Configuración si necesitás conservarlos.

## 3. Publicar el código en GitHub desde VS Code

1. Iniciá sesión en GitHub desde VS Code cuando te lo solicite.
2. Abrí **Source Control** con **Ctrl+Shift+G** y pulsá **Initialize Repository**.
3. Revisá la lista de archivos. Confirmá que **no** figuren `node_modules`, `.next`, `.env.local`, contraseñas, claves API ni respaldos de datos reales.
4. Escribí un mensaje como `Versión inicial de Gestión Molienda` y pulsá **Commit**.
5. Pulsá **Publish Branch** o **Publish to GitHub**, elegí **Private repository** y aceptá la autorización de GitHub. Copiá la URL del repositorio creado.

Si VS Code te pide identidad para el commit, configurá en la terminal `git config --global user.name "Tu nombre"` y `git config --global user.email "tu-correo-de-GitHub"`, y repetí el commit. No crees otro repositorio con README desde GitHub antes de usar **Publish to GitHub**: VS Code lo creará desde esta carpeta.

## 4. Importar el repositorio en Vercel

1. Entrá a [Vercel → New Project](https://vercel.com/new), conectá tu cuenta de GitHub y elegí el repositorio privado.
2. Comprobá **Framework Preset: Next.js** y **Root Directory: `./`**.
3. Dejá el **Build Command** en el valor automático (`pnpm build`, que ejecuta `next build`) y **Output Directory** sin sobrescribir. No uses `vinext build` ni la carpeta `dist` del alojamiento anterior.
4. Elegí Node.js 22 en la configuración del proyecto si Vercel no lo detecta desde `package.json`.
5. En **Environment Variables**, antes de registrar datos reales, agregá `MES_SYNC_TOKEN` como variable secreta con el mismo valor que en Propiedades de la secuencia de comandos de Apps Script. MET Norway muestra máximas, mínimas y probabilidad de lluvia sin clave. AccuWeather y The Weather Channel se abren mediante enlaces externos. Para habilitar la corrección de indicaciones y el asistente, agregá `OPENAI_API_KEY` como secreto del servidor; sin esa clave, la guía y los formularios manuales siguen disponibles. Nunca publiques claves en GitHub.
6. Pulsá **Deploy** y revisá el resultado. Cada nuevo **Push** a GitHub generará otro despliegue.

### Datos y acceso de planta

- Un repositorio **privado** protege el código, pero **no** vuelve privado el sitio publicado. Antes de usarlo con datos reales, configurá **Deployment Protection** o una autenticación apropiada en Vercel. El PIN de Configuración es local y no protege el servidor.
- El guardado en Google Sheets requiere reemplazar el código viejo por `integrations/Code.gs` en el proyecto Apps Script de la planilla, agregar `MES_SYNC_TOKEN` en **Configuración del proyecto → Propiedades de la secuencia de comandos** y actualizar **la implementación existente con una versión nueva**. Autorizá los permisos de Sheets, Docs, Drive y MailApp. La URL `/exec` suministrada ya está precargada en la aplicación; si Google responde HTML con «No se encontró doGet», la versión publicada todavía no se actualizó. GitHub y Vercel no hacen ese paso automáticamente. Limitá el acceso del Web App a usuarios autorizados de la fábrica.
- En Configuración → Informes por correo agregá los destinatarios. Al cerrar la auditoría se genera el PDF en Drive y se registra su enlace en `MES_Informes`; el envío por correo requiere pulsar el botón de envío de forma explícita.
- La planilla histórica publicada se lee como CSV. Si Google impide la descarga al servidor, la pantalla Histórico mostrará el error. No uses el histórico para descontar de un cono sin conocer el cono de origen.
- `localStorage` y los respaldos son propios de cada navegador y origen. No hay una base multiusuario central para planos y borradores; los cierres se sincronizan con Google Sheets solo después de configurar Apps Script.
- El PIN de Configuración también desbloquea la edición del plano en esta sesión. Es una barrera local de interfaz, no autenticación resistente a usuarios con acceso al navegador. El Pizarrón registra tareas realizadas y programa avisos; para ver notificaciones hay que conceder permiso y mantener abierta la aplicación a la hora indicada.
- El plano tiene una vista de consulta y un editor separado en **Configuración → Editor del plano**. El correo y Telegram dependen de actualizar Apps Script a esta versión. Para Telegram, creá un bot, guardá `MES_TELEGRAM_BOT_TOKEN` solo en sus Propiedades, ejecutá `instalarAvisosTelegram` una vez en el editor de Apps Script y autorizá el disparador y `UrlFetchApp`. En Configuración registrá el chat ID de quien inició el chat con el bot; el teléfono solo no permite enviar. Los recordatorios guardados únicamente en el navegador no llegan a Telegram.

## 5. Actualizar después

Editá en VS Code, probá `pnpm test` y `pnpm build`, guardá, hacé **Commit** en Source Control y luego **Sync Changes** o **Push**. Vercel tomará el cambio del repositorio conectado.

Si un despliegue falla, abrí **Vercel → Deployments → Build Logs** y copiá el primer error; con ese texto se puede corregir la causa concreta.
