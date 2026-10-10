#!/bin/sh
set -eu
cd /workspace/polina-russian-site
export npm_config_cache=/workspace/.cache/npm
export npm_config_update_notifier=false
node -e 'if (Number(process.versions.node.split(".")[0]) !== 24) { console.error("Use the tested Node.js 24 toolchain; see .node-version"); process.exit(1); }'
node -e 'const {execFileSync}=require("node:child_process"); if(Number(execFileSync("npm",["--version"],{encoding:"utf8"}).split(".")[0])!==11){console.error("Use npm 11 with this environment");process.exit(1);}'
git --version
docker info --format '{{.ServerVersion}}'
docker compose version
npm ci --no-fund --no-audit
npm run setup:env
npm run db:up
npm run db:migrate
npm run seed
npm run typecheck
npm run lint
npm run build
