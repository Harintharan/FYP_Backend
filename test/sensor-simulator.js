#!/usr/bin/env node
/**
 * IoT Sensor Data Simulator
 * Simulates real-time sensor data transmission for supply chain packages
 *
 * Usage:
 *   node sensor-simulator.js [options]
 *
 * Options:
 *   --package-id <uuid>     Package ID to simulate (default: random)
 *   --interval <seconds>    Interval between transmissions (default: 60)
 *   --duration <minutes>    How long to run simulation (default: infinite)
 *   --breach-scenario       Include temperature breach scenarios
 *   --route <name>          Predefined route: colombo-kandy, colombo-jaffna, local
 */

import https from "https";

// Configuration
const config = {
  packageId: process.argv.includes("--package-id")
    ? process.argv[process.argv.indexOf("--package-id") + 1]
    : "30c8995e-b8e9-40ef-9908-f38222d4cd5d", // Default test package

  interval: process.argv.includes("--interval")
    ? parseInt(process.argv[process.argv.indexOf("--interval") + 1]) * 1000
    : 60000, // 60 seconds default

  duration: process.argv.includes("--duration")
    ? parseInt(process.argv[process.argv.indexOf("--duration") + 1]) * 60000
    : null, // Run forever by default

  breachScenario: process.argv.includes("--breach-scenario"),

  route: process.argv.includes("--route")
    ? process.argv[process.argv.indexOf("--route") + 1]
    : "colombo-kandy",

  apiUrl: "http://localhost:5000/api/telemetry",

  // JWT token - replace with your actual token
  authToken:
    "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiTUFOVUZBQ1RVUkVSIiwidXVpZCI6IjJlYjFhMTMxLTEwOTItNDUwMC1iZTNkLTRlODdhNWE5NWQ3MyIsImlhdCI6MTc2NDE3NTY0NiwiZXhwIjoxNzY0MjYyMDQ2LCJzdWIiOiIweDZiMGY2QmM1MTE5MWUwZTM4MGQ1MUNiMDJFOTE4N2VlMEIyMWUzNjYifQ.XF9Z3O4Y15aKMv3sfcWwMwEOT2R8H99q2IJ2qJT1w8S75O4wmQYckiMUWKW8wBs05_Po_U8PKm0W9aJymta0xP96OzKdl0cFwbfuThwjxgCRj2e9uxpjvCL2kcfCb2K9X9uurWSF3D8QJz6ka6haYTGLkoFlRjnDZs-aGxfceiOyphzMbj12YYAnOUE7jr39GUvo8WgRymaaCm1abpoiWqW774Og45WuvlDlKWWi1c6mfqXFUOTsSj20TqQkOHdYN7se6ewxYpxgUOVjMtE_tM-ip1pr59380tc3owEJTgkH3ddAHrrUd5FiqXk86XS-FrWiAe1UmRDFKN-MqlQBxw",

  macAddress: "AC:DE:48:00:11:22",
  ipAddress: "192.168.1.100",
};

// Predefined routes (GPS waypoints)
const routes = {
  "colombo-kandy": [
    { lat: 6.927079, lon: 79.861244, name: "Colombo Port" },
    { lat: 6.933654, lon: 79.877679, name: "Colombo Fort" },
    { lat: 6.954896, lon: 79.972359, name: "Kaduwela" },
    { lat: 7.073408, lon: 80.239273, name: "Kadugannawa" },
    { lat: 7.246174, lon: 80.592216, name: "Peradeniya" },
    { lat: 7.290572, lon: 80.633728, name: "Kandy" },
  ],
  "colombo-jaffna": [
    { lat: 6.927079, lon: 79.861244, name: "Colombo" },
    { lat: 7.489717, lon: 80.363633, name: "Kurunegala" },
    { lat: 8.33544, lon: 80.403484, name: "Anuradhapura" },
    { lat: 9.264134, lon: 80.407535, name: "Vavuniya" },
    { lat: 9.661497, lon: 80.025607, name: "Jaffna" },
  ],
  local: [
    { lat: 6.08025, lon: 80.19345, name: "Start Point" },
    { lat: 6.08035, lon: 80.19355, name: "Checkpoint 1" },
    { lat: 6.08045, lon: 80.19365, name: "Checkpoint 2" },
    { lat: 6.08055, lon: 80.19375, name: "End Point" },
  ],
};

