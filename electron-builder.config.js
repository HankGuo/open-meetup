/* eslint-disable @typescript-eslint/no-require-imports, no-undef */
// @ts-check

/**
 * electron-builder configuration for Open Meetup.
 *
 * Run from /electron via:
 *   npx electron-builder --config ../electron-builder.config.js
 */

const path = require('path');

/** @type {import('electron-builder').Configuration} */
const config = {
  appId: 'com.openmeetup.desktop',
  productName: 'Open Meetup',
  copyright: 'Copyright © 2024 Open Meetup',

  // electron-builder runs from ./electron, so directories are relative to it
  directories: {
    output: path.resolve(__dirname, 'dist-electron'),
    buildResources: path.resolve(__dirname, 'electron', 'build'),
  },

  files: [
    // Electron compiled output
    'dist/**/*',
    'package.json',
  ],

  extraResources: [
    // Bundle server dist + its production deps
    {
      from: path.resolve(__dirname, 'server', 'dist'),
      to: 'app/server/dist',
      filter: ['**/*'],
    },
    {
      from: path.resolve(__dirname, 'server', 'node_modules'),
      to: 'app/server/node_modules',
      filter: ['**/*'],
    },
    {
      from: path.resolve(__dirname, 'server', 'package.json'),
      to: 'app/server/package.json',
    },
    // Bundle client dist (static files)
    {
      from: path.resolve(__dirname, 'client', 'dist'),
      to: 'app/client/dist',
      filter: ['**/*'],
    },
  ],

  mac: {
    target: [
      {
        target: 'dmg',
        arch: ['x64', 'arm64'],
      },
    ],
    category: 'public.app-category.productivity',
  },

  dmg: {
    contents: [
      { x: 130, y: 220 },
      { x: 410, y: 220, type: 'link', path: '/Applications' },
    ],
  },

  win: {
    target: [
      {
        target: 'nsis',
        arch: ['x64'],
      },
    ],
  },

  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    installerIcon: undefined,
    uninstallerIcon: undefined,
    installerHeaderIcon: undefined,
  },

  linux: {
    target: ['AppImage'],
    category: 'Utility',
  },
};

module.exports = config;
/* eslint-enable @typescript-eslint/no-require-imports, no-undef */
