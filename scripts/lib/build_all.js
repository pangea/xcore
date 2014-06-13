/*jshint node:true, indent:2, curly:false, eqeqeq:true, immed:true, latedef:true, newcap:true, noarg:true,
regexp:true, undef:true, strict:true, trailing:true, white:true */
/*global X:true, Backbone:true, _:true, XM:true, XT:true*/

var _              = require('underscore'),
  async            = require('async'),
  build_database   = require("./build_database"),
  buildDatabase    = build_database.buildDatabase,
  buildClient      = require("./build_client").buildClient,
  dataSource       = require('../../node-datasource/lib/ext/datasource').dataSource,
  exec             = require('child_process').exec,
  fs               = require('fs'),
  path             = require('path'),
  unregister       = build_database.unregister,
  winston          = require('winston');

/**
 * This is the point of entry for both the lightweight CLI entry-point and
 * programmatic calls to build, such as from mocha. Most of the work in this
 * file is in determining what the defaults mean. For example, if the
 * user does not specify an extension, we install the core and all registered
 * extensions, which requires a call to xt.ext.
 *
 * We delegate the work of actually building the database and building the
 * client to build_database.js and build_client.js.
 */

(function () {
  "use strict";

  var creds;

  exports.build = function (options, callback) {
    var buildSpecs = {},
      databases = [],
      extension,
      config,

      // Resolve the correct path for file. "/direct/path/" vs "../../relative"
      resolvePath = function (f) {
        var resolvedPath;

        if (f && f.substring(0, 1) === '/') {
          resolvedPath = f;
        } else if (f) {
          resolvedPath = path.join(process.cwd(), f);
        }

        return resolvedPath;
      },

      // List registered extensions in database & append core dirs to list
      getRegisteredExtensions = function (database, callback) {
        var result,
          credsClone = JSON.parse(JSON.stringify(creds)),
          existsSql = "select relname from pg_class where relname = 'ext'",
          extSql = "SELECT * FROM xt.ext ORDER BY ext_load_order",

          adaptExtensions = function (err, res) {
            if (err) {
              callback(err);
              return;
            }

            var paths = _.map(res.rows, function (row) {
              var location = row.ext_location,
                name = row.ext_name,
                extPath;

              if (location === '/xcore-extensions') {
                extPath = path.join(__dirname, "../../../xcore-extensions/source", name);
              } else if (location === '/private-extensions') {
                extPath = path.join(__dirname, "../../../private-extensions/source", name);
              }

              return extPath;
            });

            // Add client core & orm to extensions paths.
            paths.unshift(path.join(__dirname, "../../enyo-client")); // core path
            paths.unshift(path.join(__dirname, "../../lib/orm")); // lib path

            callback(null, {
              extensions: paths,
              database: database,
              keepSql: options.keepSql,
              wipeViews: options.wipeViews,
              clientOnly: options.clientOnly,
              databaseOnly: options.databaseOnly,
              queryDirect: options.queryDirect
            });
          };

        credsClone.database = database;
        dataSource.query(existsSql, credsClone, function (err, res) {
          if (err) {
            callback(err);
            return;
          }
          if (res.rowCount === 0) {
            // xt.ext doesn't exist, because this is probably a brand-new DB.
            // No problem! Give them empty set.
            adaptExtensions(null, { rows: [] });
          } else {
            dataSource.query(extSql, credsClone, adaptExtensions);
          }
        });
      },

      // Build the application according to the buildSpecs
      buildToSpec = function (specs, creds, buildCallback) {
        buildClient(specs, function (err, res) {
          if (err) {
            buildCallback(err);
            return;
          }
          buildDatabase(specs, creds, function (databaseErr, databaseRes) {
            var returnMessage;
            if (databaseErr && specs[0].wipeViews) {
              buildCallback(databaseErr);
              return;

            } else if (databaseErr) {
              buildCallback("Build failed. Try wiping the views next time by running me with the -w flag.");
              return;
            }
            returnMessage = "\n";
            _.each(specs, function (spec) {
              returnMessage += "Database: " + spec.database + '\nDirectories:\n';
              _.each(spec.extensions, function (ext) {
                returnMessage += '  ' + ext + '\n';
              });
            });
            buildCallback(null, "Build succeeded." + returnMessage);
          });
        });
      };

    /**
     * Go through the commander options and build the app accordingly.
     *
     *   -b, --backup [/path/to/the.backup], Location of database backup file. Must be used with the -i flag.
     *   -c, --config [/path/to/alternate_config.js], Location of datasource config file. [config.js]
     *   -d, --database [database name], Use specific database. [All databases in config file.]
     *   -e, --extension [/path/to/extension], Extension to build. [Core plus all extensions registered for the database.]
     *   -i, --initialize, Initialize database. Must be used with the -b flag.
     *   -k, --keepsql, Do not delete the temporary sql files that represent the payload of the build.
     *   -q, --querydirect, Query the database directly, without delegating to psql.
     *   -u, --unregister, Unregister an extension.
     *   -w, --wipeviews, Drop the views and the orm registrations pre-emptively.
     *   -y, --clientonly, Only rebuild the client.
     *   -z, --databaseonly', Only rebuild the database.
     */

    // Load the application configuration config.js.
    var resolvedPath = resolvePath(options.config);
    if (resolvedPath) {
      config = require(resolvedPath);
    } else {
      config = require(path.join(__dirname, "../../node-datasource/config.js"));
    }

    // Set Database Credentials
    creds = config.databaseServer;
    creds.host = creds.hostname; // adapt our lingo to node-postgres lingo
    creds.username = creds.user; // adapt our lingo to orm installer lingo

    // Build all databases in node-datasource/config.js unless the user set.
    if (options.database) {
      databases.push(options.database);
    } else {
      databases = config.datasource.databases;
    }

    // The user should set both clientOnly & databaseOnly flags. Warn them!
    if (options.clientOnly && options.databaseOnly) {
      callback("You set both clientOnly & databaseOnly flags. Use only one.");
    }

    // Initialize the database. This is serious business, and we only do it if
    // the user does all the arguments correctly. Must be on one database only,
    // with no extensions, with the initialize flag, and with a backup file.
    if (
        options.initialize &&
        options.backup &&
        options.database &&
        !options.extension
    ) {

      buildSpecs.database = options.database;
      buildSpecs.backup = resolvePath(options.backup);
      buildSpecs.initialize = true;
      buildSpecs.keepSql = options.keepSql;
      buildSpecs.wipeViews = options.wipeViews;
      buildSpecs.clientOnly = options.clientOnly;
      buildSpecs.databaseOnly = options.databaseOnly;
      buildSpecs.queryDirect = options.queryDirect;
      buildSpecs.extensions = [
        // path.join(__dirname, '../../lib/orm'),
        // path.join(__dirname, '../../enyo-client')
      ];

      buildToSpec([buildSpecs], creds, callback);
    }

    // Alert the user they must also specify a database.
    else if (options.initialize || options.backup) {
      callback(
        "You want to initialize the database with a backup but you didn't " +
        "tell us which database to use. Specifiy the database with the -d flag."
      );

    }

    // The user has specified an extension to build or unregister.
    else if (options.extension) {
      buildSpecs = _.map(databases, function (database) {
        var extension = resolvePath(options.extension);
        return {
          database: database,
          keepSql: options.keepSql,
          wipeViews: options.wipeViews,
          clientOnly: options.clientOnly,
          databaseOnly: options.databaseOnly,
          queryDirect: options.queryDirect,
          extensions: [extension]
        };
      });

      if (options.unregister) {
        unregister(buildSpecs, creds, callback);
      } else {
        // synchronous build
        buildToSpec(buildSpecs, creds, callback);
      }
    }

    // Build all registered extensions for the database
    else {
      async.map(databases, getRegisteredExtensions, function (err, results) {
        // asynchronous...
        buildToSpec(results, creds, callback);
      });
    }
  };
}());
