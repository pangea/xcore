/*jshint node:true*/
/*global require,exports,X*/
(function() {
  "use strict";
  var knex = require('knex'),
      debugMode = !!X.options.datasource.debugging;

  module.exports = function(config) {
    var pool= {
          min: 2,
          max: 20
        },
        conf = X._.clone(config);

    if(debugMode) {
      console.log('connecting to database\n', conf);
    }

    // convert xTuple style host declaration to Knex style
    if(conf.hostname && !conf.host) {
      conf.host = conf.hostname;
      delete conf.hostname;
    }

    if(conf.pool) {
      X._.extend(pool, conf.pool);
      delete conf.pool;

      // ensure min is greater than max
      if(pool.min > pool.max) {
        pool.max = pool.min;
      }
    }

    var DB = knex({
          client: 'pg',
          connection: conf,
          debug: debugMode,
          pool: pool
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

      if(method == 'PATCH') {
        payload.patches = payload.data;
        delete payload.data;
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

    DB.Listen = function(channel, handler) {
      DB.client.acquireConnection().then(function(conn) {
        conn.on('notification', function(msg) {
          var payload = msg.payload;

          try {
            payload = JSON.parse(payload);
          } catch(e) {
            // payload isn't JSON.  Nothing to do here but squelch the error.
          } finally {
            handler(payload);
          }
        });

        conn.query("LISTEN " + channel);
        X.log("Listening for notifications on the ", channel, " channel for ", DB.client.database());
      });
    };

    DB.Notify = function(channel, data) {
      if(_.isObject(data)) {
        data = JSON.stringify(data);
      }

      DB.raw("NOTIFY %@, $notify$%@$notify$".f(channel, data)).exec();
    };

    return DB;
  };
}());
