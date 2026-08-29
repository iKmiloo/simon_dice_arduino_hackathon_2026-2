/*
  Simón Dice - Firmware de entrada (Arduino Uno/Nano)
  ----------------------------------------------------
  Rol: dispositivo de ENTRADA. Lee 4 botones y envía eventos por
  Serial. La lógica del juego vive en la web (Node + navegador).

  Conexiones:
    Botones (INPUT_PULLUP, activos en LOW):
      Rojo    -> pin 2
      Verde   -> pin 3
      Azul    -> pin 4
      Amarillo-> pin 5
      (el otro terminal de cada botón va a GND)

    LEDs (feedback físico opcional), con resistencia 220ohm en serie:
      Rojo    -> pin 8
      Verde   -> pin 9
      Azul    -> pin 10
      Amarillo-> pin 11

  Protocolo Serial (9600 baudios):
    Arduino -> PC:  "BTN:0" .. "BTN:3"   (botón presionado)
    PC -> Arduino:  "LED:0:ON" / "LED:0:OFF"   (controla LED n)
                    "LED:ALL:OFF"                (apaga todos)
*/

const int NUM_COLORS = 4;
const int buttonPins[NUM_COLORS] = {2, 3, 4, 5};
const int ledPins[NUM_COLORS]    = {8, 9, 10, 11};

bool lastState[NUM_COLORS];
unsigned long lastDebounceTime[NUM_COLORS];
const unsigned long DEBOUNCE_MS = 30;

String serialBuffer = "";

void setup() {
  Serial.begin(9600);

  for (int i = 0; i < NUM_COLORS; i++) {
    pinMode(buttonPins[i], INPUT_PULLUP);
    pinMode(ledPins[i], OUTPUT);
    digitalWrite(ledPins[i], LOW);
    lastState[i] = HIGH; // no presionado
    lastDebounceTime[i] = 0;
  }
}

void loop() {
  readButtons();
  readSerialCommands();
}

void readButtons() {
  for (int i = 0; i < NUM_COLORS; i++) {
    bool reading = digitalRead(buttonPins[i]);

    if (reading != lastState[i]) {
      lastDebounceTime[i] = millis();
    }

    if ((millis() - lastDebounceTime[i]) > DEBOUNCE_MS) {
      // Flanco de presión: pasó de HIGH (suelto) a LOW (presionado)
      if (reading == LOW && lastState[i] == HIGH) {
        Serial.print("BTN:");
        Serial.println(i);
      }
    }

    lastState[i] = reading;
  }
}

void readSerialCommands() {
  while (Serial.available() > 0) {
    char c = Serial.read();
    if (c == '\n') {
      handleCommand(serialBuffer);
      serialBuffer = "";
    } else if (c != '\r') {
      serialBuffer += c;
    }
  }
}

void handleCommand(String cmd) {
  cmd.trim();
  if (cmd.length() == 0) return;

  // Formato: LED:<idx|ALL>:<ON|OFF>
  if (cmd.startsWith("LED:")) {
    int firstColon = cmd.indexOf(':', 4);
    if (firstColon == -1) return;

    String target = cmd.substring(4, firstColon);
    String action = cmd.substring(firstColon + 1);

    if (target == "ALL") {
      bool on = (action == "ON");
      for (int i = 0; i < NUM_COLORS; i++) digitalWrite(ledPins[i], on ? HIGH : LOW);
    } else {
      int idx = target.toInt();
      if (idx >= 0 && idx < NUM_COLORS) {
        digitalWrite(ledPins[idx], action == "ON" ? HIGH : LOW);
      }
    }
  }
}
