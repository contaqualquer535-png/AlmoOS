#!/usr/bin/env bash
# Aplica migrations + seed + testes num banco descartável e depois reverte
# tudo, conferindo que o schema volta a ficar vazio.
#
# Uso:  PGHOST=... PGPORT=... PGUSER=... ./scripts/verificar.sh
# Requer psql no PATH e permissão para criar/derrubar o banco de testes.

set -euo pipefail

DB="${DB:-cetec_test}"
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PSQL=(psql -v ON_ERROR_STOP=1 -q)

echo "→ recriando banco $DB"
"${PSQL[@]}" -d postgres -c "drop database if exists $DB;" -c "create database $DB;"

rodar() { "${PSQL[@]}" -d "$DB" -f "$1"; }

echo "→ bootstrap (objetos que o Supabase já fornece)"
rodar "$RAIZ/supabase/tests/00_bootstrap_supabase.sql"

echo "→ migrations"
for f in "$RAIZ"/supabase/migrations/*.sql; do
  echo "   $(basename "$f")"
  rodar "$f"
done

echo "→ seed"
rodar "$RAIZ/supabase/seed.sql"

echo "→ testes"
rodar "$RAIZ/supabase/tests/01_regras.sql"

echo "→ rollback (ordem inversa)"
for f in $(ls -r "$RAIZ"/supabase/rollback/*.sql); do
  echo "   $(basename "$f")"
  rodar "$f"
done

restantes=$("${PSQL[@]}" -d "$DB" -Atc \
  "select count(*) from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r','v');")

if [ "$restantes" -ne 0 ]; then
  echo "✗ rollback incompleto: $restantes objetos ainda em public"
  exit 1
fi

echo "✓ tudo aplicou, passou nos testes e reverteu limpo"
