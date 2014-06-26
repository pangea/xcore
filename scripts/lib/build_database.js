/*jshint node:true, indent:2, curly:false, eqeqeq:true, immed:true, latedef:true, newcap:true, noarg:true,
 regexp:true, undef:true, strict:true, trailing:true, white:true */
/*global X:true, Backbone:true, _:true, XM:true, XT:true*/

_ = require('underscore');

var async         = require('async'),
    dataSource    = require('../../node-datasource/lib/ext/datasource').dataSource,
    exec          = require('child_process').exec,
    fs            = require('fs'),
    ormInstaller  = require('./orm'),

    /**
     * TODO - Put localization support back in once we figure out how it works.
     * And a proper directory structure for it. You'll also need to uncomment the
     * function that uses dictionaryBuilder below.
     */
    //dictionaryBuilder   = require('./build_dictionary'),

    path    = require('path'),
    pg      = require('pg'),
    winston = require('winston');

(function () {
  "use strict";

  var jsInit = "select xt.js_init();",

      // There are a few ways we can send our query to the database.

      // Send query via REST service.
      sendToDatabaseDatasource = function (query, credsClone, options, callback) {
        dataSource.query(query, credsClone, callback);
      },

      // Execute psql command locally.
      sendToDatabasePsql = function (query, credsClone, options, callback) {
        var filename = path.join(__dirname, "temp_query_" + credsClone.database + ".sql");
        fs.writeFile(filename, query, function (err) {
          if (err) {
            winston.error("Cannot write query to file");
            callback(err);
            return;
          }
          var psqlCommand = 'psql -d ' + credsClone.database +
                ' -U ' + credsClone.username +
                ' -h ' + credsClone.hostname +
                ' -p ' + credsClone.port +
                ' -f ' + filename +
                ' --single-transaction';
          exec(psqlCommand, {maxBuffer: 40000 * 1024 /* 20x default */}, function (err, stdout, stderr) {
            if (err) {
              winston.error("Cannot install file ", filename);
              callback(err);
              return;
            }
            if (options.keepSql) {
              // do not delete the temp query file
              winston.info("SQL file kept as ", filename);
              callback();
            } else {
              fs.unlink(filename, function (err) {
                if (err) {
                  winston.error("Cannot delete written query file");
                  callback(err);
                }
                callback();
              });
            }
          });
        });
      },

      /**
       * Step 0 (optional, triggered by flags), wipe out the database
       * and load it from scratch using pg_restore something.backup
       */
      initDatabase = function (spec, creds, callback) {
        var databaseName = spec.database,
            credsClone = JSON.parse(JSON.stringify(creds));

        // The calls to drop and create the database need to be run against
        // the database "postgres"
        credsClone.database = "postgres";
        winston.info("Dropping database " + databaseName);
        dataSource.query("drop database if exists " + databaseName + ";", credsClone, function (err, res) {
          if (err) {
            winston.error("drop db error", err.message, err.stack, err);
            callback(err);
            return;
          }

          winston.info("Creating and restoring database " + databaseName);
          dataSource.query("create database " + databaseName + " template template1", credsClone, function (err, res) {
            if (err) {
              winston.error("create db error", err.message, err.stack, err);
              callback(err);
              return;
            }

            // Use exec to restore the backup. The alternative, reading the backup
            // file into a string to query doesn't work because the backup
            // file is binary.
            exec("pg_restore -U " + creds.username + " -h " + creds.hostname + " -p " +
                 creds.port + " -d " + databaseName + " " + spec.backup, function (err, res) {
                   if (err) {
                     console.log("ignoring restore db error", err);
                   }
                   callback(null, res);
                 });
          });
        });
      },


      /**
       @param {Object} specs Specification for the build process, in the form:
       [ { extensions:
       [ '/home/user/git/xcore/enyo-client',
       '/home/user/git/xcore-extensions/source/crm',
       '/home/user/git/xcore-extensions/source/sales',
       '/home/user/git/private-extensions/source/incident_plus' ],
       database: 'dev',
       orms: [] },
       { extensions:
       [ '/home/user/git/xcore/enyo-client',
       '/home/user/git/xcore-extensions/source/sales',
       '/home/user/git/xcore-extensions/source/project' ],
       database: 'dev2',
       orms: [] }]

       @param {Object} creds Database credentials, in the form:
       { hostname: 'localhost',
       port: 5432,
       user: 'admin',
       password: 'admin',
       host: 'localhost' }
       */
      buildDatabase = exports.buildDatabase = function (specs, creds, masterCallback) {
        if (specs.length === 1 &&
            specs[0].initialize &&
            specs[0].backup) {

          // The user wants to initialize the database first (i.e. Step 0)
          // Do that, then call this function again
          initDatabase(specs[0], creds, function (err, res) {
            if (err) {
              winston.error("init database error", err);
              masterCallback(err);
              return;
            }

            // recurse to do the build step. Of course we don't want to initialize a
            // second time, so destroy those flags.
            specs[0].initialize = false;
            specs[0].wasInitialized = true;
            specs[0].backup = undefined;
            buildDatabase(specs, creds, masterCallback);
          });
          return;
        }

        // The function to generate all the scripts for a database
        function installDatabase(spec, databaseCallback) {
          var extensions = spec.extensions,
              databaseName = spec.database,

              // The function to install all the scripts for an extension
              getExtensionSql = function (extension, extensionCallback) {
                if (spec.clientOnly) {
                  extensionCallback(null, "");
                  return;
                }

                // Deal with directory structure quirks
                var isLibOrm         = extension.indexOf("lib/orm") >= 0,

                    isExtension      = extension.indexOf("extensions") >= 0,

                    dbSourceRoot     = isLibOrm ?
                      path.join(extension, "source") :
                      path.join(extension, "database/source"),

                    manifestFilename = path.join(dbSourceRoot, "manifest.js");

                // Step 2:
                // Read the manifest files.
                if (!fs.existsSync(manifestFilename)) {
                  // error condition: no manifest file
                  winston.log("Cannot find manifest " + manifestFilename);
                  extensionCallback("Cannot find manifest " + manifestFilename);
                  return;
                }

                fs.readFile(manifestFilename, "utf8", function (err, manifestString) {
                  var manifest,
                      extensionName,
                      loadOrder,
                      extensionComment,
                      extensionLocation,
                      isFirstScript = true;
                  try {
                    manifest = JSON.parse(manifestString);
                  } catch (error) {
                    // error condition: manifest file is not properly formatted
                    winston.log("Manifest is not valid JSON" + manifestFilename);
                    extensionCallback("Manifest is not valid JSON" + manifestFilename);
                    return;
                  }

                  extensionName = manifest.name;
                  extensionComment = manifest.comment;
                  loadOrder = manifest.loadOrder || 999;
                  if (isExtension) {
                    extensionLocation = "/extensions";
                  }

                  // Step 3:
                  // Concatenate together all the files referenced in the manifest.
                  var getScriptSql = function (filename, scriptCallback) {
                    var fullFilename = path.join(dbSourceRoot, filename);
                    if (!fs.existsSync(fullFilename)) {
                      // error condition: script referenced in manifest.js isn't there
                      scriptCallback(path.join(dbSourceRoot, filename) + " does not exist");
                      return;
                    }
                    fs.readFile(fullFilename, "utf8", function (err, scriptContents) {
                      // error condition: can't read script
                      if (err) {
                        scriptCallback(err);
                        return;
                      }
                      var beforeNoticeSql = 'do $$ plv8.elog(NOTICE, "About to run file ' + fullFilename + '"); $$ language plv8;\n',
                          afterNoticeSql = 'do $$ plv8.elog(NOTICE, "Just ran file ' + fullFilename + '"); $$ language plv8;\n',
                          formattingError,
                          lastChar;

                      //
                      // Allow inclusion of js files in manifest. If it is a js file,
                      // use plv8 to execute it.
                      //
                      //if (fullFilename.substring(fullFilename.length - 2) === 'js') {
                      // this isn't quite working yet
                      // http://adpgtech.blogspot.com/2013/03/loading-useful-modules-in-plv8.html
                      // put in lib/orm's manifest.js: "../../tools/lib/underscore/underscore-min.js",
                      //  scriptContents = "do $$ " + scriptContents + " $$ language plv8;";
                      //}

                      //
                      // Incorrectly-ended sql files (i.e. no semicolon) make for unhelpful error messages
                      // when we concatenate 100's of them together. Guard against these.
                      //
                      scriptContents = scriptContents.trim();
                      lastChar = scriptContents.charAt(scriptContents.length - 1);
                      if (lastChar !== ';') {
                        // error condition: script is improperly formatted
                        formattingError = "Error: " + fullFilename + " contents do not end in a semicolon.";
                        winston.warn(formattingError);
                        scriptCallback(formattingError);
                      }

                      if (!isLibOrm || !isFirstScript) {
                        // to put a noticeSql *before* scriptContents we have to account for the very first
                        // script, which is create_plv8, and which must not have any plv8 functions before it,
                        // such as a noticeSql.
                        scriptContents = beforeNoticeSql + scriptContents;
                      }

                      isFirstScript = false;

                      scriptCallback(null, scriptContents += afterNoticeSql);
                    });
                  };

                  async.mapSeries(manifest.databaseScripts || [], getScriptSql, function (err, scriptSql) {
                    var registerSql,
                        dependencies;

                    if (err) {
                      extensionCallback(err);
                      return;
                    }
                    // each String of the scriptContents is the concatenated SQL for the script.
                    // join these all together into a single string for the whole extension.
                    var extensionSql = scriptSql.join('');

                    if (!isLibOrm) {
                      // register extension and dependencies
                      extensionSql = 'do $$ plv8.elog(NOTICE, "About to register extension ' +
                        extensionName + '"); $$ language plv8;\n' + extensionSql;
                      registerSql = "select xt.register_extension('%@', '%@', '%@', '', %@);\n"
                        .f(extensionName, extensionComment, extensionLocation, loadOrder);

                      dependencies = manifest.dependencies || [];
                      _.each(dependencies, function (dependency) {
                        var dependencySql = "select xt.register_extension_dependency('%@', '%@');\n"
                              .f(extensionName, dependency);
                        extensionSql = dependencySql + extensionSql;
                      });
                      extensionSql = registerSql + extensionSql;

                      // unless it it hasn't yet been defined (ie. lib/orm),
                      // running xt.js_init() is probably a good idea.
                      extensionSql = jsInit + extensionSql;
                    }

                    if (spec.wipeViews) {
                      // If we want to pre-emptively wipe out the views, the best place to do it
                      // is at the start of the core application code
                      fs.readFile(path.join(__dirname, "../sql/delete_system_orms.sql"),
                                  function (err, wipeSql) {
                                    if (err) {
                                      extensionCallback(err);
                                      return;
                                    }
                                    extensionSql = wipeSql + extensionSql;
                                    extensionCallback(null, extensionSql);
                                  });
                    } else {
                      extensionCallback(null, extensionSql);
                    }

                  });
                  //
                  // End script installation code
                  //
                });
              },

              /**
               * We also need to get the sql that represents the queries to generate
               * the XM views from the ORMs. We use the old ORM installer for this,
               * which has been retooled to return the queryString instead of running
               * it itself.
               */
              getOrmSql = function (extension, callback) {
                if (spec.clientOnly) {
                  callback(null, "");
                  return;
                }

                var ormDir = path.join(extension, "database/orm");

                if (fs.existsSync(ormDir)) {
                  var updateSpecs = function (err, res) {
                    if (err) {
                      callback(err);
                    }
                    // if the orm installer has added any new orms we want to know about them
                    // so we can inform the next call to the installer.
                    spec.orms = _.unique(_.union(spec.orms, res.orms), function (orm) {
                      return orm.namespace + orm.type;
                    });
                    callback(err, res.query);
                  };
                  ormInstaller.run(ormDir, spec, updateSpecs);
                } else {
                  // No ORM dir? No problem! Nothing to install.
                  callback(null, "");
                }
              },

              /**
               * The sql for each extension comprises the sql in the the source directory
               * with the orm sql tacked on to the end. Note that an alternate methodology
               * dictates that *all* source for all extensions should be run before *any*
               * orm queries for any extensions, but that is not the way it works here.
               */
              getAllSql = function (extension , masterCallback) {

                async.series([
                  function (callback) {
                    getExtensionSql(extension, callback);
                  },
                  // function (callback) {
                  //   if (spec.clientOnly) {
                  //     callback(null, "");
                  //     return;
                  //   }
                  //   dictionaryBuilder.getDictionarySql(extension, callback);
                  // },
                  function (callback) {
                    getOrmSql(extension, callback);
                  },
                  function (callback) {
                    // the client needs jsInit and might not have it by now
                    callback(null, jsInit);
                  }
                ], function (err, results) {
                  masterCallback(err, results.join(''));
                });
              };


          /**
           * Asyncronously run all the functions to all the extension sql for the database,
           * in series, and execute the query when they all have come back.
           */
          async.mapSeries(extensions, getAllSql, function (err, extensionSql) {
            var sendToDatabase,
                allSql,
                credsClone = JSON.parse(JSON.stringify(creds));

            if (err) {
              databaseCallback(err);
              return;
            }
            // each String of the scriptContents is the concatenated SQL for the extension.
            // join these all together into a single string for the whole database.
            allSql = extensionSql.join('');

            if (spec.queryDirect) {
              // but we can query the database directly if we want
              sendToDatabase = sendToDatabaseDatasource;
            } else {
              // by default we delegate to psql
              sendToDatabase = sendToDatabasePsql;

              // Without this, when we delegate to exec psql the err var will not be set even
              // on the case of error.
              allSql = "\\set ON_ERROR_STOP TRUE;\n" + allSql;
            }

            // NOTE: We don't have core extensions anymore, so I don't think any of
            // this is necessary.  Leaving in, just in case.
            // if (spec.wasInitialized) {
            //   // give the admin user every extension by default
            //   allSql = allSql + "insert into xt.usrext (usrext_usr_username, usrext_ext_id) " +
            //     "select '" + creds.username +
            //     "', ext_id from xt.ext where ext_location = '/core-extensions';";
            // }

            winston.info("Applying build to database " + spec.database);
            credsClone.database = spec.database;
            sendToDatabase(allSql, credsClone, spec, function (err, res) {
              databaseCallback(err, res);
            });
          });
        };

        /**
         * Step 1:
         * Okay, before we install the database there is ONE thing we need to check,
         * which is the pre-installed ORMs. Check that now.
         */
        var preInstallDatabase = function (spec, callback) {
          var existsSql = "select relname from pg_class where relname = 'orm'",
              credsClone = JSON.parse(JSON.stringify(creds)),
              ormTestSql = "select orm_namespace as namespace, " +
                " orm_type as type " +
                "from xt.orm " +
                "where not orm_ext;";

          credsClone.database = spec.database;

          dataSource.query(existsSql, credsClone, function (err, res) {
            if (err) {
              callback(err);
            }
            if (spec.wipeViews || res.rowCount === 0) {
              // xt.orm doesn't exist, because this is probably a brand-new DB.
              // No problem! That just means that there are no pre-existing ORMs.
              spec.orms = [];
              installDatabase(spec, callback);
            } else {
              dataSource.query(ormTestSql, credsClone, function (err, res) {
                if (err) {
                  callback(err);
                }
                spec.orms = res.rows;
                installDatabase(spec, callback);
              });
            }
          });
        };

        // Install all the databases
        async.map(specs, preInstallDatabase, function (err, res) {
          if (err) {
            winston.error(err.message, err.stack, err);
            if (masterCallback) {
              masterCallback(err);
            }
            return;
          }
          winston.info("Success installing all scripts.");
          winston.info("Cleaning up.");
          if (masterCallback) {
            masterCallback(null, []);
          }
        });
      };

  /** TODO: Look into the query below. I don't think we need the xt.clientcode
   * bits but I'm also not quite sure if that part is needed. My gut tells me
   * since we're moving all "core-extension" code into actual extensions
   * that peice of the db is obsolete.
   */
  // Another option: unregister the extension
  exports.unregister = function (specs, creds, masterCallback) {
    var extension = path.basename(specs[0].extensions[0]),
        unregisterSql = ["delete from xt.usrext where usrext_id in " +
                         "(select usrext_id from xt.usrext inner join xt.ext on usrext_ext_id = ext_id where ext_name = $1);",

                         "delete from xt.clientcode where clientcode_id in " +
                         "(select clientcode_id from xt.clientcode inner join xt.ext on clientcode_ext_id = ext_id where ext_name = $1);",

                         "delete from xt.dict where dict_id in " +
                         "(select dict_id from xt.dict inner join xt.ext on dict_ext_id = ext_id where ext_name = $1);",

                         "delete from xt.extdep where extdep_id in " +
                         "(select extdep_id from xt.extdep inner join xt.ext " +
                         "on extdep_from_ext_id = ext_id or extdep_to_ext_id = ext_id where ext_name = $1);",

                         "delete from xt.ext where ext_name = $1;"];

    if (extension.charAt(extension.length - 1) === "/") {
      // remove trailing slash if present
      extension = extension.substring(0, extension.length - 1);
    }
    winston.info("Unregistering extension:", extension);
    var unregisterEach = function (spec, callback) {
      var options = JSON.parse(JSON.stringify(creds));
      options.database = spec.database;
      options.parameters = [extension];
      var queryEach = function (sql, sqlCallback) {
        dataSource.query(sql, options, sqlCallback);
      };
      async.eachSeries(unregisterSql, queryEach, callback);
    };
    async.each(specs, unregisterEach, masterCallback);
  };

}());
