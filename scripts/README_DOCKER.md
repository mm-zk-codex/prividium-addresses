# Docker Production Runbook

## Prerequisites

- Docker Engine
- Docker Compose plugin (`docker compose`)

## Deploy

1. Copy environment file and fill in secrets/RPC endpoints.

```bash
cp .env.example .env
```

2. Build production images.

```bash
docker compose build
```

3. Generate/update bridge config in the persistent config volume.

```bash
docker compose --profile init run --build --rm fetch-bridge-config
```

4. Start the stack.

```bash
docker compose up -d
```

5. Verify logs.

```bash
docker compose logs -f resolver
docker compose logs -f relayer-l1
docker compose logs -f relayer-l2
```

6. Upgrade.

```bash
docker compose pull && docker compose up -d --build
```

## Data persistence

- SQLite DB volume: `prividium_db` (mounted at `/data`, DB file `/data/db.sqlite`)
- Bridge config volume: `prividium_config` (mounted at `/config`, config file `/config/bridge-config.json`)

## Backups

Backup DB:

```bash
docker run --rm -v prividium_db:/data -v $(pwd):/backup alpine tar czf /backup/db-backup.tgz -C /data .
```

Backup bridge config:

```bash
docker run --rm -v prividium_config:/config -v $(pwd):/backup alpine tar czf /backup/config-backup.tgz -C /config .
```

## Security notes

- Resolver is not published to host ports; only the web service is public.
- Relayer private keys must be provided by environment variables only.
- Keep `.env` out of version control.
- Nginx can be extended with request-rate limits for `/api` if needed.
