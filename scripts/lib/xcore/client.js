var _				= require('underscore'),
		path		= require('path'),
		exec		= require('child_process').exec,
		fs			= require('fs'),
		logger	= require('./logger').logger;

(function () {
	"use strict";

  // Setup file paths
  var enyoDir = path.join(__dirname, '../../../lib/client'),
      appDir = path.join(__dirname, '../../../source'),
      extensionDir = path.join(__dirname, '../../../lib/extensions'),
      datasourceDir = path.join(__dirname, '../../../node-datasource');

  var getExtensionManifests = function() {
	  var extensionDirs = fs.readdirSync(extensionDir),
	      manifests = {};
	
	  _.each(extensionDirs, function(dir, idx, dirs) {
	    if (dir == '.git') { return true; }
	    try {
	    var contents = fs.readFileSync(path.join(
	      extensionDir, dir, '/database/source/manifest.js'), 'utf8'),
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
	
	  fs.writeFileSync(path.join(enyoDir, 'source/tools/package.js'), toolsPackage);

    // TODO: This is a fucking awful way of doing this, but it works for now.
    // NOTE: We can probably change the bootplate to make this less terrible.
    //       E.G. we can set some kind of obvious, should-be-changed token in
    //            the package.js file it contains and then write whatever dirs
    //            we need as a kind of spin up task?
	  logger.info('Copying application code into client.');
    // readFileSync normally returns a Buffer.  We want a String.
    var appPackage = fs.readFileSync(path.join(enyoDir, 'source/package.js')).toString();
    // Avoid unnecessary disk IO, if possible
    if(appPackage.indexOf('app.js') >= 0) {
      appPackage = appPackage.replace('app.js', appDir);
      fs.writeFileSync(path.join(enyoDir, 'source/package.js'), appPackage);
    }
    copyExtensionCode(callback);
	};

	/** Copies client code from the extensions into lib/client. */
	var copyExtensionCode = function (callback) {
	  /** Collect all the extension manifest and sort by load order. */
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
	
	  /** Copy assets to the appropriate places */
	  _.each(manifests, function(manifest) {
	    var clientCodeDir = path.join(extensionDir, manifest.name, 'client');
	    var dirs = fs.readdirSync(clientCodeDir);
	
	    if (_.contains(dirs, 'assets')) {
	      var idx = _.indexOf(dirs, 'assets');
	      dirs.splice(idx, 1);
	
	      exec('cp -R ' + path.join(extensionDir, manifest.name ,'client/assets/*') +
	           ' ' + path.join(enyoDir, 'assets/'),
	           function (err, stdout, stderr) {
	             if (err !== null) {
	               logger.error(err);
	               process.exit(1);
	             }
	           });
	
	      exec('cp -R ' + path.join(extensionDir, manifest.name ,'client/assets') +
	           ' ' + path.join(datasourceDir, 'public/images', manifest.name),
	           function (err, stdout, stderr) {
	             if (err !== null) {
	               logger.error(err);
	               process.exit(1);
	             }
	           });
	
	    }
	  });
	
	  var extPackage = _.reduce(manifests, function(packString, manifest, index) {
      if(index !== 0) {
        packString += ',\n';
      }
      packString += '"' + path.join(extensionDir, manifest.name, 'client') + '"';
      return packString;
    }, 'enyo.depends(\n');
    extPackage += '\n);';

    fs.writeFile(
      path.join(enyoDir, 'source/extensions/package.js'),
      extPackage,
      {
        encoding: 'utf8'
      },
      function(err, stdout, stderr) {
        if(err) {
          logger.error(err);
          process.exit(1);
        }

        callback();
      }
    );
	};
	
	/**
	  * Link extension client code to enyo's lib folder then run the enyo deploy.sh
	  * script. The compiled client code should be in the lib/client/build folder.
	*/
	exports.buildClient = function () {
	  logger.info("Attempting to build client code.");
	
	  /** Copy the extension client code into lib/client. */
	  copyClientCode(function () {
	    var deployScript = path.join(enyoDir, 'tools/deploy.sh -T');
	    logger.info("Executing build...");
	    exec(deployScript, function(err, stdout, stderr) {
	      if (err !== null) {
	        logger.error(err);
					process.exit(1);
	      }
	      if (stderr) {
	        logger.error(stderr);
					process.exit(1);
	      }
	
	      logger.info("Client built in lib/client/deploy");
	      logger.info("Copying build to datasource.");
	
	      /** Concating css */
	      var appCss = fs.readFileSync(path.join(enyoDir, "deploy/build/app.css"), 'utf8');
	      var enyoCss = fs.readFileSync(path.join(enyoDir, "deploy/build/enyo.css"), 'utf8');
	      var coreCss = enyoCss + appCss;
	
	      /** Concating javascript */
	      var appJs = fs.readFileSync(path.join(enyoDir, "deploy/build/app.js"), 'utf8');
	      var enyoJs = fs.readFileSync(path.join(enyoDir, "deploy/build/enyo.js"), 'utf8');
	      var coreJs = enyoJs + appJs;
	
	      fs.writeFileSync(path.join(datasourceDir, 'public/javascripts/core.js'), coreJs);
	      fs.writeFileSync(path.join(datasourceDir, 'public/stylesheets/core.css'), coreCss);
	    });
	  });
	};



}());
