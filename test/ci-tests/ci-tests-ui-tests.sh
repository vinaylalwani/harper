#!/bin/bash
set -e

. /home/ubuntu/.nvm/nvm.sh
. /home/ubuntu/.nvm/bash_completion

pwd
ls -al /home/ubuntu/
cd /home/ubuntu/ui-tests/

echo "npm install..."
npm install

echo "Install Playwright Browsers"
npx playwright install --with-deps chromium

echo "Run Playwright tests for Self Hosted Cluster - Localhost harperdb"
npx playwright test tests/0007_self-hosted-cluster.spec.js
