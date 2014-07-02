// @author: Christopher Rankin

var _							= require('underscore'),
		async					= require('async'),
		exec					= require('child_process').exec,
		fs						= require('fs'),
		ormInstaller	= require('../orm'),
		path					= require('path'),
		pg						= require('pg'),
		dataSource		= require('../../../node-datasource/lib/ext/datasource').dataSource;
		logger				= require('./logger').logger;

(function () {
	"use strict";
	
  var jsInit = "select xt.js_init();";

	/**
		* Queries can be sent via the REST service or psql. They sare the
		* same interface. However I'm not sure how I feel about having
		* options argument on both just to set "keepsql". Should we 
		* really be passing the whole arguments has in here? We probably
		* want to find a better way of handling this.
		*/

	// Send query via REST service.
	var sendToDatabaseDatasource = function (query, creds, options, callback) {
	  dataSource.query(query, creds, callback);
	};
	
	// Execute psql command locally.
	var sendToDatabasePsql = function (query, creds, options, callback) {
	  var filename = path.join(__dirname, "../../sql/temp_query_" + creds.database + ".sql");
	  fs.writeFile(filename, query, function (err) {
	    if (err) {
	      logger.error("Cannot write query to file: " + filename);
	      callback(err);
	      return;
	    }
	    var psqlCommand = 'psql -d ' + creds.database +
	          ' -U ' + creds.username +
	          ' -h ' + creds.hostname +
	          ' -p ' + creds.port +
	          ' -f ' + filename +
	          ' --single-transaction';
	    exec(psqlCommand, {maxBuffer: 40000 * 1024 /* 20x default */}, function (err, stdout, stderr) {
	      if (err) {
	        logger.error("Cannot install file ", filename);
	        callback(err);
	        return;
	      }
	      if (options.keepsql) {
	        // Do not delete the temp query file
	        logger.info("SQL file kept as ", filename);
	        callback();
	      } else {
	        fs.unlink(filename, function (err) {
	          if (err) {
	            logger.error("Cannot delete written query file.");
	            callback(err);
	          }
	          callback();
	        });
	      }
	    });
	  });
	};

	var setQuerySender = function(direct) {
		var sender;
		var psqlPrepend = null;

		if (direct) {
			sender = sendToDatabaseDatasource;	
		}
		else {
			sender = sendToDatabasePsql;

			/**
				* Without this, when we delegate to exec psql 
				* the err var will not be set even on the case of error.
			*/
			psqlPrepend = "\\set ON_ERROR_STOP TRUE;\n";
		}

		return {
			send: sender,
			psqlPrepend: psqlPrepend
		};
	};

	var readConfig = function (opts) {
		var creds,
				config = require(
					path.join(__dirname, "../../../node-datasource/config.js")),
				databases = [];

    // Set Database Credentials
    creds = config.databaseServer;
    creds.host = creds.hostname; // adapt our lingo to node-postgres lingo
    creds.username = creds.user; // adapt our lingo to orm installer lingo

    // Build all databases in node-datasource/config.js unless the user set.
    if (opts.database) {
      databases = [opts.database];
    } else {
      databases = config.datasource.databases;
    }

		return {
			config: config, 
			creds: creds, 
			databases: databases
		}; 
	};

	// Entry point to build databse. Work is delegated from here.	
	exports.buildDatabase = function (opts) {
		// Opts has all command line arguments. Probably want to remove
		// opts._ in the caller.
	
		var configs = readConfig(opts),
				config = configs.config, 
				creds = configs.creds, 
				databases = configs.databases;

		var querySender = setQuerySender(opts.querydirect);

		_.each(databases, function (database) {
			logger.info("Wiping views from: " + database);
			// Wipe the views from the database.
			if (opts.wipeviews) {
				fs.readFile(path.join(
					__dirname, 
					"../../sql/delete_system_orms.sql"
				),
				function (err, wipeSql) {
    	 	  if (err) {
						logger.error("Unable to wipe views: ", err);
						process.exit(1);
    	 	  }

					wipeSql += jsInit + wipeSql;
					
					if (!opts.querydirect) {
						// Using psql, make sure error set.
						wipeSql += querySender.psqlPrepend;
					}
					
					creds.database = database;

					querySender.send(
						wipeSql, creds, opts, function (err, res) {
							if (err) {
								logger.error(err);
								process.exit(1);
							}
							else {
								logger.info("Success!");
								process.exit(0);
							}
						}	
					); 

    	 	});

			}

			// User wants to only build the DB for this extension.
			if (opts.extension) {
				
			} else { // Let's assume they want to build the whole DB.

			}

		});

			
	};

}());
