var _ = require('underscore'),
		fs = require('fs'),
		path = require('path'),
		logger = require('./logger').logger;

(function () {
	"use strict";

	var testExtension = exports.testExtension = function (name) {
		logger.info("Testing extension: %s", name);
	  var Mocha = require('mocha');
	  var mocha = new Mocha;
	  
	  // use the method "addFile" on the mocha
	  // object for each file.
	  var extensionDir = path.join(__dirname, '../../../lib/extensions/', name);
	  fs.readdirSync(extensionDir).filter(function(file){
	    // Only keep the .js files
	    return file.substr(-3) === '.js';
	  }).forEach(function(file){
	    // add the file to mocha
	    mocha.addFile(
	      path.join(extensionDir, file)
	    );
	  });
	  
	  // run the tests.
	  mocha.run(function(failures){
	    process.on('exit', function () {
	      process.exit(failures);
	    });
	  });
	};
	
	exports.testAll = function () {
		logger.info('Testing all extensions.');
	  var extensionsDir = path.join(__dirname, '../../../lib/extensions/');
	  var dirs = fs.readdirSync(extensionsDir);
	  _.each(dirs, function (name) {
	    testExtension(name);
	  });  
	};

}());
