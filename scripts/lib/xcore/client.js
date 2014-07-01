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
	      __dirname, '../../../lib/extensions', dir, '/database/source/manifest.js'), 'utf8'),
	      manifest = JSON.parse(contents);
	
	      manifests[manifest.name] = manifest;
	    } catch (err) {
	      logger.error(err);
	    }
	  });
	
	  return manifests;
	};
	
	// Copies client code from the extensions into lib/client.
	var copyClientCode = function (callback) {
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
	
	  _.each(manifests, function(manifest) {
	    var clientCodeDir = path.join(__dirname, '../../../lib/extensions/', manifest.name, '/client');
	    var dirs = fs.readdirSync(clientCodeDir);
	
	    if (_.contains(dirs, 'assets')) {
	      var idx = _.indexOf(dirs, 'assets');
	      dirs.splice(idx, 1);
	
	      exec('cp -R ' + path.join(__dirname, '../../../lib/extensions/xcore-gui/client/assets/') +
	      ' ' + path.join(__dirname, '../../../lib/client/assets/'),
	        function (err, stdout, stderr) {
	          if (err !== null) {
	            logger.error(err);
	            process.exit(1);
	          }
	        });
	
	      exec('cp -R ' + path.join(__dirname, '../../../lib/extensions/xcore-gui/client/assets/*') +
	      ' ' + path.join(__dirname, '../../../node-datasource/public/images/'),
	        function (err, stdout, stderr) {
	          if (err !== null) {
	            logger.error(err);
	            process.exit(1);
	          }
	        });
	
	    }
	
	    _.each(dirs, function (dir) {
	      var extDir = path.join(__dirname, '../../../lib/client/source/', dir, manifest.name);
	
	      exec('rm -rf ' + extDir, function (err, stdout, stderr) {
	        if (err !== null) {
	          logger.error(err);
	          process.exit(1);
	        }
	
	        exec('cp -R ' + clientCodeDir + '/' + dir + ' ' + extDir,
	          function(err2, stdout2, stderr2) {
	            if (err2 !== null) {
	              logger.error('b:' + err2);
	              process.exit(1);
	            }
	
	            var newPackageJS = "enyo.depends(\n";
	            var existingFiles = fs.readdirSync(path.join(__dirname, "../../../lib/client/source/", dir));
	            var extensionFiles = fs.readdirSync(clientCodeDir + '/' + dir);
	
	            // Copy the files that already exist back into the new package.js.
	            newPackageJS += buildPackageString(existingFiles);
	
	            newPackageJS += ");";
	
	            // Tell enyo to depend on this code.
	            var depFile = path.join(__dirname, "../../../lib/client/source/"+dir+"/package.js");
	            fs.writeFileSync(depFile, newPackageJS);
	          }
	        );
	      });
	    });
	
	  });
	
	  callback();
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
	      }
	      if (stderr) {
	        logger.error(stderr)
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
