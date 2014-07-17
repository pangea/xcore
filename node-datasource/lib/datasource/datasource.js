/*jshint node:true*/
/*global require,exports,X*/
(function() {
  "use strict";
  var knex = require('knex');

  module.exports = function(config) {
    var DB = knex({
          client: 'pg',
          connection: config
        });

    return DB;
  };
}());
