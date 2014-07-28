/*jshint node:true*/
/*global require,exports,X*/
(function() {
  "use strict";
  var knex = require('knex'),
      debugMode = !!X.options.datasource.debugging;

  module.exports = function(config) {
    if(debugMode) {
      console.log('connecting to database\n', config);
    }
    var DB = knex({
          client: 'pg',
          connection: config,
          debug: debugMode
        });

    DB.Rest = function(method, payload, user, callback) {
      var query;

      if(payload.query) {
        query = new X.Query.XtGetQuery(payload.query);
      }

      if(query && !query.isValid()) {
        if(debugMode) {
          console.log('invalid query\n',payload.query);
        }
        return callback(query.getErrors());
      }

      DB.transaction(function(trans) {
        return trans.raw("SELECT xt.js_init(%@);".f(debugMode ? "true" : ""))
          .then(
            function() {
              payload.username = user;
              payload.encryptionKey = X.options.encryptionKey;
              var sql = "SELECT xt.%@($$%@$$);".f(method.toLowerCase(), JSON.stringify(payload));
              return trans.raw(sql);
            }
          );
      }).then(
        function(rows) {
          if(debugMode) { console.log(rows); }
          callback(null, rows);
        },
        function(error) {
          if(debugMode) { console.error(error); }
          callback({ message: error.message, detail: error.detail, stack: error.stack.split('\n') });
        }
      );
    };

    return DB;
  };
}());
