const cds = require('@sap/cds');
const express = require('express');
const path = require('path');

cds.on('bootstrap', (app) => {
  // Tell Express to serve the entire "app" folder as static files
  const appPath = path.join(__dirname, '..', 'app');
  app.use(express.static(appPath));

  // Serve static files from app/resources if you moved them there
  app.use(express.static(path.join(appPath, 'resources')));

  // Fallback route: anytime root "/" is hit, send index.html
  app.get('/', (req, res) => {
    res.sendFile(path.join(appPath, 'index.html'));
  });
});

module.exports = cds.server;