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
- **Reloj de turno (modo online):** tienes 30 segundos para actuar; si no, pasas (si es gratis) o te retiras
  solo, para que nadie bloquee la mesa. Quien deja agotar 2 turnos seguidos pasa a tener solo 8 segundos.
  Se ve una cuenta atrás bajo el bote. Se puede cambiar con la variable `POKER_TURNO_MS` (en milisegundos).
- **Atajos de teclado:** `C` pasa o iguala, `R` (o `F`) te retira, `S` sube y `Mayús + A` va all-in.
  Si pasar es gratis, `R` no te retira (te lo recuerda), para evitar errores.
- **«Tu mano» en vivo:** desde el flop, bajo la mesa se lee qué llevas ahora («Pareja de ases», «Color»...) y si tienes
  un proyecto de color o de escalera.
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
npm run test:online      # sala privada, reconexión, cuentas en Bs, espectador/torneo y reloj de turno
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
npm run test:navegador                                   # modo solo (torneo, sonido, historial, atajos) y reloj de turno
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


## Mejoras v11

- Controles táctiles y tamaños adaptados para móviles estrechos, con soporte para zonas seguras.
- Nuevos sonidos sintetizados para igualar, apostar, subir, all-in, bote y premio; respetan el botón de silencio.
- Movimiento de fichas al bote y hacia ganadores, respetando la preferencia de movimiento reducido.
- Caché PWA actualizado a v11.

## Novedades v12

- **Bots con personalidad** (10): Roca 🪨, Tiburón 🦈, Loco 🤪, Pagador 📞, Farolero 🎭, Agresivo ⚡, Miedoso 😰, Trampero 🕸️, Novato 🐣 y Calculador 🧮. Cada mesa mezcla personalidades distintas; se ven con una etiqueta junto al nombre y hablan en el chat con frases cortas.
- **Monedas** (no son dinero real): empezás con 100; +1 por mano jugada (hasta 100 al día), +5 por ganar una mano y +10 más si fue en showdown con trío o mejor; +25 por ganar una partida o torneo y +10 por el 2.º puesto; bono diario +50 que sube +10 por cada día seguido hasta +100; logros: primer póker +100, primera escalera de color +200, primer Royal Flush +500. Jugando solo se gana la mitad (redondeando hacia abajo; la media moneda que sobra se guarda). Se guardan en el aparato y, como respaldo, en el servidor con un código de monedero.
- **Tienda**: piezas de avatar, mesas (paños), dorsos de cartas y temas de sonido (Clásico gratis, Casino Vegas, Retro 8-bit, Fiesta y Minimal). Exclusivos de 1000 monedas: cabeza de pez, cara con granos y orejas de mono (los bots nunca los usan).
- **Código 3174**: botón «🎁 Código» al pie del menú (y en la tienda). Suma 1000 monedas cada vez, sin límite.
- **Editar avatar** desde el menú: 112 opciones dibujadas en SVG; en la compu la cara en el asiento es más grande.
- **Espectadores**: «Mesas en vivo» con la lista de mesas públicas, contador 👁 de gente mirando y showdown visible, sin ver nunca cartas privadas.
- **Recargar**: un solo «Recargar» con un campo de monto (mínimo 10 Bs, sin montos fijos). Si te quedás sin fichas aparece abajo un botón «Recargar», en solo y online.
- **Racha** 🔥: cuenta las manos ganadas seguidas. Retirarte sin haber puesto más que una ciega grande no la corta; perder o retirarte después de meter fichas, sí.
- **Barajado riffle** de ~1,5 s antes de cada reparto, con el dorso equipado y el sonido de barajar del tema. Se apaga en Opciones y se omite si el aparato pide menos movimiento.
- **Chat escrito**: hasta 80 letras, se limpia en el servidor, siempre se muestra como texto y tiene límite (1 cada 2 s, 5 cada 20 s).
- **Mesas de 9, 10 o 15 asientos** (la de 15 usa un diseño compacto).
