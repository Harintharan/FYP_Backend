import mqtt from "mqtt";

// MQTT Broker Details
const BROKER = "0bcb8b2ea75046d2b1e46f5eed7eb364.s1.eu.hivemq.cloud";
const PORT = 8883;
const USER = "harintharan";
const PASS = "Blockchain61";
const OUTBOUND_TOPIC = "supplychain/pi_01/commands";

// Construct the connection URL (mqtts for secure connection)
const connectUrl = `mqtts://${BROKER}:${PORT}`;

// MQTT Client Setup
const client = mqtt.connect(connectUrl, {
  username: USER,
  password: PASS,
  // Add these for better connection stability
  reconnectPeriod: 1000,
  connectTimeout: 30 * 1000,
});

client.on("offline", () => {
  console.log("WiFi Controller: MQTT Client is offline");
});

client.on("error", (err) => {
  console.error("WiFi Controller: MQTT Connection Error:", err);
});

export const updateWifi = async (req, res) => {
  try {
    // Get the form data (SSID and password)
    const { ssid, password } = req.body;

    if (!ssid || !password) {
      return res.status(400).json({ error: "SSID and password are required" });
    }

    // Prepare the message to send to the Raspberry Pi
    const wifi_update_message = {
      wifi_update: {
        ssid: ssid,
        password: password,
      },
    };

    console.log(
      `Attempting to publish WiFi update for SSID: ${ssid} to topic: ${OUTBOUND_TOPIC}`
    );

    if (!client.connected) {
      console.error(
        "WiFi Controller: MQTT Client not connected, attempting to reconnect..."
      );
      // We can try to wait or just return error. Returning error is safer for user feedback.
      return res
        .status(503)
        .json({
          error: "Service unavailable: Backend not connected to MQTT broker",
        });
    }

    // Publish the message to the topic with QOS 1 (at least once) to ensure delivery to broker
    client.publish(
      OUTBOUND_TOPIC,
      JSON.stringify(wifi_update_message),
      { qos: 1 },
      (err) => {
        if (err) {
          console.error("Failed to publish to MQTT:", err);
          return res
            .status(500)
            .json({ error: "Failed to transmit WiFi credentials" });
        }

        console.log("Successfully published WiFi update message");
        return res
          .status(200)
          .json({ message: "WiFi credentials sent to Raspberry Pi" });
      }
    );
  } catch (error) {
    console.error("Error in updateWifi:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};
