#!/bin/bash
echo "Updating the XNP to latest version. Local commits will be stashed. Your config.json will be kept."
cd ~/xmr-node-proxy
git config --global user.email "you@example.com"
git config --global user.name "Your Name"
git stash
git checkout . &&\
git pull &&\
npm install &&\
echo "Proxy update finished ! You still need to restart the proxy by pm2 or add new parameters in config.json to use new features."
echo "Recommended command : pm2 restart proxy. However, you can use pm2 list to check."
