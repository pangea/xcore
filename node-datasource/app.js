_ = require("underscore");
jsonpatch = require("json-patch");
SYS = {};
XT = { };

(function () {
  "use strict";

  var options = require("./lib/options"),
    authorizeNet,
    sessionOptions = {};

  // Include the X framework.
  require("./lib/xt");

  // Grab the version number from the package.json file.
  var packageJson = X.fs.readFileSync("../package.json");
  try {
    X.version = JSON.parse(packageJson).version;
  } catch (error) {
    console.log("Error: X framework not available.");
  }

  // Loop through files and load the dependencies.
  // Apes the enyo package process
  // TODO: it would be nice to use a more standardized way
  // of loading our libraries (tools and backbone-x) here
  // in node.
  X.relativeDependsPath = "";
  X.depends = function () {
    var dir = X.relativeDependsPath,
      files = X.$A(arguments),
      pathBeforeRecursion;

    _.each(files, function (file) {
      if (X.fs.statSync(X.path.join(dir, file)).isDirectory()) {
        pathBeforeRecursion = X.relativeDependsPath;
        X.relativeDependsPath = X.path.join(dir, file);
        X.depends("package.js");
        X.relativeDependsPath = pathBeforeRecursion;
      } else {
        require(X.path.join(dir, file));
      }
    });
  };

  // Load other xTuple libraries using X.depends above.
  X.relativeDependsPath = X.path.join(X.basePath, "../lib/tools/source");
  require("../lib/tools");

  // Argh!!! Hack because `XT` has it's own string format function that
  // is incompatible with `X`....
  String.prototype.f = function () {
    return X.String.format.apply(this, arguments);
  };

  // Another hack: quiet the logs here.
  XT.log = function () {};

  // Set the options.
  X.setup(options);

  // load some more required files
  var datasource = require("./lib/ext/datasource");
  //require("./lib/ext/models");
  //require("./lib/ext/smtp_transport");

  // TODO: I'm not sure the purpose of this listener. So I'm
  // disabling until further investigation. -crankin
  /*
  datasource.setupPgListeners(X.options.datasource.databases, {
    email: X.smtpTransport.sendMail
  });
  */

  // load the encryption key, or create it if it doesn't exist
  // it should created just once, the very first time the datasource starts
  var encryptionKeyFilename = './lib/private/encryption_key.txt';
  X.fs.exists(encryptionKeyFilename, function (exists) {
    if (exists) {
      X.options.encryptionKey = X.fs.readFileSync(encryptionKeyFilename, "utf8");
    } else {
      X.options.encryptionKey = Math.random().toString(36).slice(2);
      X.fs.writeFile(encryptionKeyFilename, X.options.encryptionKey);
    }
  });

	/**
		* TODO: Read xtuple/enyo-client/application/lib/backbone-x/source/ext/session.js
		* In that file permissions for the core app & extensions are loaded along
		* with settings. Associations for backbone-relational are also configured.
		* Since we aren't using backbone our core extensions. We need to
		* refactor this file to work with Enyo's data layer and put it
		* in a place that makes more sense.
  sessionOptions.username = X.options.databaseServer.user;
  sessionOptions.database = X.options.datasource.databases[0];
  XT.session = Object.create(XT.Session);
  XT.session.schemas.SYS = false;
  XT.session.loadSessionObjects(XT.session.SCHEMA, sessionOptions);
  XT.session.loadSessionObjects(XT.session.PRIVILEGES, sessionOptions);
	*/

}());



// Configure Express Application
var express = require('express');
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var routes = require('./routes/routes');

var app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(favicon(path.join(__dirname, 'public/images/icon.png')));
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded());
app.use(cookieParser());
app.use(require('less-middleware')(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'public')));

// DISCOVERY SERVICE
//app.use('/:org/discovery/v1alpha1/apis/v1alpha1/rest', routes.discovery_v1alpha1.getRest);
//app.use('/:org/discovery/v1alpha1/apis/:model/v1alpha1/rest', routes.discovery_v1alpha1.getRest);
//app.use('/:org/discovery/v1alpha1/apis', routes.discovery_v1alpha1.list);
//
//app.post('/:org/api/v1alpha1/services/:service/:id', routes.rest_v1alpha1);
//app.use('/:org/api/v1alpha1/resources/:model/:id', routes.rest_v1alpha1);
//app.use('/:org/api/v1alpha1/resources/:model', routes.rest_v1alpha1);
//app.use('/:org/api/v1alpha1/resources/*', routes.rest_v1alpha1);

app.use('/', function(req, res) {
  res.render('index', { title: 'xCore' });
});

/// catch 404 and forward to error handler
app.use(function(req, res, next) {
    var err = new Error('Not Found');
    err.status = 404;
    next(err);
});

/// error handlers

// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
    app.use(function(err, req, res, next) {
        res.status(err.status || 500);
        res.render('error', {
            message: err.message,
            error: err
        });
    });
}

// production error handler
// no stacktraces leaked to user
app.use(function(err, req, res, next) {
    res.status(err.status || 500);
    res.render('error', {
        message: err.message,
        error: {}
    });
});


module.exports = app;
