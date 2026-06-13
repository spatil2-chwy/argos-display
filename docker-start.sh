#!/bin/sh

# Create the env.js file with environment variables
echo "window.ENV = {" > /app/dist/env.js

# Process environment variables that start with VITE_
env | grep "^VITE_" | while IFS="=" read -r key value; do
  # Escape quotes and backslashes in the value for JavaScript
  escaped_value=$(printf '%s' "$value" | sed 's/\\/\\\\/g; s/"/\\"/g')
  printf '  %s: "%s",\n' "$key" "$escaped_value" >> /app/dist/env.js
done

echo "};" >> /app/dist/env.js

# Start the static frontend and local display-control API
export PORT="${PORT:-4173}"
exec npm run control
