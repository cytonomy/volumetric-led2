#!/bin/bash
# volumetric-led2 — double-click to launch fullscreen
set -e
cd "$(dirname "$0")"

if [ ! -d node_modules ]; then npm install; fi
if [ ! -d dist ]; then npm run build; fi

PORT=4173
npx --yes serve -l $PORT -s dist >/dev/null 2>&1 &
SERVER_PID=$!
caffeinate -d -i &
CAFF_PID=$!

cleanup() { kill $SERVER_PID $CAFF_PID 2>/dev/null || true; exit 0; }
trap cleanup EXIT INT TERM

sleep 1

CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
if [ ! -x "$CHROME" ]; then
  echo "Chrome not found at $CHROME; opening in default browser instead."
  open "http://localhost:$PORT"
  wait
  exit 0
fi

"$CHROME" \
  --app="http://localhost:$PORT" \
  --start-fullscreen \
  --kiosk \
  --user-data-dir=/tmp/volumetric-led2-chrome \
  --disable-pinch \
  --overscroll-history-navigation=0 \
  --autoplay-policy=no-user-gesture-required

cleanup
