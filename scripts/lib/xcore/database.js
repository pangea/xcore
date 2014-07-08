// @author: Christopher Rankin
// @author: dev@xtuple.org

var _					= require('underscore'),
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

	/**
	* Queries can be sent via the REST service or psql. They share the
	* same interface. However I'm not sure how I feel about having
	* options argument on both just to set "keepsql". Should we
	* really be passing the whole arguments has in here? We probably
	* want to find a better way of handling this.
	*/

	/** Send query via REST service.  */
	var sendToDatabaseDatasource = function (query, creds, options, callback) {
		dataSource.query(query, creds, callback);
	};


	/**
		* I'm not sure it's necessary to have this command when we can just
		* use the datasource directly in the above method. I think we should
		* deprecate this method for now until we can make a good case to keep
		* it around.
	*/
  /** Execute psql command locally. */
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
					/** Do not delete the temp query file */
					logger.info("SQL file kept as ", filename);
					callback(null, stdout);
				} else {
					fs.unlink(filename, function (err) {
						if (err) {
							logger.error("Cannot delete written query file.");
							callback(err);
						}
						callback(null, stdout);
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

    /**  Set Database Credentials  */
		creds = config.databaseServer;
    /** adapt our lingo to node-postgres lingo */
		creds.host = creds.hostname;
    /** adapt our lingo to orm installer lingo */
		creds.username = creds.user; 

		/** Build all databases in node-datasource/config.js unless the user set. */
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

	/**
		* wipeViews - A runList method
		* Removes default views from the database
	*/
	var wipeViews = function (opts, database) {
		return function (callback) {
			fs.readFile(path.join(
				__dirname,
				"../../sql/delete_system_orms.sql"
			),
			function (err, wipeSql) {
				if (err) {
					callback(err);
				}

				opts.allSql = opts.allSql + wipeSql;
				callback(null, "Wiping views from: " + database);
			});
		}
	};

	/**
		* initDatabase - A runList method
		* Drops and rebuild database from
		* a .backup file.
	*/
	var initDatabase = function(options) {
		return function (callback) {
			if (typeof options.file !== 'string') {
				callback("You must specificy a file path with --initialize");
			}

			var credsCopy = JSON.parse(JSON.stringify(options.creds));

			/** Calls to drop/create database need to be run on the "postgres" database. */
			credsCopy.database = "postgres";
			logger.info("Dropping database " + options.database);
			dataSource.query("drop database if exists " + options.database + ";", credsCopy, function (err, res) {
				if (err) {
					callback("drop db error" + err.message + err.stack + err);
				}

				logger.info("Creating and restoring database " + options.database);
				dataSource.query("create database " + options.database + " template template1", credsCopy, function (err, res) {
					if (err) {
						callback("create db error" + err.message + err.stack + err);
					}

					/**
					* Use exec to restore the backup. Reading the backup from
					* file into a string to query doesn't work because the
					* backup is a binary.
					*/
					exec(	"pg_restore -U " + options.creds.username +
					" -h " + options.creds.hostname +
					" -p " + options.creds.port +
					" -d " + options.database +
					" " + options.file, function (err, res) {
						if (err) {
							logger.warn("Ignoring restore db error", err);
						}
						//logger.info("Database initialization completed successfully.");
						callback(null, "Database initialization completed successfully.");
					});

				});
			});

		}
	};

	/**
		* getExistingOrms - A runList method
		* Tries to get a list of orms that
		* already exist in the database.
	*/
	var getExistingOrms = function(opts, creds) {
		return function (callback) {
			var existsSql = "select relname from pg_class where relname = 'orm'",
    	    ormTestSql = "select orm_namespace as namespace, " +
    	        " orm_type as type " +
    	        "from xt.orm " +
    	        "where not orm_ext;";

			dataSource.query(existsSql, creds, function (err, res) {
  		  if (err) {
  		    callback(err);
  		  }

  		  if (opts.wipeviews || res.rowCount === 0) {
          /**
           *  xt.orm doesn't exist, because this is probably a brand-new DB.
           *  No problem! That just means that there are no pre-existing ORMs.
           */
  		    opts.orms = [];
  		  } else {
  		    dataSource.query(ormTestSql, creds, function (err, res) {
  		      if (err) {
  		        callback(err);
  		      }
  		      opts.orms = res.rows;
  		    });
  		  }

				callback(null, "Built list of ORM's");
  		});
		}
	};

	/**
		* setExtensionsList - A runList method
		* Compiles a list of extensions in the
		* extension folder.
	*/
	var setExtensionsList = function (opts) {
		return function (callback) {
			fs.readdir(path.join(__dirname, '../../../lib/extensions/'), function (err, files) {
				if (err) {
					callback(err);
				}

				/** Get all the extension from lib/extensions */
				opts.extensions = _.union(opts.extensions, _.map(files, function (f) {
					return path.join(__dirname, '../../../lib/extensions', f);
				}));

				callback(null, "Built list of extensions.");
			});
		}
	};

	/**
		* buildExtensionAndOrmSql - A runList method
		* Concats all the extension and lib/orm Sql
		* in order and formats it.
	*/
	var buildExtensionAndOrmSql = function (opts) {
		return function (callback) {

			/** The function to install all the scripts for an extension */
			var getExtensionSql = function (extension, extensionCallback) {

				/**
         * Step 1:
				 * Deal with directory structure quirks
         */
				var isLibOrm = extension.indexOf("lib/orm") >= 0,
						isExtension = extension.indexOf("extensions") >= 0,
						dbSourceRoot = isLibOrm ?
							path.join(extension, "source") :
							path.join(extension, "database/source"),
						manifestFilename = path.join(dbSourceRoot, "manifest.js");

				/** 
         * Step 2:
				 * Read the manifest files.
         */
				fs.readFile(manifestFilename, "utf8", function (err, manifestString) {
					if (err) {
						extensionCallback(err);
					}

					var manifest,
					extensionName,
					loadOrder,
					extensionComment,
					extensionLocation,
					isFirstScript = true;
					try {
						manifest = JSON.parse(manifestString);
					} catch (error) {
						/** error condition: manifest file is not properly formatted */
						extensionCallback("Manifest is not valid JSON" + manifestFilename);
					}

					extensionName = manifest.name;
					extensionComment = manifest.comment;
					loadOrder = manifest.loadOrder || 999;
					if (isExtension) {
						extensionLocation = path.join(__dirname, "lib/extensions");
					}

					/**
           * Step 3:
					 * Concatenate together all the files referenced in the manifest.
           */
					var getScriptSql = function (filename, scriptCallback) {
						var fullFilename = path.join(dbSourceRoot, filename);
						fs.readFile(fullFilename, "utf8", function (err, scriptContents) {
							/** error condition: can't read script */
							if (err) {
								scriptCallback(err);
								return;
							}

							var beforeNoticeSql = 'do $$ plv8.elog(NOTICE, "About to run file ' + fullFilename + '"); $$ language plv8;\n',
							afterNoticeSql = 'do $$ plv8.elog(NOTICE, "Just ran file ' + fullFilename + '"); $$ language plv8;\n',
							formattingError,
							lastChar;

							/**
							 * Allow inclusion of js files in manifest. If it is a js file,
							 * use plv8 to execute it.
							*/
							//if (fullFilename.substring(fullFilename.length - 2) === 'js') {
							// this isn't quite working yet
							// http://adpgtech.blogspot.com/2013/03/loading-useful-modules-in-plv8.html
							// put in lib/orm's manifest.js: "../../tools/lib/underscore/underscore-min.js",
							//  scriptContents = "do $$ " + scriptContents + " $$ language plv8;";
							//}

							/**
							 * Incorrectly-ended sql files (i.e. no semicolon) make for unhelpful error messages
							 * when we concatenate 100's of them together. Guard against these.
							 */
							scriptContents = scriptContents.trim();
							lastChar = scriptContents.charAt(scriptContents.length - 1);
							if (lastChar !== ';') {
								/** error condition: script is improperly formatted */
								formattingError = "Error: " + fullFilename + " contents do not end in a semicolon.";
								scriptCallback(formattingError);
							}

							if (!isLibOrm || !isFirstScript) {
								/**
								* To put a noticeSql *before* scriptContents we have to										 * account for the very first script, which is
								* create_plv8, and which must not have any plv8
								* functions before it, such as a noticeSql.
								*/
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

						/**
						* Each String of the scriptContents is the concatenated SQL								 * for the script. Join these all together into a single
						* string for the whole extension.
						*/
						var extensionSql = scriptSql.join('');

						if (!isLibOrm) {
							/**
               * Register extension and dependencies
               */
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

							/**
               * Unless it hasn't yet been defined (ie. lib/orm),
							 * running xt.js_init() is probably a good idea.
               */
							extensionSql = "select xt.js_init();" + extensionSql;
						}

						extensionCallback(null, extensionSql);

					});
					/**
					 * End script installation code
					 */
				});
			};

			/**
				* We also need to get the sql that represents the queries to
				* generate the XM views from the ORMs. We use the old ORM
				* installer for this, which has been retooled to return the
				* queryString instead of running it itself.
			*/
			var getOrmSql = function (extension, ormCallback) {
				var ormDir = path.join(extension, "database/orm");

				/**
					* Node fs.existsSync is supposedly not to be used as
					* stated here:
					* http://nodejs.org/api/fs.html#fs_fs_exists_path_callback
					* But this seems like a rare case when we would want
					* to use it. I'm afraid that it may one day be
					* deprecated so I'm not sure this code is futureproof.
					* We will need to keep an eye on it.
				*/
				if (fs.existsSync(ormDir)) {
	        var updateSpecs = function (err, res) {
	          if (err) {
	            ormCallback(err);
	          }

						/**
							* If the orm installer has added any new orms we want to
							* know about them so we can inform the next call to the
							* installer.
						*/
	          opts.orms = _.unique(_.union(opts.orms, res.orms), function (orm) {
	            return orm.namespace + orm.type;
	          });
	          ormCallback(err, res.query);
	        };

	        ormInstaller.run(ormDir, opts, updateSpecs);
	      } else {
	        /** No ORM dir? No problem! Nothing to install. */
	        ormCallback(null, "");
	      }
			};

			/**
				* The sql for each extension comprises the sql in the the source
				* directory with the orm sql tacked on to the end. Note that an
				* alternate methodology dictates that *all* source for all
				* extensions should be run before *any* orm queries for any
				* extensions, but that is not the way it works here.
			*/
			var getAllSql = function (extension, masterCallback) {
				var parseExt = extension.split('/');
				var extName = parseExt[parseExt.length - 1];

				logger.info("Building SQL for extension: " + extName);
				async.series([
					function (cb) {
						getExtensionSql(extension, cb);
					},
					function (cb) {
						getOrmSql(extension, cb);
					}
					],
					function (err, results) {
						masterCallback(err, results.join(''));
					}
				);
			};

			/**
			* Asyncronously run all the functions to all the extension sql
			* for the database, in series, and add the string to allSql when
			* complete.
			*/
			async.mapSeries(opts.extensions, getAllSql, function (err, extensionSql) {

				if (err) {
					logger.error(err);
					process.exit(1);
				}

				/**
				* Each String of the scriptContents is the concatenated SQL
				* for the extension. Join these all together into a single
				* string for the whole database.
				*/
				opts.allSql = opts.allSql + extensionSql.join('');

				/**
					* TODO: This should look up users who need all access by
					* role and then apply.
					* Also need to add wasInitialized to opts for init func.
				*/
				// if (spec.wasInitialized) {
				//   // give the admin user every extension by default
				//   allSql = allSql + "insert into xt.usrext (usrext_usr_username, usrext_ext_id) " +
				//     "select '" + creds.username +
				//     "', ext_id from xt.ext where ext_location = '/core-extensions';";
				// }

				/* Move this out of here */
				//winston.info("Applying build to database " + spec.database);
				//credsClone.database = spec.database;
				//sendToDatabase(allSql, credsClone, spec, function (err, res) {
				//  databaseCallback(err, res);
				//});

				callback(null, "Built all extension SQL");
			});
		}
	};

	/**
		* The basic strategy here is to put all the SQL we want run into
		* one big string so we can execute it as a single transaction.
		* We get a list of all the extensions we want build for each database
		* including lib/orm and concat it together in order. Once that's
		* done we send it to Postgres to be run.
	*/
	exports.buildDatabase = function (opts) {
		/**
     * Opts has all command line arguments. Probably want to remove
		 * opts._ in the caller.
     */

		var configs = readConfig(opts),
		config = configs.config,
		creds = configs.creds,
		databases = configs.databases,
		querySender = setQuerySender(opts.querydirect);

		_.each(databases, function (database) {
			opts.allSql = '';
			var runList = [];
			creds.database = database;

			/**
				* TODO:
				* This seems redundant to declare here. I think if we're
				* going to have multiple databases then we should be able
				* to specify which extensions we want for each database.
				* I.E one organization might not want all the extensions
				* as another organization or we may not want to expose
				* extensions to all organizations. This will require a
				* restructuring of the config.js file. So databses map
				* to extension list.
				*
				* If we do that then we'll also have to refactor the
				* if (opts.extension) logic below and getOrmSql function
				* to accomdate for this.
			**/
			opts.extensions = [path.join(__dirname, '../../../lib/orm')];

			/** Wipe the views from the database if flagged. */
			if (opts.wipeviews) {
				runList.push(wipeViews(opts.allSql, database));
			}

			/** Wipe the database and start from scratch with a ".backup" file */
			if (opts.initialize) {
				runList.push(initDatabase({
					file: opts.initialize,
					creds: creds,
					database: database
				}));
			}

			/** User wants to only build the DB for this extension. */
			if (opts.extension) {
				if (typeof opts.extension == 'boolean') {
					logger.error("You have to specify an extension name when using the --extension flag.");
					process.exit(1);
				}

				opts.extensions.push('../../../lib/extensions/' + opts.extension);
			} else { 
        /** Let's assume they want to build the whole DB. */
				runList.push(setExtensionsList(opts));
			}

      /** Before database is installed check for existing ORMs. */
			runList.push(getExistingOrms(opts, creds));

			/** This is where the heavy lifting is done. Pulls together all the SQL */
			runList.push(buildExtensionAndOrmSql(opts));

			/** Process the runList and execute allSql when ready. */
			async.series(runList, function (err, res) {
				if (err) {
					logger.error(err);
					process.exit(1);
				}

				_.each(res, function(r) { logger.info(r); });

			//	sendToDatabaseDatasource(
			//		opts.allSql, creds, opts, function (err, qres) {
			//			if (err) {
			//				logger.error(err.message);
			//				logger.error(err.stack);
			//				process.exit(1);
			//			}
			//			else {
			//				logger.info("Build completed successfully.");
			//				process.exit(0);
			//			}
			//		}
			//	);

				/**
         * Not sure why datasource runs extension sql and psql does not.
				 * Will have to look into this further. Also don't have a use
				 * case for sending to psql directly. So it may not eveb be
				 * necessary to provide both options.
         */
				querySender.send(
					opts.allSql, creds, opts, function (err, qres) {
						if (err) {
							logger.error(err);
							process.exit(1);
						}
						else {
							logger.info("Build completed successfully.");
							process.exit(0);
						}
					}
				);
			});

	});

};

}());
