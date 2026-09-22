<a id="top"></a>

<table>
  <tr>
    <td width="34%" valign="middle" align="center">
      <p align="center"><img src="config/brand/assets/zinuto-core-logo.png" alt="Logotipo de Zinuto Core" width="96"></p>
      <h1 align="center">Zinuto Core</h1>
      <p align="center">Un espacio de trabajo de escritorio, centrado en datos locales, para repetir mercados, practicar y probar estrategias.</p>
    </td>
    <td width="66%" valign="middle">
      <img src="docs/assets/readme/core-overview.es.jpg" alt="Centro de entrenamiento de Zinuto Core en español" width="100%">
    </td>
  </tr>
</table>

<p align="center">
  <a href="#build-and-run">Compilar Core</a> ·
  <a href="#contribute">Contribuir</a>
</p>

<p align="center">
  <a href="README.md">English</a> ·
  <a href="README.zh-CN.md">简体中文</a> ·
  <a href="README.ja.md">日本語</a> ·
  <a href="README.ko.md">한국어</a> ·
  <strong>Español</strong>
</p>

> Zinuto ha dejado de operar. Si deseas seguir utilizando las herramientas locales, puedes compilar Core a partir del código fuente de este repositorio siguiendo las instrucciones que aparecen más abajo. Core funciona localmente sin una cuenta oficial ni servicios alojados. Ya no se ofrecen descargas oficiales, servicios de cuenta ni actualizaciones del producto.

Core no se conecta a un bróker ni envía órdenes reales. Es una herramienta de investigación y práctica, no asesoramiento financiero. Cuando los datos ya están disponibles en el equipo, las funciones principales no requieren una cuenta ni conexión permanente. Los conectores de datos opcionales solo realizan solicitudes cuando tú inicias una adquisición. Esas solicitudes salen directamente de tu equipo hacia el proveedor elegido, sin pasar por un servicio de Zinuto. El proveedor ve tu IP pública o la IP de salida de tu proxy o VPN.

## Qué puedes hacer

| Espacio | Para qué sirve |
| --- | --- |
| Datos locales | Previsualizar, asignar, validar e importar CSV, JSON, Parquet y XLSX |
| Repetición de mercado | Recorrer sesiones históricas, anotar decisiones y revisarlas después |
| Práctica | Usar operaciones simuladas, bancos de ejercicios y retos concretos |
| Backtesting | Ejecutar el motor de estrategias en Rust y revisar operaciones, métricas y gráficos |
| Revisión | Guardar notas, indicadores, historial, resultados y paquetes de datos portátiles |
| Idioma | Inglés, chino simplificado, japonés, coreano y español |

<table>
  <tr>
    <td width="50%" valign="top">
      <a href="docs/assets/readme/free-replay.es.webp"><img src="docs/assets/readme/free-replay.es.webp" alt="Espacio de repetición libre con gráfico y panel de órdenes simuladas" width="100%"></a>
    </td>
    <td width="50%" valign="top">
      <a href="docs/assets/readme/directed-replay.es.webp"><img src="docs/assets/readme/directed-replay.es.webp" alt="Configuración de repetición libre dirigida" width="100%"></a>
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <a href="docs/assets/readme/flash-decision.es.webp"><img src="docs/assets/readme/flash-decision.es.webp" alt="Modo desafío con gráfico, panel de decisiones y métricas de revisión" width="100%"></a>
    </td>
    <td width="50%" valign="top">
      <a href="docs/assets/readme/strategy-backtests.es.webp"><img src="docs/assets/readme/strategy-backtests.es.webp" alt="Configuración y lotes de resultados para estrategias" width="100%"></a>
    </td>
  </tr>
  <tr>
    <td colspan="2" valign="top">
      <a href="docs/assets/readme/local-data.es.webp"><img src="docs/assets/readme/local-data.es.webp" alt="Espacio de gestión de datos locales" width="100%"></a>
    </td>
  </tr>
</table>

_Estas pantallas muestran flujos de entrenamiento simulado y datos locales. No contienen cuentas oficiales ni servicios privados._

Los datos de trabajo permanecen en el almacenamiento local de la aplicación, salvo que exportes expresamente un paquete portátil. Esos paquetes no están cifrados por diseño. Trátalos como archivos sensibles y guárdalos de forma adecuada.

<a id="build-and-run"></a>

## Compilar y ejecutar

### Requisitos

