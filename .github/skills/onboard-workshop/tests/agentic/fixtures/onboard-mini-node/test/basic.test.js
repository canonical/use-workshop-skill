// SPDX-License-Identifier: GPL-3.0-only
// Copyright 2026 Canonical Ltd.
'use strict';
const test = require('node:test');
const assert = require('node:assert');

test('arithmetic sanity', () => {
  assert.strictEqual(1 + 1, 2);
});
