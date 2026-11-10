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

## Pruebas

```bash
npm test
# o, por separado:
node pruebas/probar-evaluador.js
node pruebas/probar-motor.js

# Sala online (servidor en marcha, preferible en modo rápido):
POKER_RAPIDO=1 npm start
# en otra terminal:
node pruebas/probar-sala.js
# o, si el servidor usa otro puerto:
node pruebas/probar-sala.js http://localhost:4567
```

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
- `royal-flush.html` — todo el juego (modo solo) en un solo archivo, con doble clic.
- `public/js/evaluador.js` — evalúa manos de 5, 6 o 7 cartas.
- `public/js/motor.js` — el motor del Hold'em (ciegas, turnos, botes, showdown).
- `public/js/bots.js` — decisiones de los bots (fuerza de mano + un poco de azar).
- `server.js` — servidor Express + WebSocket, dueño de la verdad en el modo online.
- `render.yaml` — descripción del servicio para Render.
