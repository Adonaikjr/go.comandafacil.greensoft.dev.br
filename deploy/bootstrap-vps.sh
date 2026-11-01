#!/usr/bin/env bash
set -Eeuo pipefail

VPS_HOST="comandafacil.greensoft.dev.br"
VPS_USER="dev-comandafacil-greensoft"
VPS_PORT="22"
VPS_PATH="/home/dev-comandafacil-greensoft/htdocs/comandafacil.greensoft.dev.br"
KEY_PATH="$HOME/.ssh/comandafacil-vps-deploy"

if [[ ! -f .env ]]; then
  echo "Run this script from the project root, where the ignored .env file exists." >&2
  exit 1
fi

if ! command -v ssh >/dev/null || ! command -v scp >/dev/null || ! command -v ssh-copy-id >/dev/null; then
  echo "The local machine must have ssh, scp and ssh-copy-id installed." >&2
  exit 1
fi

install -d -m 700 "$HOME/.ssh"
if [[ ! -f "$KEY_PATH" ]]; then
  ssh-keygen -t ed25519 -C "comandafacil-vps-deploy" -f "$KEY_PATH" -N ""
fi

echo "Install the deploy public key on the VPS; SSH may ask for the account password once."
ssh-copy-id -i "$KEY_PATH.pub" -p "$VPS_PORT" "$VPS_USER@$VPS_HOST"

SSH_OPTIONS=(-i "$KEY_PATH" -p "$VPS_PORT" -o IdentitiesOnly=yes)
echo "Create the app directory and copy the ignored local .env directly to the VPS."
ssh "${SSH_OPTIONS[@]}" "$VPS_USER@$VPS_HOST" "mkdir -p '$VPS_PATH'"
scp -i "$KEY_PATH" -P "$VPS_PORT" .env "$VPS_USER@$VPS_HOST:$VPS_PATH/.env"

ssh "${SSH_OPTIONS[@]}" "$VPS_USER@$VPS_HOST" \
  "APP_PATH='$VPS_PATH' bash -s" <<'REMOTE'
set -Eeuo pipefail

cd "$APP_PATH"
sed -i '/^PORT=/d' .env
printf 'PORT=5000\n' >> .env
chmod 600 .env

if [[ -d "$HOME/.nvm/versions/node" ]]; then
  NODE_BIN_DIR="$(find "$HOME/.nvm/versions/node" -mindepth 3 -maxdepth 3 -type f -path '*/bin/node' -printf '%h\n' | sort -V | tail -n 1)"
  if [[ -n "$NODE_BIN_DIR" ]]; then
    export PATH="$NODE_BIN_DIR:$PATH"
  fi
fi

if ! command -v node >/dev/null || ! command -v npm >/dev/null; then
  echo "Node.js and npm must be available to the CloudPanel site user." >&2
  exit 1
fi

if ! command -v pm2 >/dev/null; then
  npm install --global pm2
fi

pm2 save

if command -v sudo >/dev/null && sudo -n true 2>/dev/null; then
  sudo env "PATH=$PATH" "$(command -v pm2)" startup systemd -u "$(id -un)" --hp "$HOME"
  echo "PM2 startup has been registered. The deploy workflow will save the app process after its first deployment."
else
  pm2 startup systemd -u "$(id -un)" --hp "$HOME"
  echo "Run the sudo command printed above once as a VPS administrator to enable PM2 at boot."
fi
REMOTE

echo "Add the private key at $KEY_PATH as the GitHub Actions secret VPS_SSH_PRIVATE_KEY."
echo "Add the verified VPS host key as the GitHub Actions variable VPS_KNOWN_HOSTS."
echo "Initial VPS preparation completed."
