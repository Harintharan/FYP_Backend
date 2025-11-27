# Sensor Data Simulator

Simulate real-time IoT sensor data transmission for supply chain package tracking.

## Features

- 📍 **GPS Tracking**: Simulates movement along predefined routes
- 🌡️ **Temperature Monitoring**: Configurable normal and breach scenarios
- 🚪 **Door Tamper Detection**: Random open/close events
- 💧 **Humidity Sensing**: Realistic humidity variations
- ⏱️ **Configurable Intervals**: Send data every N seconds
- 🔄 **Continuous Operation**: Run for specific duration or indefinitely

## Usage

### Node.js Simulator

```bash
# Basic usage (default settings)
node test/sensor-simulator.js

# Custom interval (send every 30 seconds)
node test/sensor-simulator.js --interval 30

# Run for specific duration (10 minutes)
node test/sensor-simulator.js --duration 10

# Include temperature breach scenario
node test/sensor-simulator.js --breach-scenario

# Use different route
node test/sensor-simulator.js --route colombo-jaffna

# Full example
node test/sensor-simulator.js --package-id 30c8995e-b8e9-40ef-9908-f38222d4cd5d --interval 60 --duration 30 --breach-scenario --route colombo-kandy
```

### Options

| Option                 | Description                  | Default       |
| ---------------------- | ---------------------------- | ------------- |
| `--package-id <uuid>`  | Package ID to simulate       | Random UUID   |
| `--interval <seconds>` | Time between transmissions   | 60 seconds    |
| `--duration <minutes>` | How long to run              | Infinite      |
| `--breach-scenario`    | Include temperature breaches | Disabled      |
| `--route <name>`       | Route to simulate            | colombo-kandy |

### Available Routes

1. **colombo-kandy**: Colombo Port → Kaduwela → Kadugannawa → Kandy (6 waypoints)
2. **colombo-jaffna**: Colombo → Kurunegala → Anuradhapura → Jaffna (5 waypoints)
3. **local**: Short test route (4 waypoints)

## Sensor Data Generated

Each transmission includes approximately **18 sensor readings** spread over 60 seconds:

- **GPS**: 4 readings (every 15 seconds)
- **Temperature**: 18 readings (every 3 seconds)
- **Humidity**: 2 readings (every 30 seconds)
- **Door**: 3 readings (every 20 seconds)

## Temperature Scenarios

### Normal Operation

- Temperature stays mostly within 2-8°C range
- Small random variations (±2°C)

### Breach Scenario (`--breach-scenario`)

- **Minutes 0-5**: Normal (4-7°C)
- **Minutes 5-10**: Gradual increase to 14°C (breach!)
- **Minutes 10-15**: Return to normal
- **Minutes 15-20**: Normal operation
- **Minutes 20-25**: Cold breach (down to 0°C)
- **Minutes 25+**: Recovery to 5°C

## Example Output

```
╔════════════════════════════════════════════════════════════╗
║        IoT Sensor Data Simulator - Supply Chain           ║
╚════════════════════════════════════════════════════════════╝

Configuration:
  Package ID: 30c8995e-b8e9-40ef-9908-f38222d4cd5d
  Route: colombo-kandy (6 waypoints)
  Interval: 60s
  Duration: Infinite
  Breach Scenario: YES
  API: http://localhost:5000/api/telemetry

Starting simulation... (Press Ctrl+C to stop)

[2025-11-27T00:00:00.000Z] Transmission #1
  GPS: 6.927079, 79.861244
  Temperature: 5.2°C
  Door: Closed
  Readings: 18
  ✅ Success - Breaches detected: 0

[2025-11-27T00:01:00.000Z] Transmission #2
  GPS: 6.930250, 79.865123
  Temperature: 6.1°C
  Door: Closed
  Readings: 18
  ✅ Success - Breaches detected: 0

[2025-11-27T00:06:00.000Z] Transmission #7
  GPS: 6.945120, 79.890456
  Temperature: 10.2°C
  Door: Open
  Readings: 18
  ✅ Success - Breaches detected: 2
     🚨 TEMPERATURE_EXCURSION - Severity: MEDIUM
     🚨 DOOR_TAMPER - Severity: HIGH
```

## Authentication

The simulator uses a JWT token for authentication. Update the token in the script if needed:

```javascript
authToken: "your-jwt-token-here";
```

Get a token by logging in through the web interface or API.

## Integration Testing

Use the simulator to test:

1. **Breach Detection**: Enable `--breach-scenario` to verify temperature breach detection
2. **GPS Tracking**: Verify location updates along the route
3. **Door Tamper**: Check door open/close event handling
4. **High Volume**: Reduce `--interval` to test system under load
5. **Long Duration**: Use `--duration 1440` for 24-hour simulation

## Troubleshooting

### Connection Refused

```bash
# Ensure backend is running
cd Backend
npm run dev
```

### Authentication Error (401)

Update the `authToken` in the script with a valid JWT token

### No Breaches Detected

- Ensure product requirements are set (2-8°C for Pfizer)
- Use `--breach-scenario` flag
- Check backend logs for breach detection output

## Advanced Usage

### Custom Package Testing

```bash
# Test specific package
node test/sensor-simulator.js --package-id <your-package-id>
```

### Load Testing

```bash
# High-frequency testing (every 10 seconds)
node test/sensor-simulator.js --interval 10

# Multiple concurrent simulations
node test/sensor-simulator.js --package-id pkg-1 &
node test/sensor-simulator.js --package-id pkg-2 &
node test/sensor-simulator.js --package-id pkg-3 &
```

### Continuous Monitoring

```bash
# Run overnight
nohup node test/sensor-simulator.js --duration 1440 > simulation.log 2>&1 &
```
