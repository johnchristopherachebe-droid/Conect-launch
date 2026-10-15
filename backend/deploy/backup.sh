#!/usr/bin/env sh
# Daily database backup. Run from the backend folder; schedule with cron, e.g.:
#   0 2 * * * cd /home/you/Conect/backend && ./deploy/backup.sh
set -e
mkdir -p backups
docker compose --env-file .env.production -f docker-compose.prod.yml exec -T db \
  pg_dump -U conect conect | gzip > "backups/conect-$(date +%F).sql.gz"
find backups -name 'conect-*.sql.gz' -mtime +14 -delete
echo "Backup saved. Copy the backups folder off this server too."
