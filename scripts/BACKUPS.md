# LLMStore Server Backups

Daily server backups are stored in:

`/var/backups/llmstore/YYYY-MM-DD`

Each dated folder contains:

- `db/llmstore.dump` — PostgreSQL dump in `pg_dump --format=custom`
- `uploads/chat/` — uploaded chat files needed to restore chat attachments
- `manifest.json` — metadata about the backup

Install daily cron job on the server:

```bash
cd /var/www/llmstore.pro
bash scripts/install-server-backup-cron.sh
```

Create a backup manually:

```bash
cd /var/www/llmstore.pro
bash scripts/server-backup.sh
```

Restore to a specific date:

```bash
cd /var/www/llmstore.pro
bash scripts/server-restore.sh 2026-04-01 --yes
```

Notes:

- restore overwrites the current database and `uploads/chat`
- backups keep the latest 3 daily folders by default
- backend health is checked automatically after restore
