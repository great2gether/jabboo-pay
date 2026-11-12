#!/bin/sh
# Plays the video demo by itself: starts the server if needed and opens the page in demo mode.
cd "$(dirname "$0")/.." || exit 1
if ! curl -s -o /dev/null http://localhost:4242/api/health; then
  node bin/jabboo-pay.js serve > /tmp/jabboo-pay-demo.log 2>&1 &
  sleep 1.5
fi
URL="http://localhost:4242/?demo=1"
if [ -d "/Applications/Google Chrome.app" ]; then
  open -na "Google Chrome" --args --new-window --start-fullscreen --user-data-dir=/tmp/jabboo-pay-demo-chrome --no-first-run "$URL"
else
  open -a Safari "$URL"
fi
echo "Click ▶ Start demo (or press Enter) in the browser."