// Simulation state
const state = {
  currentWaypointIndex: 0,
  currentPosition: { ...routes[config.route][0] },
  doorOpen: false,
  temperature: 5.0, // Start at normal temp
  humidity: 45,
  transmissionCount: 0,
  startTime: Date.now(),
  breachPhase: 0, // For breach scenario
};

/**
 * Interpolate between two GPS points
 */
function interpolateGPS(from, to, progress) {
  return {
    lat: from.lat + (to.lat - from.lat) * progress,
    lon: from.lon + (to.lon - from.lon) * progress,
  };
}

/**
 * Update GPS position along route
 */
function updateGPSPosition() {
  const route = routes[config.route];
  const totalWaypoints = route.length - 1;

  // Calculate progress (0 to 1) based on transmission count
  const totalTransmissions = config.duration
    ? Math.floor(config.duration / config.interval)
    : 100; // Arbitrary number for infinite duration

  const overallProgress = Math.min(
    state.transmissionCount / totalTransmissions,
    1
  );
  const waypointProgress = overallProgress * totalWaypoints;

  state.currentWaypointIndex = Math.floor(waypointProgress);
  const segmentProgress = waypointProgress - state.currentWaypointIndex;

  if (state.currentWaypointIndex < totalWaypoints) {
    const from = route[state.currentWaypointIndex];
    const to = route[state.currentWaypointIndex + 1];
    state.currentPosition = interpolateGPS(from, to, segmentProgress);
  } else {
    state.currentPosition = route[totalWaypoints];
  }

  return {
    lat: state.currentPosition.lat.toFixed(6),
    lon: state.currentPosition.lon.toFixed(6),
  };
}

/**
 * Simulate temperature with optional breach scenario
 */
function getTemperature() {
  if (!config.breachScenario) {
    // Normal operation: mostly within 2-8°C range
    const normal = 5.0 + (Math.random() - 0.5) * 4; // 3-7°C mostly
    state.temperature = normal;
    return normal.toFixed(1);
  }

  // Breach scenario: cycle through different phases
  const elapsedMinutes = (Date.now() - state.startTime) / 60000;

  if (elapsedMinutes < 5) {
    // Phase 0-5min: Normal temperature
    state.temperature = 4.0 + Math.random() * 3; // 4-7°C
  } else if (elapsedMinutes < 10) {
    // Phase 5-10min: Gradual increase (breach)
    state.temperature = 8.0 + (elapsedMinutes - 5) * 1.2; // 8-14°C
  } else if (elapsedMinutes < 15) {
    // Phase 10-15min: Return to normal
    state.temperature = 14.0 - (elapsedMinutes - 10) * 2; // 14-4°C
  } else if (elapsedMinutes < 20) {
    // Phase 15-20min: Normal
    state.temperature = 5.0 + Math.random() * 2; // 5-7°C
  } else if (elapsedMinutes < 25) {
    // Phase 20-25min: Cold breach
    state.temperature = 2.0 - (elapsedMinutes - 20) * 0.4; // 2 to 0°C
  } else {
    // Phase 25+: Recovery
    state.temperature = Math.min(5.0, state.temperature + 0.5);
  }

  return state.temperature.toFixed(1);
}

/**
 * Simulate door status (random open/close events)
 */
function getDoorStatus() {
  // 5% chance of door event
  if (Math.random() < 0.05) {
    state.doorOpen = !state.doorOpen;
  }
  return state.doorOpen ? "Open" : "Closed";
}

/**
 * Simulate humidity
 */
function getHumidity() {
  state.humidity += (Math.random() - 0.5) * 5; // Gradual change
  state.humidity = Math.max(30, Math.min(70, state.humidity)); // Clamp 30-70%
  return Math.round(state.humidity).toString();
}

/**
 * Generate sensor data for current transmission
 */
