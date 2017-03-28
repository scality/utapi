#!/usr/bin/env node
'use strict'; // eslint-disable-line strict

require('babel-core/register');
require('../src/lib/utilities.js').listMetrics();
