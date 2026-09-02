# Juego de Memoria con Arduino

Proyecto para hackathon: circuito físico (Arduino + botones + LEDs) como
**entrada**, interfaz web como **salida** y lógica del juego. Leaderboard
guardado en un archivo JSON local. Funciona completamente **sin internet**
una vez cargada la página (sonidos y fuentes están auto-hospedados).

## Estructura

```
simon-hackathon/
├── arduino/
│   └── simon_input.ino      -> firmware, sube esto al Arduino
└── server/
    ├── server.js             -> puente Serial<->WebSocket + API + leaderboard
    ├── package.json
    ├── leaderboard.json       -> se crea solo al guardar el primer puntaje
    └── public/
        └── index.html         -> interfaz del juego (frontend)
```

## 1. Armar el circuito

Componentes: Arduino Uno/Nano, 4 pulsadores, 4 LEDs (rojo, verde, amarillo,
azul), 4 resistencias de 220Ω, protoboard, cables.

- **Botones** (usan `INPUT_PULLUP`, no necesitas resistencia pull-down):
  - Rojo → pin **2**
  - Verde → pin **3**
  - Amarillo → pin **4**
  - Azul → pin **5**
  - El otro terminal de cada botón va a **GND**

- **LEDs** (feedback físico opcional, con resistencia de 220Ω en serie al ánodo):
  - Rojo → pin **8**
  - Verde → pin **9**
  - Amarillo → pin **10**
  - Azul → pin **11**
  - Cátodo de cada LED → **GND**

## 2. Subir el firmware

1. Abre `arduino/simon_input.ino` en el Arduino IDE.
2. Selecciona tu placa y puerto.
3. Sube el sketch. No necesitas librerías extra.

## 3. Instalar dependencias y levantar el servidor

Este proyecto usa **Node.js**. Antes de correrlo, necesitas instalar las
dependencias que usa `server.js` (Express, WebSocket, SerialPort) — están
declaradas en `package.json`, pero no en el repositorio (la carpeta
`node_modules/` está en `.gitignore` a propósito, porque puede tener miles
de archivos y se regenera fácilmente).

```bash
cd server
npm install
```

Esto crea automáticamente la carpeta `node_modules/` con todo lo necesario.
Es normal que este paso tarde unos segundos y que solo tengas que
ejecutarlo **una vez** (o cada vez que clones el proyecto en un computador
nuevo).

Luego levanta el servidor:

```bash
node server.js
```

El servidor intenta **detectar el Arduino automáticamente**. Si al iniciar
ves un warning de "No se detectó Arduino", copia el puerto que te lista la
consola (ej. `COM3` en Windows o `/dev/ttyACM0` en Linux) y ponlo en
`SERIAL_PORT_PATH` dentro de `server.js`.

Luego abre **http://localhost:3000** en el navegador.

## 4. Jugar

- El juego enciende una secuencia de colores en pantalla, con un sonido
  distinto por color (generado con Web Audio API, sin archivos de audio).
- Puedes responder presionando los **botones físicos** del circuito, o
  haciendo **clic con el mouse** directamente en cada color del tablero.
- Al fallar, se te pide el nombre (obligatorio antes de poder iniciar) y se
  guarda tu nivel alcanzado en el leaderboard.
- En el panel de ranking puedes borrar un registro puntual pasando el mouse
  sobre la fila y haciendo clic en el ícono **×** (pide confirmación antes
  de borrar).

## Notas para la demo

- Si el Arduino no está conectado, el juego **sigue siendo jugable con el
  mouse** — útil para probar la lógica sin depender del hardware en vivo.
- Los LEDs físicos se sincronizan con lo que se muestra en pantalla (se
  encienden/apagan vía comandos `LED:n:ON/OFF` por serial), así el jurado ve
  la conexión entrada física / salida web en tiempo real.
- El leaderboard vive en `server/leaderboard.json` (archivo plano, se crea
  solo al guardar el primer puntaje — no requiere ninguna base de datos ni
  compilación nativa).
- **No depende de internet**: los sonidos se generan localmente con Web
  Audio API.
