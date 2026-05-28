# Homelab Docs Site

Technical documentation for the homelab, built with [Docusaurus](https://docusaurus.io/).

## Development

```bash
cd docs-site
npm install
npm start        # Dev server on http://localhost:3001
```

## Build

```bash
npm run build    # Requires Node.js ≤ 22 (Docusaurus 3.x)
npm run serve    # Preview production build
```

## Structure

```
docs/
├── index.md                    # Landing page
├── architecture/
│   ├── overview.md             # Hardware, software stack, design decisions
│   ├── networking.md           # Cilium, DNS, Tailscale, TLS
│   └── pki.md                  # Certificate management
├── services/
│   ├── media.md                # Jellyfin
│   ├── monitoring.md           # Grafana + Prometheus
│   ├── home-automation.md      # Home Assistant, Zigbee, MQTT
│   └── storage.md              # Longhorn, oCIS, MinIO
└── operations/
    ├── backup.md               # 3-tier backup strategy
    ├── dns.md                  # DNS configuration
    └── troubleshooting.md      # Common issues & useful commands
```
