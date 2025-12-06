# DeployBot 🤖

Bot de Discord para monitorear repositorios Git, hacer builds y deployments automáticos, y notificar en canales de Discord.

## 🚀 Características

- ✅ Monitoreo de múltiples repositorios (GitHub/GitLab)
- ✅ Configuración desde Discord mediante comandos slash
- ✅ Build y deploy automáticos cuando se hace push a ramas configuradas
- ✅ Notificaciones en canales de Discord personalizados por rama
- ✅ Historial de deployments en base de datos
- ✅ Soporte para comandos de build y deploy personalizados

## 📋 Requisitos Previos

- Node.js v20 o superior
- PostgreSQL
- Bot de Discord con permisos adecuados
- Acceso a los repositorios Git que quieres monitorear

## 🔧 Instalación

1. **Clonar e instalar dependencias:**
```bash
npm install
```

2. **Configurar variables de entorno:**
Crea un archivo `.env` basado en `.env.example`:

```env
# Discord Bot Configuration
DISCORD_BOT_TOKEN=tu_token_del_bot
DISCORD_CLIENT_ID=tu_client_id
DISCORD_GUILD_ID=tu_server_id

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/deploy_bot

# Server
PORT=3000
WEBHOOK_SECRET=tu_secreto_para_webhooks  # Genera uno con: openssl rand -hex 32

# Build & Deploy
DEPLOY_BASE_PATH=/tmp/deployments

# Git Authentication (opcional, para repositorios privados)
GITHUB_TOKEN=tu_token_de_github  # Token de acceso personal de GitHub
GITLAB_TOKEN=tu_token_de_gitlab  # Token de acceso personal de GitLab
```

3. **Configurar base de datos:**
```bash
npx prisma migrate dev
```

4. **Generar cliente de Prisma:**
```bash
npx prisma generate
```

## 🎮 Configuración del Bot de Discord

### 1. Crear un Bot en Discord

