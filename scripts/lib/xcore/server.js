(function() {
  "use strict";
  var path = require('path'),
      spawn = require('child_process').spawn;
  exports.start = function() {
    spawn('npm', ['start'], {
      cwd: path.join(__dirname, '../../../node-datasource'),
      env: process.env,
      stdio: 'inherit'
    });
  };
}());
