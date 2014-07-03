var _				= require('underscore'),
		path		= require('path'),
		exec		= require('child_process').exec,
		fs			= require('fs'),
		logger	= require('./logger').logger;

(function () {
	"use strict";

	var getExtensionManifests = function() {
	  var extensionDirs = fs.readdirSync(path.join(__dirname, '../../../lib/extensions')),
	      manifests = {};
	
	  _.each(extensionDirs, function(dir, idx, dirs) {
	    if (dir == '.git') { return true; }
	    try {
	    var contents = fs.readFileSync(path.join(
	      __dirname,'../../../lib/extensions', dir, '/database/source/manifest.js'), 'utf8'),
	      manifest = JSON.parse(contents);
	
	      manifests[manifest.name] = manifest;
	    } catch (err) {
	      logger.error(err);
	    }
	  });
	
	  return manifests;
	};
	
	var copyClientCode = function(callback) {
	  copyApplicationCode(callback);
	};
	
	var copyApplicationCode = function(callback) {
	  logger.info('Generating tools package.');
	  // TODO: Better way to load tools
	  var toolsPackage = 'enyo.depends(\n';
	  toolsPackage += '"' + path.join(__dirname, '../../../node_modules/underscore/underscore-min.js') + '"';
	  toolsPackage += '\n);';
	
	  fs.writeFileSync(path.join(__dirname, '../../../lib/client/source/tools/package.js'), toolsPackage);
	
	  logger.info('Copying application code into client.');
	  exec('cp ' + path.join(__dirname, '../../../source/app.js') + ' ' + path.join(__dirname, '../../../lib/client/source'),
	       function(err, stout, stderr) {
	         if(err) {
	           logger.error(err);
	           logger.error(stderr);
	           process.exit(1);
	         }
	
	         copyExtensionCode(callback);
	       });
	};
	
	// Copies client code from the extensions into lib/client.
	var copyExtensionCode = function (callback) {
	  // Collect all the extension manifest and and sort by load order.
	  logger.info("Copying extensions into client.");
	  var manifests = getExtensionManifests(),
	      buildPackageString = function (files) {
	        var dependList = '';
	        _.each(files, function (f) {
	          if (f !== 'package.js') {
	            dependList += '"'+f+'"';
	
	            if (f !== _.last(files)) {
	              dependList += ',';
	            }
	
	            dependList += '\n';
	          }
	        });
	        return dependList;
	      };
	
	  _.each(manifests, function(manifest) {
	    if(manifest.dependencies) {
	      _.each(manifest.dependencies, function (depName) {
	        var depManifest = manifests[depName];
	        if(depManifest.loadOrder > manifest.loadOrder) {
	          logger.error(
	            "Extension '%s' has a load order of %s. It's dependent '%s' has a load order of %s. " +
	            "Extensions can't have a lower load order than their dependencies.",
	            manifest.name, manifest.loadOrder, depManifest.name, depManifest.loadOrder
	          );
	          process.exit(1);
	        }
	      });
	    }
	  });
	
	  manifests = _.sortBy(manifests, 'loadOrder');
	
	  // Copy assets to the appropriate places
	  _.each(manifests, function(manifest) {
	    var clientCodeDir = path.join(__dirname, '../../../lib/extensions', manifest.name, 'client');
	    var dirs = fs.readdirSync(clientCodeDir);
	
	    if (_.contains(dirs, 'assets')) {
	      var idx = _.indexOf(dirs, 'assets');
	      dirs.splice(idx, 1);
	
	      exec('cp -R ' + path.join(__dirname, '../../../lib/extensions', manifest.name ,'client/assets/*') +
	           ' ' + path.join(__dirname, '../../../lib/client/assets/'),
	           function (err, stdout, stderr) {
	             if (err !== null) {
	               logger.error(err);
	               process.exit(1);
	             }
	           });
	
	      exec('cp -R ' + path.join(__dirname, '../../../lib/extensions', manifest.name ,'client/assets') +
	           ' ' + path.join(__dirname, '../../../node-datasource/public/images', manifest.name),
	           function (err, stdout, stderr) {
	             if (err !== null) {
	               logger.error(err);
	               process.exit(1);
	             }
	           });
	
	    }
	  });
	
	  var extPackage = 'enyo.depends(\n';
	  _.reduce(manifests, function(pkg, manifest, index) {
	    pkg += '"' + path.join(__dirname, '../../../lib/extensions', manifest.name, 'client') + '"';
	    if(index !== manifests.length) {
	      pkg += ',';
	    }
	    return pkg + '\n';
	  }, extPackage);
	  extPackage += ');';
	
	  fs.writeFile(path.join(__dirname, '../../../lib/client/extensions'), extPackage, callback);
	};
	
	/**
	  * Link extension client code to enyo's lib folder then run the enyo deploy.sh
	  * script. The compiled client code should be in the lib/client/build folder.
	*/
	exports.buildClient = function () {
	  logger.info("Attempting to build client code.");
	
	  // Copy the extension client code into lib/client.
	  copyClientCode(function () {
	    var deployScript = path.join(__dirname, '../../../lib/client/tools/deploy.sh -T');
	    logger.info("Executing build...");
	    exec(deployScript, function(err, stdout, stderr) {
	      if (err !== null) {
	        logger.error(err);
					process.exit(1);
	      }
	      if (stderr) {
	        logger.error(stderr)
					process.exit(1);
	      }
	
	      logger.info("Client built in lib/client/deploy");
	      logger.info("Copying build to datasource.");
	
	      // Concating css
	      var appCss = fs.readFileSync(path.join(__dirname, "../../../lib/client/deploy/build/app.css"), 'utf8');
	      var enyoCss = fs.readFileSync(path.join(__dirname, "../../../lib/client/deploy/build/enyo.css"), 'utf8');
	      var coreCss = enyoCss + appCss;
	
	      // Concating javascript
	      var appJs = fs.readFileSync(path.join(__dirname, "../../../lib/client/deploy/build/app.js"), 'utf8');
	      var enyoJs = fs.readFileSync(path.join(__dirname, "../../../lib/client/deploy/build/enyo.js"), 'utf8');
	      var coreJs = enyoJs + appJs;
	
	      fs.writeFileSync(path.join(__dirname, '../../../node-datasource/public/javascripts/core.js'), coreJs);
	      fs.writeFileSync(path.join(__dirname, '../../../node-datasource/public/stylesheets/core.css'), coreCss);
	    });
	  });
	};



}());
