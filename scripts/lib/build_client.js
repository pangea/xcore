#!/usr/bin/env node

/*jshint node:true, indent:2, curly:false, eqeqeq:true, immed:true, latedef:true, newcap:true, noarg:true,
regexp:true, undef:true, strict:true, trailing:true, white:true */
/*global X:true, Backbone:true, _:true, XM:true, XT:true*/
var _    = require('underscore'),
  async  = require('async'),
  exec   = require('child_process').exec,
  fs     = require('fs'),
  path   = require('path'),
  rimraf = require('rimraf');

  // TODO: relax the assumption that extension builds are js only (i.e. allow extension css)
  // TODO: right now we just give the latest versions available in the db. This might possibly change.

(function () {
  "use strict";

  /**
   * Get the sql to insert client-side code into the database. Presupposes that
   * the client code has already been built, and is in the build directory,
   * with the filename as the extension name.
  */
  exports.getClientSql = function (extPath, callback) {
    var extName,
      constructQuery = function (contents, extension, version, language) {
        return "select xt.insert_client($$" + contents +
          "$$, '" + extension +
          "', '" + version +
          "', '" + language + "');";
      };

    if (extPath.indexOf("/lib/orm") >= 0) {
      // this is lib/orm. There is nothing here to install on the client.
      callback(null, "");
      return;

    } else if (extPath.indexOf("extensions") < 0) {
      // this is the core app, which has a slightly different process.
      fs.readFile(path.join(__dirname, "build/core.js"), "utf8", function (err, jsCode) {
        if (err) {
          callback(err);
          return;
        }
        fs.readFile(path.join(__dirname, "build/core.css"), "utf8", function (err, cssCode) {
          if (err) {
            callback(err);
            return;
          }
          fs.readFile(path.join(__dirname, "../../package.json"), "utf8", function (err, packageJson) {
            if (err) {
              callback(err);
              return;
            }
            var packageDetails = JSON.parse(packageJson);
            callback(null, constructQuery(cssCode, "_core", packageDetails.version, "css") +
              constructQuery(jsCode, "_core", packageDetails.version, "js"));
          });
        });
      });

    } else {
      extName = path.basename(extPath).replace(/\/$/, ""); // the name of the extension
      fs.readFile(path.join(__dirname, "build", extName + ".js"), "utf8", function (err, code) {
        if (err) {
          if (err.code === 'ENOENT') {
            // it's not necessarily an error if there's no code here.
            console.log("No built client file for " + extName + ". There is probably no client-side code in the extension.");
            callback(null, "");
            return;
          }
          callback(err);
          return;
        }
        // get the extension version from the database manifest file
        fs.readFile(path.join(extPath, "database/source/manifest.js"), "utf8", function (err, manifestContents) {
          if (err) {
            callback(err);
            return;
          }
          var manifestDetails = JSON.parse(manifestContents);
          if (!manifestDetails.version) {
            // if the extensions don't declare their version, default to the package version
            fs.readFile(path.join(__dirname, "../../package.json"), "utf8", function (err, packageJson) {
              if (err) {
                callback(err);
                return;
              }
              var packageDetails = JSON.parse(packageJson);
              callback(null, constructQuery(code, extName, packageDetails.version, "js"));
            });

          } else {
            callback(null, constructQuery(code, extName, manifestDetails.version, "js"));
          }
        });
      });
    }
  };

  /**
    * Builds an extension (as opposed to the core).
    * Saves it by extension name in the builds folder.
  */
  var buildExtension = function (extPath, callback) {

    // regex: remove trailing slash
    var extName = path.basename(extPath).replace(/\/$/, ""), // the name of the extension
      jsFilename = extName + ".js";

    // Create the package file for enyo to use
    var rootPackageContents = 'enyo.depends("' + extPath + '/client");';

    fs.writeFile(path.join(__dirname, "package.js"), rootPackageContents, function (err) {
      if (err) {
        callback(err);
        return;
      }

      // Run the enyo deployment method asyncronously
      var rootDir = path.join(extPath, "../..");

      // We run the command from /scripts/lib, so that is where build
      // directories and other temp files are going to go.
      console.log("building " + extName);
      exec(path.join(rootDir, "/tools/deploy.sh"),
        {
          maxBuffer: 40000 * 1024, /* 200x default */
          cwd: __dirname // scripts/lib
        },
        function (err, stdout) {
          if (err) {
            callback(err);
            return;
          }

          // Rename the file with the name of the extension so that we won't
          // need to recreate it in the case of multiple databases wanting
          // the same client code.
          fs.rename(path.join(__dirname, "build/app.js"), path.join(__dirname, "build", jsFilename), function (err) {
            callback(err);
          });
        }
      );
    });
  };

  /**
    * Builds the core. Saves it as core.js and core.css in the builds folder.
    *
    * Core is enyo + app smooshed together.
  */
  var buildCore = function (callback) {
    console.log("building client core");
    exec(path.join(__dirname, "../../enyo-client/application/tools/deploy.sh"),
    {
      maxBuffer: 40000 * 1024 /* 200x default */
    },
    function (err, stdout) {
      if (err) {
        callback(err);
        return;
      }

      fs.readdir(path.join(__dirname, "../../enyo-client/application/build"), function (err, files) {
        var readFile;

        if (err) {
          callback("Error: cannot find 'enyo-client/application/build'. Ensure that the " +
            "git submodules are up to date." + err);
          return;
        }

        else if (files.length < 4) {
          callback("Error: was not able to build all core files. Built files are: " +
            JSON.stringify(files) +
            ". Try running the enyo deploy by itself in enyo-client/application/tools " +
            "and if that fails there's probably a problem in your package files.");
        }

        readFile = function (filename, callback) {
          var callbackAdaptor = function (err, contents) {
            callback(err, {name: filename, contents: contents});
          };
          filename = path.join(__dirname, "../../enyo-client/application/build", filename);
          fs.readFile(filename, "utf8", callbackAdaptor);
        };

        /**
          * Loop through the css & javascript files in the build folder:
          * enyo-client/application/build and build a single core.css & core.js
        */
        async.map(files, readFile, function (err, results) {

          // Smash together enyo css and app css into core css
          var cssResults = _.filter(results, function (result) {
              return path.extname(result.name) === ".css";
            }),
            // We want app.css content to preceed enyo.css when we copy to core.
            sortedCssResults = _.sortBy(cssResults, function (result) {
              return path.basename(result.name) === "app.css";
            }),
            cssString = _.reduce(sortedCssResults, function (memo, result) {
              return memo + result.contents;
            }, ""),


            // Smash together enyo js and app js into core js.
            jsResults = _.filter(results, function (result) {
              return path.extname(result.name) === ".js";
            }),
            // Same thing as above with the css.
            sortedJsResults = _.sortBy(jsResults, function (result) {
              return path.basename(result.name) === "app.js";
            }),
            jsString = _.reduce(sortedJsResults, function (memo, result) {
              return memo + result.contents;
            }, "");

          fs.writeFile(path.join(__dirname, "build/core.js"), jsString, function (err) {
            if (err) {
              callback(err);
              return;
            }
            fs.writeFile(path.join(__dirname, "build/core.css"), cssString, function (err) {
              if (err) {
                callback(err);
                return;
              }
              callback();
            });
          });

        });
      });
    });
  };

  var build = function (extPath, callback) {

    // this is lib/orm. Nothing here to install on client so skip it.
    if (extPath.indexOf("/lib/orm") >= 0) {
      callback();
      return;
    }

    // this is the core app, which has a different deploy process.
    if (extPath.indexOf("extensions") < 0) {
      buildCore(callback);
      return;
    }

    // Check for client code & make sure it has a path to the enyo source code.
    var enyoDir = path.join(extPath, "../../enyo");
    fs.exists(path.join(extPath, "client"), function (exists) {
      if (!exists) {
        console.log(extPath + " has no client code. Not trying to build it.");
        callback();
        return;
      }

      // Symlink the enyo directories if they're not there
      fs.exists(enyoDir, function (exists) {
        if (!exists) {
          fs.symlink(path.join(__dirname, "../../enyo-client/application/enyo"), enyoDir, function (err) {
            if (err) {
              callback(err);
              return;
            }
            buildExtension(extPath, callback);
          });
        } else {
          buildExtension(extPath, callback);
        }
      });
    });
  };

  // Cleanup by deleting all the client files we've built
  exports.cleanup = function (specs, callback) {

    // Don't cleanup if we're only building the database.
    if (specs[0].databaseOnly) {
      callback();
      return;
    }

    // These are the unique extension root directories
    var rootDirs = _.unique(_.compact(_.flatten(_.map(specs, function (spec) {
      return _.map(spec.extensions, function (extension) {
        return extension.indexOf("extensions") >= 0 ? path.join(extension, "../..") : null;
      });
    }))));

    // This method removes the enyo symlink we created earlier
    var unlinkEnyo = function (rootDir, callback) {
      var enyoDir = path.join(rootDir, "enyo");
      fs.exists(enyoDir, function (exists) {
        if (exists) {
          fs.unlink(enyoDir, function (err) {
            if (err) {
              callback(err);
              return;
            }
            callback();
          });
        } else {
          // no symlink = no need to remove it
          callback();
        }
      });
    };

    /**
      * Remove the symlink to enyo we put in the extension folders. Then
      * remove all the build files/folders we created.
    */
    async.map(rootDirs, unlinkEnyo, function (err, res) {
      if (err) {
        callback(err);
        return;
      }

      // Remove the symlink to package.js
      fs.unlink(path.join(__dirname, "package.js"), function (err) {
        if (err) {
          callback(err);
          return;
        }

        /**
          * TODO: Revisit this. Should build be putting files in extensions
          * folder? Do we even need that folder if extension will live in
          * xcore-extensions?
        */
        var buildDirs = [
          path.join(__dirname, "build"),
          path.join(__dirname, "deploy"),
          path.join(__dirname, "../../enyo-client/application/build"),
          path.join(__dirname, "../../enyo-client/application/deploy"),
          path.join(__dirname, "../../enyo-client/extensions/build"),
          path.join(__dirname, "../../enyo-client/extensions/builds"),
          path.join(__dirname, "../../enyo-client/extensions/deploy")
        ];

        // (rimraf) rm -rf each build directory.
        async.map(buildDirs, rimraf, function (err) {
          callback(err);
        });

      });

    });
  };

  /**
    * Build all the client code we know we're going to need.
    * Leave it sitting in the scripts/lib/build directory.
  */
  exports.buildClient = function (specs, callback) {

    // User doesn't want the database built.
    if (specs[0].databaseOnly) {
      callback();
      return;
    }

    // these are the unique extensions
    var extDirs = _.unique(_.flatten(_.map(specs, function (spec) {
      return spec.extensions;
    })));

    // Clear/make the build directory. Where all built client side code lives.
    rimraf(path.join(__dirname, "build"), function (err) {
      fs.mkdir(path.join(__dirname, "build"), function (err, res) {
        if (err) {
          callback(err);
          return;
        }
        async.mapSeries(extDirs, build, function (err, res) {
          callback(err, res);
        });
      });
    });
  };

}());
