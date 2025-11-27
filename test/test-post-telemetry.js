import fetch from "node-fetch";
import fs from "fs";

const token = process.env.TEST_JWT;
const payloadFile = process.env.PAYLOAD_FILE || "./test-payload.json";
const url = process.env.TELEMETRY_URL || "http://localhost:5000/api/telemetry";

const payload = JSON.parse(fs.readFileSync(payloadFile, "utf8"));

(async () => {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
    const body = await res.json();
    console.log(res.status, body);
  } catch (err) {
    console.error("POST failed", err);
  }
})();