function generateSensorData() {
  const now = Math.floor(Date.now() / 1000);
  const gps = updateGPSPosition();
  const sensorData = [];

  // Generate ~18 readings spread over the last minute
  for (let i = 0; i < 18; i++) {
    const timestamp = now - (60 - i * 3); // Spread over 60 seconds

    // GPS reading every 15 seconds (4 times per minute)
    if (i % 5 === 0) {
      const drift = (Math.random() - 0.5) * 0.0001; // Small GPS drift
      sensorData.push({
        sensorType: "GPS",
        data: `${(parseFloat(gps.lat) + drift).toFixed(6)},${(
          parseFloat(gps.lon) + drift
        ).toFixed(6)}`,
        timestamp: timestamp + (i % 3),
      });
    }

    // Temperature reading every 3 seconds
    if (i % 1 === 0) {
      sensorData.push({
        sensorType: "Temperature",
        data: getTemperature(),
        timestamp: timestamp + i,
      });
    }

    // Humidity every 30 seconds
    if (i % 10 === 0) {
      sensorData.push({
        sensorType: "Humidity",
        data: getHumidity(),
        timestamp: timestamp + i,
      });
    }

    // Door status every 20 seconds
    if (i % 7 === 0) {
      sensorData.push({
        sensorType: "Door",
        data: getDoorStatus(),
        timestamp: timestamp + i,
      });
    }
  }

  return sensorData.sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Send telemetry data to API
 */
async function sendTelemetry() {
  const payload = {
    packageId: config.packageId,
    macAddress: config.macAddress,
    ipAddress: config.ipAddress,
    requestSendTimeStamp: new Date().toISOString(),
    sensorData: generateSensorData(),
  };

  console.log(
    `\n[${new Date().toISOString()}] Transmission #${
      state.transmissionCount + 1
    }`
  );
  console.log(
    `  GPS: ${state.currentPosition.lat.toFixed(
      6
    )}, ${state.currentPosition.lon.toFixed(6)}`
  );
  console.log(`  Temperature: ${state.temperature.toFixed(1)}°C`);
  console.log(`  Door: ${state.doorOpen ? "OPEN" : "Closed"}`);
  console.log(`  Readings: ${payload.sensorData.length}`);

  try {
    const response = await fetch(config.apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.authToken}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`  ❌ API Error (${response.status}): ${error}`);
      return;
    }

    const result = await response.json();
    console.log(
      `  ✅ Success - Breaches detected: ${result.breaches?.length || 0}`
    );

    if (result.breaches && result.breaches.length > 0) {
      result.breaches.forEach((breach) => {
        if (breach.breach_type) {
          console.log(
            `     🚨 ${breach.breach_type} - Severity: ${breach.severity}`
          );
        } else {
          console.log(
            `     🚨 Temperature breach: ${breach.values?.join(", ")}°C`
          );
        }
      });
    }

    state.transmissionCount++;
  } catch (error) {
    console.error(`  ❌ Network Error: ${error.message}`);
  }
}

/**
 * Main simulation loop
 */
async function runSimulation() {
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║        IoT Sensor Data Simulator - Supply Chain           ║");
  console.log("╚════════════════════════════════════════════════════════════╝");
  console.log(`\nConfiguration:`);
  console.log(`  Package ID: ${config.packageId}`);
  console.log(
    `  Route: ${config.route} (${routes[config.route].length} waypoints)`
  );
  console.log(`  Interval: ${config.interval / 1000}s`);
  console.log(
    `  Duration: ${
      config.duration ? config.duration / 60000 + " minutes" : "Infinite"
    }`
  );
  console.log(`  Breach Scenario: ${config.breachScenario ? "YES" : "NO"}`);
  console.log(`  API: ${config.apiUrl}`);
  console.log(`\nStarting simulation... (Press Ctrl+C to stop)`);

  // Initial transmission
  await sendTelemetry();

  // Set up interval
  const intervalId = setInterval(async () => {
    await sendTelemetry();

    // Check if duration limit reached
    if (config.duration && Date.now() - state.startTime >= config.duration) {
      clearInterval(intervalId);
      console.log("\n✓ Simulation completed");
      process.exit(0);
    }
  }, config.interval);

  // Handle Ctrl+C
  process.on("SIGINT", () => {
    clearInterval(intervalId);
    console.log("\n\n✓ Simulation stopped by user");
    console.log(`Total transmissions: ${state.transmissionCount}`);
    process.exit(0);
  });
}

// Start the simulation
runSimulation().catch(console.error);
