// SPDX-License-Identifier: GPL-3.0-only
// Copyright 2026 Canonical Ltd.
// Minimal build step: stamp a dist/ artifact.
'use strict';
const fs = require('node:fs');
fs.mkdirSync('dist', { recursive: true });
fs.writeFileSync('dist/build-info.json', JSON.stringify({ built: true }));
console.log('build ok');
