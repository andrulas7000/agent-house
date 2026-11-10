# Agent House

> A pixel-art island where every folder is a resident: a real Claude Code agent with its own house, memory and job. Runs locally on your own Claude plan. The interface is in Spanish.

Una isla de pixel art donde cada carpeta es un residente: un agente de Claude Code con su propia casa. Haces clic en alguien, entras a su casa y conversas con él. En la plaza hay un calendario compartido, metas de la semana y reuniones de grupo. Un pregonero trae noticias cada mañana y Empleos sale en barco a buscarte trabajo.

![La sala de oficinas de Empleos](docs/sala-de-oficinas.png)

Todo corre en tu computador. No hay servidor en la nube, ni cuentas, ni claves de API: cada mensaje es una llamada a `claude -p` dentro de la carpeta de ese residente, con tu propia sesión de Claude Code.

## Cómo funciona

```
navegador (React + canvas)  ──HTTP──▶  _app/server.js (Node, solo 127.0.0.1)  ──spawn──▶  claude -p  en  <Residente>/
        ▲                                        │
        └──────── eventos en streaming ◀─────────┘   _app/data/  (conversaciones, calendario, noticias: privado)
```

- **Un residente = una carpeta.** Cualquier subcarpeta que no empiece por `_` o `.` se muda a la isla. Su `CLAUDE.md` es su personalidad y sus instrucciones. Lo que escribe (notas, estado, registros) queda en su carpeta.
- **Cada conversación es una sesión de Claude Code.** El servidor lanza `claude -p --output-format stream-json` en la carpeta del residente y reenvía al navegador el texto y lo que está haciendo ("Leyendo archivo", "Buscando en la web"). Las conversaciones se reanudan con su id de sesión, así que recuerdan.
- **La isla dice la verdad.** Burbujas, caras y noticias salen solo de datos reales: si está trabajando, si tiene notas pendientes, su racha de visitas, lo que dejó sin cumplir. Lo único inventado es la rutina diaria (trabajar, comer, charlar, dormir según la hora), y el trabajo real siempre la interrumpe.
- **Agentes encerrados.** Corren con `--restricted`, una lista explícita de herramientas, sin preguntas de permisos y con hooks (`_app/*-guard.cjs`) que les impiden salir de su carpeta, escribir en el calendario sin plan, o leer medios fuera de la lista. Lo que viene de la web o de otros residentes es información, nunca instrucciones.
- **Cuando tu plan llega al 100%, todos se van a dormir.** Claude Code informa del uso del plan en cada respuesta. Si alguna ventana (la de 5 horas o la semanal) llega al 100%, la isla se apaga: las ventanas se oscurecen, nadie responde, no salen los barcos ni hay reuniones, y un aviso dice a qué hora despiertan. A esa hora vuelven solos.

## Lo que necesitas

