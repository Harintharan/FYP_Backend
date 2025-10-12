# Pinata Proxy Configuration Guide

This guide explains how to easily switch between using a proxy and direct connection for Pinata IPFS uploads.

## 📁 Environment Files

- `.env.ganache` - Main environment file (with proxy enabled by default)
- `.env.ganache.noproxy` - Environment file configured for direct connection

## ⚙️ Configuration Options

### Environment Variables

| Variable           | Description                | Values                      |
| ------------------ | -------------------------- | --------------------------- |
| `PINATA_USE_PROXY` | Enable/disable proxy usage | `true` or `false`           |
| `PINATA_PROXY_URL` | Proxy server URL           | `http://10.50.225.222:3128` |
| `PINATA_JWT`       | Pinata JWT token           | Your JWT token              |

### Current Settings

- **Proxy URL**: `http://10.50.225.222:3128`
- **Default Mode**: Proxy enabled (`PINATA_USE_PROXY=true`)

## 🚀 Quick Start Methods

### Method 1: Using NPM Scripts (Recommended)

```bash
# Run with proxy enabled
npm run dev:proxy

# Run without proxy
npm run dev:noproxy

# Start production with proxy
npm run start:proxy

# Start production without proxy
npm run start:noproxy
```

### Method 2: Using the Toggle Utility

```bash
# Enable proxy
node scripts/toggle-proxy.js on

# Disable proxy
node scripts/toggle-proxy.js off

# Check current status
node scripts/toggle-proxy.js status

# Then run normally
npm run dev
```

### Method 3: Manual Environment Variable

```bash
# Enable proxy for this session only
set PINATA_USE_PROXY=true && npm run dev

# Disable proxy for this session only
set PINATA_USE_PROXY=false && npm run dev
```

### Method 4: Edit Environment File Directly

Edit `.env.ganache` and change:

```bash
# Enable proxy
PINATA_USE_PROXY=true

# Disable proxy
PINATA_USE_PROXY=false
```

## 🔍 Checking Proxy Status

When the server starts, you'll see one of these messages:

- `🌐 Configured Pinata to use proxy: http://10.50.225.222:3128` - Proxy enabled
- `🚫 Proxy available but disabled: http://10.50.225.222:3128` - Proxy available but disabled
- `🌍 Pinata configured for direct connection (no proxy)` - No proxy configured

## 🔧 Troubleshooting

### Common Issues

1. **"fetch failed" error**: Usually indicates proxy connectivity issues

   - Try disabling proxy: `node scripts/toggle-proxy.js off`
   - Check if proxy server is accessible

2. **Proxy not working**:

   - Verify `PINATA_USE_PROXY=true` in your environment file
   - Check proxy URL format: `http://host:port`
   - Ensure proxy server is running

3. **Direct connection fails**:
   - Try enabling proxy if you're behind a corporate firewall
   - Check internet connectivity

### Debug Information

The service logs detailed information:

- `📤 Attempting to upload to Pinata: [filename]` - Upload started
- `✅ Successfully uploaded to Pinata: [CID]` - Upload successful
- `❌ Pinata upload failed:` - Upload failed with details

## 📝 Configuration Examples

### Corporate Network (with proxy)

```bash
PINATA_USE_PROXY=true
PINATA_PROXY_URL=http://10.50.225.222:3128
```

### Home/Direct Internet (no proxy)

```bash
PINATA_USE_PROXY=false
# PINATA_PROXY_URL can be omitted or left empty
```

### Dynamic Switching

```bash
# Keep both settings, toggle PINATA_USE_PROXY as needed
PINATA_USE_PROXY=true  # Change to false when not needed
PINATA_PROXY_URL=http://10.50.225.222:3128
```