1. Ve a [Discord Developer Portal](https://discord.com/tdevelopers/applications)
2. Crea una nueva aplicación
3. Ve a la sección "Bot" y crea un bot
4. **Habilita los Privileged Gateway Intents:**
   - En la sección "Privileged Gateway Intents", habilita:
     - ✅ **SERVER MEMBERS INTENT** (opcional, solo si necesitas información de miembros)
   - **Nota:** El bot solo necesita el intent `GUILDS` que está habilitado por defecto
5. Copia el **Token** (DISCORD_BOT_TOKEN)
6. Ve a "OAuth2" > "URL Generator"
   - Selecciona `bot` y `applications.commands` en scopes
   - Selecciona los permisos necesarios:
     - ✅ **Send Messages** (Enviar mensajes)
     - ✅ **Embed Links** (Insertar enlaces)
     - ✅ **Read Message History** (Leer historial de mensajes)
     - ✅ **Use Slash Commands** (Usar comandos slash)
     - ✅ **View Channels** (Ver canales) - importante para acceder a los canales
   - **Importante:** Asegúrate de marcar todos estos permisos antes de generar la URL
7. Copia el **Client ID** (DISCORD_CLIENT_ID)
8. **Invita el bot a tu servidor:**
   - Copia la URL generada al final de la página
   - Pégala en tu navegador y selecciona el servidor donde quieres agregar el bot
   - **Verifica que todos los permisos estén marcados** antes de autorizar
   - Haz clic en "Autorizar" y completa el captcha si aparece

### 1.1. Verificar permisos del bot después de invitarlo

1. En Discord, ve a tu servidor
2. Ve a **Configuración del servidor** > **Roles**
3. Busca el rol del bot (debería tener el mismo nombre que tu bot)
4. Verifica que tenga estos permisos habilitados:
   - ✅ **Ver canales** (View Channels)
   - ✅ **Enviar mensajes** (Send Messages)
   - ✅ **Insertar enlaces** (Embed Links)
   - ✅ **Leer historial de mensajes** (Read Message History)
5. **Importante:** Asegúrate de que el rol del bot esté **por encima** de otros roles que puedan bloquear permisos
6. Si necesitas cambiar permisos:
   - Edita el rol del bot
   - Marca/desmarca los permisos necesarios
   - **Guarda los cambios** (botón "Guardar cambios" al final)

### 2. Obtener el Guild ID

1. En Discord, activa el "Modo Desarrollador" (Configuración > Avanzado > Modo Desarrollador)
2. Click derecho en tu servidor > "Copiar ID" (DISCORD_GUILD_ID)

## 🔗 Configurar Webhooks de Git

### Generar WEBHOOK_SECRET

Antes de configurar los webhooks, genera un secreto seguro:

```bash
# Opción 1: Usando OpenSSL (recomendado)
openssl rand -hex 32

# Opción 2: Usando Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Opción 3: Usando Python
python3 -c "import secrets; print(secrets.token_hex(32))"
```

Copia el valor generado y úsalo tanto en tu archivo `.env` como en la configuración del webhook.

### GitHub

1. Ve a tu repositorio > Settings > Webhooks
2. Click en "Add webhook"
3. **Payload URL:** `https://tu-dominio.com/webhook/github`
4. **Content type:** `application/json`
5. **Secret:** Pega el mismo valor que configuraste en `WEBHOOK_SECRET` (recomendado para seguridad)
6. **Events:** Selecciona "Let me select individual events" y marca:
   - ✅ Push events (para deployments)
   - ✅ Pull requests (para notificaciones de PRs)
7. Guarda el webhook

### GitLab

1. Ve a tu proyecto > Settings > Webhooks
2. **URL:** `https://tu-dominio.com/webhook/gitlab`
3. **Secret token:** Pega el mismo valor que configuraste en `WEBHOOK_SECRET` (recomendado para seguridad)
4. **Trigger:** Selecciona:
   - ✅ Push events (para deployments)
   - ✅ Merge request events (para notificaciones de PRs)
5. Guarda el webhook

## 📖 Uso

### Comandos de Discord

#### `/add-repo`
Agrega un repositorio para monitorear.

**Parámetros:**
- `nombre`: Nombre del repositorio (ej: mi-proyecto)
- `url`: URL HTTPS del repositorio Git
- `provider`: GitHub o GitLab

**Ejemplo:**
```
/add-repo nombre:mi-proyecto url:https://github.com/usuario/mi-proyecto.git provider:github
```

#### `/list-repos`
Lista todos los repositorios monitoreados.

#### `/config-branch`
Configura una rama para monitorear y notificar.

**Permisos:** Solo administradores

**Parámetros:**
- `repo`: Nombre del repositorio (autocompletado)
- `branch`: Nombre de la rama (ej: staging, main)
- `canal`: Canal de Discord para notificaciones de deployments
- `canal-pr`: (opcional) Canal de Discord para notificaciones de Pull Requests. Si no se especifica, usa el mismo canal que deployments
- `build-command`: (opcional) Comando de build (ej: `npm run build`)
- `deploy-command`: (opcional) Comando de deploy (ej: `npm run deploy`)
- `environment`: (opcional) Nombre del ambiente

**Notas importantes:**
- Los comandos de build y deploy son opcionales. Si no los configuras, el bot solo:
  - Clonará/actualizará el repositorio
  - Enviará notificaciones cuando haya cambios
  - No ejecutará build ni deploy
- **Puedes actualizar la configuración después:** Si una rama ya está configurada, ejecutar `/config-branch` de nuevo actualizará la configuración existente. Esto te permite:
  - Agregar comandos de build/deploy más tarde
  - Cambiar el canal de notificaciones
  - Modificar cualquier parámetro de la configuración

**Ejemplo inicial (solo notificaciones):**
```
/config-branch repo:mi-proyecto branch:develop canal:#notificaciones
```

**Ejemplo actualizando (agregando build y deploy después):**
```
/config-branch repo:mi-proyecto branch:develop canal:#notificaciones build-command:"npm run build" deploy-command:"npm run deploy" environment:development
```

#### `/remove-repo`
Elimina un repositorio del monitoreo.

**Permisos:** Solo administradores

### Comandos de Bugs

#### `/report-bug`
Reporta un nuevo bug.

**Parámetros:**
- `titulo`: Título del bug (máx. 200 caracteres)
- `descripcion`: Descripción detallada del bug (máx. 2000 caracteres)
- `prioridad`: (opcional) Prioridad del bug (Baja, Media, Alta, Crítica)
- `repositorio`: (opcional) Repositorio relacionado (autocompletado)

**Ejemplo:**
```
/report-bug titulo:"Error en el login" descripcion:"El botón de login no funciona en móviles" prioridad:Alta repositorio:mi-proyecto
```

#### `/list-bugs`
Lista los bugs reportados.

**Parámetros:**
- `filtro`: (opcional) Filtrar por estado (Abiertos, Resueltos, Todos)
- `limite`: (opcional) Número máximo de bugs a mostrar (1-25, por defecto 10)

**Ejemplo:**
```
/list-bugs filtro:Abiertos limite:15
```

#### `/resolve-bug`
Marca un bug como resuelto.

**Parámetros:**
- `id`: ID del bug a resolver (autocompletado con bugs abiertos)

**Ejemplo:**
```
/resolve-bug id:abc12345-6789-...
```

## 🔄 Flujo de Trabajo

1. **Agregar repositorio:** Usa `/add-repo` para registrar un repositorio
2. **Configurar rama:** Usa `/config-branch` para configurar qué ramas monitorear y dónde notificar
3. **Configurar webhook:** Agrega el webhook en GitHub/GitLab apuntando a tu servidor
4. **Hacer push:** Cuando hagas push a una rama configurada:
   - El bot detecta el webhook
   - Clona/actualiza el repositorio
   - Ejecuta el comando de build (si está configurado)
   - Ejecuta el comando de deploy (si está configurado)
   - Envía notificación al canal de Discord configurado

## 🛠️ Desarrollo

```bash
# Modo desarrollo (con hot reload)
npm run dev

# Compilar
npm run build  # Genera el cliente de Prisma automáticamente antes de compilar

# Ejecutar producción
npm start
```

**Nota importante:** El script `build` genera automáticamente el cliente de Prisma antes de compilar. Si necesitas generarlo manualmente:

```bash
npx prisma generate
```

## 📁 Estructura del Proyecto

```
src/
├── app.ts                 # Punto de entrada
├── core/
│   ├── database/         # Cliente de Prisma
│   ├── discord/          # Bot de Discord
│   ├── http/             # Servidor HTTP para webhooks
│   └── types/            # Tipos TypeScript
├── features/
│   ├── configuration/    # Comandos de configuración
│   ├── deployments/      # Procesamiento de deployments
│   ├── notifications/    # Notificaciones a Discord
│   └── webhooks/         # Manejo de webhooks
└── shared/
    ├── config/           # Configuración (env)
    └── utils/            # Utilidades (logger)
```

## 🔒 Seguridad

- Usa HTTPS para los webhooks en producción
- Configura `WEBHOOK_SECRET` y valídalo en los webhooks
- No expongas tokens ni credenciales
- Usa variables de entorno para toda la configuración sensible

## 🐛 Troubleshooting

### El bot no responde a comandos
- Verifica que el bot esté en el servidor
- Verifica que los comandos estén registrados (deberías ver un mensaje al iniciar)
- Verifica los permisos del bot en el servidor

### Los webhooks no funcionan
- Verifica que la URL del webhook sea accesible públicamente
- Usa un servicio como ngrok para desarrollo local
- Verifica los logs del servidor

### Los deployments fallan
- Verifica que los comandos de build/deploy sean correctos
- Verifica permisos de escritura en `DEPLOY_BASE_PATH`
- Revisa los logs en la base de datos (campo `error` en deployments)

### Error "Missing Permissions" al enviar notificaciones

**Solución paso a paso:**

1. **Verifica permisos del rol del bot:**
   - Configuración del servidor > Roles > Busca el rol del bot
   - Asegúrate de que tenga estos permisos:
     - ✅ Ver canales
     - ✅ Enviar mensajes
     - ✅ Insertar enlaces
   - **Guarda los cambios** (botón al final de la página)

2. **Verifica permisos específicos del canal:**
   - Click derecho en el canal > Editar canal > Permisos
   - Busca el rol del bot en la lista
   - Si no está, haz clic en "+" para agregar el rol del bot
   - Asegúrate de que tenga:
     - ✅ Ver canal
     - ✅ Enviar mensajes
     - ✅ Insertar enlaces
   - **Guarda los cambios**

3. **Verifica la jerarquía de roles:**
   - El rol del bot debe estar **por encima** de otros roles que puedan restringir permisos
   - Arrastra el rol del bot hacia arriba en la lista de roles si es necesario

4. **Si los permisos no se guardan:**
   - Asegúrate de hacer clic en "Guardar cambios" al final de la página
   - Espera unos segundos después de guardar
   - Prueba reiniciar el bot si es necesario
   - Verifica que tengas permisos de administrador en el servidor para cambiar roles

### Error de autenticación al clonar repositorios

Si el repositorio es privado, el bot necesita autenticación. **Solución recomendada:**

1. **Genera un token de acceso personal:**
   - **GitHub:** Ve a Settings > Developer settings > Personal access tokens > Tokens (classic)
     - Genera un nuevo token con permisos `repo` (acceso completo a repositorios privados)
   - **GitLab:** Ve a Preferences > Access Tokens
     - Genera un token con permisos `read_repository`

2. **Agrega el token a tu archivo `.env`:**
   ```env
   GITHUB_TOKEN=ghp_tu_token_aqui
   GITLAB_TOKEN=glpat-tu_token_aqui
   ```

3. **Reinicia el bot** para que cargue las nuevas variables de entorno

El bot usará automáticamente estos tokens cuando clone o haga pull de repositorios privados.

**Alternativas:**
- Usa SSH en lugar de HTTPS: `git@github.com:usuario/repo.git` (requiere configuración de SSH keys)
- Configura credenciales de Git globalmente: `git config --global credential.helper store` (menos seguro)

## 📝 Notas

- Los deployments se procesan de forma asíncrona
- Los logs de build y deploy se guardan en la base de datos
- El bot puede manejar múltiples repositorios simultáneamente
- Cada rama puede tener su propia configuración de canal y comandos

## 🤝 Contribuir

Las contribuciones son bienvenidas. Por favor, abre un issue o PR.

## 📄 Licencia

ISC

