# Agent House

Una isla de pixel art donde cada carpeta es un residente: un agente de Claude Code con su propia casa. Haces clic en alguien y entras a su casa a conversar. En la plaza hay un calendario compartido, metas de la semana y reuniones de grupo. Un pregonero trae noticias cada mañana, y Empleos busca trabajo por ti.

Todo corre en tu computador. Cada mensaje es una llamada a `claude -p` dentro de la carpeta de ese residente, así que usa tu propio plan de Claude.

## Lo que necesitas

- Windows (los lanzadores son `.bat` y `.vbs`; el resto funciona en cualquier sistema con Node).
- [Node.js](https://nodejs.org) 22 o más nuevo.
- [Claude Code](https://claude.com/claude-code) instalado y con sesión iniciada. Comprueba que `claude --version` funciona en una terminal.
- Opcional: Google Chrome, para abrir la app en su propia ventana.

## Instalar

1. Pon esta carpeta donde quieras. Esta carpeta es la isla: cada subcarpeta que no empiece por `_` o `.` es un residente.
2. Doble clic en `_app/Open Agent House.bat`. La primera vez instala lo necesario. Luego compila la app, la abre en el navegador y deja una ventana negra abierta: ese es el servidor.
3. Para que quede encendida sin ventana negra, usa `_app/Agent House.vbs`. Si ya está corriendo solo abre la ventana, y si no, la arranca escondida.

### Que arranque sola al encender el computador

1. Clic derecho en `_app/Agent House.vbs` → Mostrar más opciones → Crear acceso directo.
2. Clic derecho en el acceso directo → Propiedades. En Destino, añade ` /fondo` al final, después de las comillas.
3. Pulsa Win+R, escribe `shell:startup` y mueve el acceso directo a esa carpeta.

Así el pregonero trae las noticias cada mañana aunque no abras nada. Para quitarlo, borra el acceso directo de esa carpeta.

## Tus residentes

Vienen tres de ejemplo: `Mayor` (el que dirige la casa), `God` (configura a los demás) y `Jobs` (empleos). Puedes borrarlos o cambiarlos.

- **Crear un residente:** crea una carpeta. En unos segundos alguien se muda a la isla.
- **Darle personalidad:** escribe un `CLAUDE.md` dentro de su carpeta, o pídeselo a él mismo en el chat.
- **Nombre en pantalla:** la isla muestra los nombres en español según `SPANISH_NAMES` en `_app/src/layout.js`. Las carpetas no cambian.
- **Nivel de Claude, acceso e internet:** se cambian en la plaza, pestaña Residentes.

Algunos nombres de carpeta tienen poderes especiales:

| Carpeta | Qué tiene de especial |
|---|---|
| `Mayor` | La casa más grande. Es el embudo: solo él puede mandar notas a todos y mover cualquier bloque del calendario. Lleva el check-in diario. |
| `God` | No tiene casa: vive en una nube arriba del mapa (sube con la rueda del ratón). Edita las instrucciones de los demás, con copia de seguridad. |
| `Jobs` | Tiene casa, un puerto con barco propio para salir a buscar empleo, un tablón de ofertas, su CV en LaTeX y una sala de oficinas para entrevistas de prueba. |

## Personalizar

- **Noticias:** edita `_app/news-sources.json`. Cada sección tiene la lista de los únicos medios que el pregonero puede leer y citar. En `rules` van reglas extra en inglés, por ejemplo qué medio revisar siempre o cuál evitar.
- **Carpetas extra para un residente:** crea `_app/data/extra-dirs.json` con algo como `{"Engineer": ["C:\\ruta\\a\\un\\proyecto"]}`. Solo ese residente podrá leer y editar ahí.
- **Calendario de Google:** crea en Google Calendar un calendario llamado exactamente `Agent House` y los bloques de la plaza se copian ahí. Los residentes leen tu calendario a través de tu conector de Claude, solo en modo lectura.
- **Notion:** corre `_app/Connect Notion.bat` con una integración interna limitada a las páginas que quieras compartir.
- **CV en PDF:** instala Tectonic (`winget install TectonicTypesetting.Tectonic`) para que el botón "Compilar PDF" de Jobs funcione.

Lo más fácil es abrir Claude Code en esta carpeta y pedirle los cambios. `CLAUDE.md` le explica cómo está hecha la app.

## Tus datos

Todo lo personal vive en `_app/data/`: conversaciones, calendario, noticias, ofertas. Esa carpeta no se sube a git. Lo que los residentes escriben en sus propias carpetas sí, así que revisa tu `.gitignore` antes de publicar el repo.