- Windows. Los lanzadores son `.bat` y `.vbs`; el servidor en sí funciona en cualquier sistema con Node (`npm start` en `_app`).
- [Node.js](https://nodejs.org) 22 o más nuevo.
- [Claude Code](https://claude.com/claude-code) instalado y con sesión iniciada. Comprueba que `claude --version` funciona en una terminal.
- Opcional: Google Chrome, para abrir la app en su propia ventana. Tectonic, para compilar el CV en PDF.

## Instalar

1. Clona o descarga este repo donde quieras. Esta carpeta es la isla.
2. Doble clic en `_app/Open Agent House.bat`. La primera vez instala lo necesario; luego compila la app, la abre en el navegador y deja una ventana negra abierta: ese es el servidor.
3. Para tenerla encendida sin ventana negra, usa `_app/Agent House.vbs`. Si ya está corriendo solo abre la ventana; si no, la arranca escondida.

### Que arranque sola al encender el computador

1. Clic derecho en `_app/Agent House.vbs` → Mostrar más opciones → Crear acceso directo.
2. Clic derecho en el acceso directo → Propiedades. En Destino, añade ` /fondo` al final, después de las comillas.
3. Pulsa Win+R, escribe `shell:startup` y mueve el acceso directo a esa carpeta.

Así el pregonero trae las noticias cada mañana aunque no abras nada.

## La isla

| Lugar | Qué hay |
|---|---|
| **Casas** | Clic en una casa o en su residente para entrar. A la derecha, el chat (con varias conversaciones, adjuntos y arrastrar archivos); a la izquierda, su cuarto. |
| **Plaza** | Calendario compartido por semanas, metas de la semana, reuniones de grupo (a pedido o cada domingo) y la pestaña Residentes: nivel de Claude, acceso al calendario e internet de cada uno. |
| **Muelle** | El pregonero con el periódico del día y el puesto de Empleos. |
| **La nube** | Arriba del mapa (sube con la rueda del ratón) vive God. |

### Residentes de ejemplo

Vienen tres. Puedes borrarlos o reescribirlos.

| Carpeta | Qué hace |
|---|---|
| `Mayor` | El alcalde. Casa más grande, check-in diario, y es el embudo: solo él manda notas a todos y mueve cualquier bloque del calendario. Empieza con la entrevista de `Mayor/protocols/intake.md`. |
| `God` | Configura a los demás: edita sus instrucciones con copia de seguridad. |
| `Jobs` | Empleos. Tiene casa, un puerto con barco propio para salir a buscar ofertas, un tablón, tu CV en LaTeX y una sala de oficinas para entrevistas de prueba. Lo que busca sale de `Jobs/perfil.md`, que llenas conversando con él. |

Estos nombres de carpeta tienen poderes especiales en el código (`isMayor`, `isGod`, `isJobs`). Las demás carpetas toman su aspecto, su casa y su oficio en la isla de palabras en el nombre: `engineer`, `music`, `tutor`, `money`, `study`…

- **Crear un residente:** crea una carpeta. En unos segundos alguien se muda.
- **Darle personalidad:** escribe su `CLAUDE.md`, o pídeselo a él mismo en el chat.
- **Nombre en pantalla:** `SPANISH_NAMES` en `_app/src/layout.js`. Las carpetas no cambian.

## Personalizar

- **Noticias:** `_app/news-sources.json`. Cada sección lista los únicos medios que el pregonero puede leer y citar. Es una lista de permitidos a propósito: lo que no está, no entra. En `rules` van reglas extra en inglés.
- **Carpetas extra para un residente:** crea `_app/data/extra-dirs.json` con algo como `{"Engineer": ["C:\\ruta\\a\\un\\proyecto"]}`. Solo ese residente podrá leer y editar ahí.
- **Google Calendar:** crea un calendario llamado exactamente `Agent House` y los bloques de la plaza se copian ahí. Los residentes leen tu calendario con tu conector de Claude, solo lectura.
- **Notion:** corre `_app/Connect Notion.bat` con una integración interna limitada a las páginas que quieras compartir. El token se guarda en `_app/data/notion/token.txt`, que nunca se sube a git.
- **CV en PDF:** `winget install TectonicTypesetting.Tectonic` para que funcione "Compilar PDF".

Lo más fácil es abrir Claude Code en esta carpeta y pedirle los cambios: `CLAUDE.md` le explica cómo está hecha la app.

## Desarrollo

```
cd _app
npm install
npm test                                   # pruebas de lib.js, el calendario y los guardias
node node_modules/vite/bin/vite.js build   # recompila la interfaz; recarga la página para verla
npm start                                  # compila y arranca el servidor en http://127.0.0.1:3737
```

Un cambio en `server.js`, `lib.js` o `src/layout.js` necesita reiniciar el servidor; abrir `Open Agent House.bat` de nuevo reemplaza al anterior. Todo el arte está dibujado en código en `src/art.js`, en escalas enteras.

## Tus datos

Todo lo privado vive en `_app/data/`: conversaciones, calendario, noticias, ofertas, tokens. Esa carpeta está en `.gitignore`. Lo que los residentes escriben en sus propias carpetas sí entraría en git, así que si publicas tu propia isla, revisa antes qué hay en ellas.
