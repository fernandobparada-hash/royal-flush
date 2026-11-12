# Royal Flush

**Texas Hold'em · No Limit**

Royal Flush es un Texas Hold'em para aprender a programar y para jugar con amigos.
La interfaz está en español y el código va comentado, también en español.

Puedes jugar **solo** (contra bots) o **online** (sala privada con código, o sala pública).

Hay una sola página: se adapta sola al celular (en vertical y en horizontal) y al ordenador.
En el celular puedes añadirla a la pantalla de inicio.

Al empezar (solo, o al crear una sala) puedes elegir con cuántas fichas jugar, de 10 a 50.000. Las ciegas se ajustan solas (la grande es 1/100 del stack, mínimo 2).

## Cómo ejecutarlo

Necesitas [Node.js](https://nodejs.org/) 18 o superior.

```bash
npm install
npm start
```

Luego abre el navegador en [http://localhost:3000](http://localhost:3000).
El servidor respeta la variable `PORT` (por ejemplo: `PORT=4567 npm start`).

### Modo solo, sin servidor

Abre el archivo `royal-flush.html` con un doble clic en el navegador.
No hace falta instalar nada ni arrancar el servidor.
Elige **Jugar solo**, el tamaño de la mesa (9 o 10 asientos) y siéntate.
El resto de asientos los ocupan bots con nombre. No hacen trampas:
no ven tus cartas ni las que todavía no han salido.

También puedes abrir `public/index.html` si estás trabajando con los archivos separados.

### Modo online, en tu red

1. Arranca el servidor con `npm start`.
2. En el menú elige **Jugar online**.
3. **Crear sala privada** genera un código de 5 letras. Compártelo con tus amigos.
4. Ellos eligen **Unirse con código** y escriben esas 5 letras.
5. **Sala pública** te sienta en una mesa pública con sitio, o abre una nueva.
6. El anfitrión puede **llenar los asientos vacíos con bots** e **iniciar la partida**.
7. Si solo quieres ver una partida, usa **Solo mirar** (en *Opciones*) con el código de la mesa.

Los amigos que estén en **la misma red** pueden entrar usando tu IP local,
por ejemplo `http://192.168.1.10:3000` (cambia el número por el de tu computadora).

## Cómo jugar

Texas Hold'em No Limit, ciegas 5 / 10, 1000 fichas al empezar.

- Cada jugador recibe 2 cartas privadas.
- En el centro van saliendo 5 cartas comunitarias: flop (3), turn (1) y river (1).
- En tu turno puedes **Retirarte**, **Pasar**, **Igualar**, **Apostar/Subir** o ir **All-in**.
- Gana quien forme la mejor mano de 5 cartas (con las 7 disponibles) o quien
  se quede solo porque el resto se retiró.
- Si alguien se queda all-in con menos fichas, se crean botes laterales (side pots).

## Funciones extra

- **Modo torneo:** marca la casilla al crear la partida y las ciegas se duplican cada 10 manos
  (sin pasarse de la mitad de las fichas iniciales). La mesa avisa cuántas manos faltan.
- **Solo mirar (espectador):** en *Opciones* escribe el código de una mesa y pulsa **Solo mirar**.
  Ves la partida, pero sin cartas privadas, sin cuentas y sin poder jugar ni chatear. Hasta 20 por mesa.
- **Historial de manos (📜):** guarda las últimas 50 manos: quién ganó, con qué, el bote y las cartas de la mesa.
- **Sonido (🔊):** clics de cartas, fichas, aviso de tu turno y melodía al ganar. Se fabrican en el navegador
  (no hay archivos de audio) y se pueden silenciar; se recuerda tu elección.
- **Bots con estilo:** cada bot calcula su probabilidad real de ganar (simulación Monte Carlo), compara con
  lo que cuesta igualar (pot odds), tiene en cuenta su posición y cuántos rivales quedan, y juega con uno de
  cuatro estilos (tight, agresivo, suelto, equilibrado) fijo según su nombre.

## Seguridad

El servidor ya incluye las defensas básicas (todo en `servidor/limites.js`, sin dependencias):

- El mazo se baraja con aleatoriedad criptográfica (`crypto`), no con `Math.random`.
- Los códigos de sala se generan con `crypto`.
- Tamaño máximo de cada mensaje (8 KB), límite de mensajes por conexión (60 cada 10 s) y de conexiones por IP (20).
- Límite de intentos de unirse/crear salas por IP y de consultas a `/api/sala/...`.
- Máximo de 300 salas a la vez.
- Cabeceras HTTP de seguridad (CSP, `nosniff`, sin iframes).
- Detrás de un proxy (Render lo es) se usa la IP real de `X-Forwarded-For`; en otros casos pon `TRUST_PROXY=1`
  solo si de verdad hay un proxy de confianza delante.

Los nombres de jugador se escapan antes de pintarse, y el chat solo admite frases de una lista cerrada.

## Pruebas

```bash
npm test             # pruebas rápidas, sin servidor ni navegador (evaluador, motor, botes, bots, límites,
                     # utilidades, historial/sonidos, avatares y que royal-flush.html esté al día)
```

Con el servidor en marcha en modo rápido (`POKER_RAPIDO=1 npm start`), en otra terminal:

```bash
npm run test:online      # sala privada, reconexión, cuentas en Bs, espectador y torneo
# si el servidor usa otro puerto, pásalo a cada prueba, por ejemplo:
node pruebas/probar-sala.js http://localhost:4567
```

Las pruebas de seguridad necesitan el servidor **sin** modo rápido (los límites reales):

```bash
npm start                # en una terminal
npm run test:seguridad   # en otra
```

Pruebas en un navegador real (necesitan Playwright: `npm i -D playwright && npx playwright install chromium`):

```bash
npm run test:navegador                                   # modo solo, torneo, sonido, historial
node pruebas/probar-navegador-espectador.js http://localhost:3000   # con el servidor en marcha
```

Si cambias algo dentro de `public/`, regenera el juego de un solo archivo con `npm run construir`
(`npm test` te avisa si se te olvida).

## Publicar el modo online (Render, plan gratuito)

En tu computadora, `localhost` solo lo ves tú. Para que un amigo de otra
casa se una, puedes publicar este servidor en [Render](https://render.com)
como un *Web Service* de Node, en el plan gratuito:

1. Sube esta carpeta a un repositorio de Git (por ejemplo GitHub).
2. En Render, conecta ese repositorio. El archivo `render.yaml` ya describe
   el servicio (`npm install`, `npm start`, comprobación en `/salud`).
3. Render asigna el puerto con la variable `PORT`; el servidor ya la respeta
   y el cliente usa `ws://` o `wss://` según la página vaya por http o https.
4. Abre la URL pública que te den y comparte el código de sala con tus amigos.

Este proyecto no incluye una publicación ya hecha: es algo que tienes que
hacer tú cuando quieras jugar a distancia.

## Estructura del código

- `public/index.html`, `public/estilo.css`, `public/js/interfaz.js` — la página y la mesa.
- `public/js/utilidades.js` — funciones pequeñas y puras (formato de números, escapar HTML, geometría...).
- `public/js/historial.js` — historial de manos (datos, sin dibujar).
- `public/js/sonidos.js` — sonidos fabricados con la Web Audio API.
- `royal-flush.html` — todo el juego (modo solo) en un solo archivo, con doble clic (`npm run construir`).
- `public/js/evaluador.js` — evalúa manos de 5, 6 o 7 cartas y baraja con `crypto`.
- `public/js/motor.js` — el motor del Hold'em (ciegas, modo torneo, turnos, botes, showdown).
- `public/js/bots.js` — los bots: equidad Monte Carlo, pot odds, posición y estilos.
- `public/js/avatar.js` — los avatares.
- `server.js` — servidor Express + WebSocket, dueño de la verdad en el modo online.
- `servidor/limites.js` — límites de mensajes, conexiones, intentos y cabeceras de seguridad.
- `scripts/construir-html-unico.js` — genera `royal-flush.html`.
- `pruebas/` — todas las pruebas (ver arriba).
- `render.yaml` — descripción del servicio para Render.
