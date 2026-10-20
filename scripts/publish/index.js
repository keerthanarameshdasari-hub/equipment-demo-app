/**
 * Adapter registry: the only place that knows which publishers exist.
 * Adding a real integration means adding an adapter here; workflows only pass
 * a target name.
 */
'use strict';

const { assertImplementsInterface } = require('./interface');
const { createMockPublisher } = require('./adapters/mock');
const { createStoreAdapter } = require('./adapters/store');

const TARGETS = ['mock', 'google-play', 'app-store-connect'];

function createPublisher(target, options = {}) {
  switch (target) {
    case 'mock':
      return assertImplementsInterface(createMockPublisher(options));
    case 'google-play':
    case 'app-store-connect':
      return assertImplementsInterface(createStoreAdapter(target, options));
    default:
      throw new Error(`Unknown publish target "${target}". Use one of: ${TARGETS.join(', ')}`);
  }
}

module.exports = { createPublisher, TARGETS };
