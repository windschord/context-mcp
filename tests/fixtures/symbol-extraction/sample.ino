/**
 * Sample Arduino code for symbol extraction testing
 */

// Global constants
#define LED_PIN 13
const int BUTTON_PIN = 2;

// Global variables
int ledState = LOW;
unsigned long lastDebounceTime = 0;

/**
 * Class to manage LED blinking
 */
class LedBlinker {
private:
  int pin;
  int state;
  unsigned long interval;
  unsigned long previousMillis;

public:
  LedBlinker(int ledPin, unsigned long blinkInterval) {
    pin = ledPin;
    interval = blinkInterval;
    state = LOW;
    previousMillis = 0;
  }

  void begin() {
    pinMode(pin, OUTPUT);
    digitalWrite(pin, state);
  }

  void update() {
    unsigned long currentMillis = millis();
    if (currentMillis - previousMillis >= interval) {
      previousMillis = currentMillis;
      state = (state == LOW) ? HIGH : LOW;
      digitalWrite(pin, state);
    }
  }

  int getState() {
    return state;
  }
};

// Global object
LedBlinker blinker(LED_PIN, 1000);

/**
 * Helper function to read button state
 */
bool readButton(int buttonPin) {
  return digitalRead(buttonPin) == HIGH;
}

/**
 * Arduino setup function (runs once)
 */
void setup() {
  Serial.begin(9600);
  pinMode(BUTTON_PIN, INPUT);
  blinker.begin();

  Serial.println("Arduino started");
}

/**
 * Arduino loop function (runs repeatedly)
 */
void loop() {
  blinker.update();

  if (readButton(BUTTON_PIN)) {
    Serial.println("Button pressed");
  }

  delay(10);
}

/**
 * Custom helper function
 */
int calculateValue(int a, int b) {
  return a * 2 + b;
}