| Requisito | Nota |
| --- | --- |
| Git | Necesario para clonar y contribuir |
| Node.js | Usa la versión exacta indicada en [`.nvmrc`](.nvmrc) |
| Rust | Instala la cadena estable con [rustup](https://rustup.rs/) |
| uv | Usa la versión `0.11.8`; prepara el entorno de Python fijado por el proyecto |
| Herramientas del sistema | Sigue los [requisitos de Tauri 2](https://v2.tauri.app/start/prerequisites/) para macOS o Windows |

En macOS necesitas Xcode Command Line Tools. En Windows, instala Microsoft C++ Build Tools y WebView2 según las instrucciones de Tauri.

### Iniciar la aplicación de escritorio

```sh
git clone https://github.com/Zinuto-Official/zinuto-core.git
cd zinuto-core
npm ci
npm start
```

El primer inicio compila el entorno local de Node.js, el motor de backtesting en Rust y el proceso auxiliar de datos en Python con versiones fijadas. Puede tardar varios minutos y necesita conexión para obtener las dependencias de desarrollo. Las siguientes ejecuciones reutilizan la caché local.

### Crear un instalador

```sh
npm run package -- --output-dir /absolute/path/to/output
```

El comando crea un `Zinuto-Core-<version>.dmg` o `.exe` compilado por ti, junto con sumas de comprobación y pruebas de compilación. Zinuto no lo firma ni lo certifica, no es una versión oficial y los flujos de este repositorio nunca lo suben. Debes compilar el instalador en el sistema operativo al que va destinado; no se admite la compilación cruzada.

### Ejecutar las comprobaciones

```sh
npm run check:fast -- --working-tree
npm run check:affected -- --base origin/main --head HEAD
npm run check:public-repo
```

`npm run check:full` ejecuta la revisión completa para una versión candidata y tarda más. Consulta [CONTRIBUTING.md](CONTRIBUTING.md) para saber qué controles exige cada parte del código.

### Mapa del repositorio

| Ruta | Responsabilidad |
| --- | --- |
| `apps/desktop/web` | Interfaz React integrada en la aplicación de escritorio |
| `apps/desktop/local-api` | Servicios locales y almacenamiento SQLite/DuckDB |
| `apps/desktop/shell` | Ciclo de vida de Tauri, preparación de archivos y puente nativo |
| `apps/desktop/backtest-engine` | Proceso auxiliar de backtesting en Rust |
| `packages/shared` | Contratos, validación, lógica de dominio y textos en cinco idiomas |
| `contracts` | Contratos versionados para HTTP local y el puente nativo |
| `tools` | Compilación, empaquetado, generación y controles del repositorio |

Consulta [Arquitectura](docs/ARCHITECTURE.md) para entender los límites de diseño. El origen y las licencias de los datos de ejemplo están en [THIRD_PARTY_DATA.md](THIRD_PARTY_DATA.md).

<a id="contribute"></a>

## Contribuir

No hace falta entender todo el proyecto para ayudar. Un informe de error reproducible, una traducción más natural, una prueba concreta o un parche pequeño pueden ser muy útiles.

1. Busca entre los Issues existentes. Si nadie ha tratado el tema, abre un informe de error o una propuesta.
2. Haz un Fork del repositorio y crea una rama concreta dentro de tu Fork.
3. Lee [CONTRIBUTING.md](CONTRIBUTING.md), [GOVERNANCE.md](GOVERNANCE.md) y el acuerdo aplicable descrito en [CLA.md](CLA.md).
4. Limita cada cambio a un problema coherente. Si modificas texto visible, actualiza los cinco idiomas.
5. Ejecuta las comprobaciones afectadas y adjunta capturas cuando cambie la interfaz.
6. Abre un Pull Request hacia la rama predeterminada de este repositorio y explica el efecto para el usuario.

Los mantenedores trabajan en `main`. Las personas externas usan ramas dentro de sus propios Forks. Informa de problemas de seguridad de forma privada según [SECURITY.md](SECURITY.md), nunca en un Issue público.

## Licencia, seguridad y marca

- Código: [`GPL-3.0-only`](LICENSE). Quienes contribuyen conservan sus derechos de autor; consulta [CLA.md](CLA.md).
- Seguridad: informa de vulnerabilidades de forma privada según [SECURITY.md](SECURITY.md).
- Redistribución: respeta [BRANDING.md](BRANDING.md) y [TRADEMARKS.md](TRADEMARKS.md). Una compilación modificada no puede presentarse como versión oficial de Zinuto.
- Avisos de terceros: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

<p align="center"><a href="#top">Volver arriba</a></p>
