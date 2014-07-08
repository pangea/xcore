#!/usr/bin/env node

var logger = require('winston');

/** Enable color for the logger. */
logger.remove(logger.transports.Console);
logger.add(logger.transports.Console, {colorize: true});

module.exports.logger = logger;
