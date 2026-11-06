#!/bin/sh
# Startet als root nur, um die Rechte des Datenverzeichnisses zu korrigieren
# (Bind-Mounts gehören oft root oder – auf Synology – uid 1026), und wechselt
# dann zu einem unprivilegierten Benutzer (Standard: node, uid 1000).
set -e

if [ "$(id -u)" = "0" ]; then
    PUID="${PUID:-1000}"
    PGID="${PGID:-1000}"
    mkdir -p "${DATA_DIR:-/app/data}"
    chown -R "$PUID:$PGID" "${DATA_DIR:-/app/data}"
    exec su-exec "$PUID:$PGID" "$@"
fi

exec "$@"
