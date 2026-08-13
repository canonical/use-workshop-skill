// SPDX-License-Identifier: GPL-3.0-only
// Copyright 2026 Canonical Ltd.
// Dev server on port 8123 (the onboarding tunnel candidate).
'use strict';
const http = require('node:http');
const port = process.env.PORT || 8123;
http
  .createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('mini-node ok\n');
  })
  .listen(port, () => console.log(`listening on ${port}`));
