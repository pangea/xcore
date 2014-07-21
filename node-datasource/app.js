/*jshint node:true */
/*global require, exports, __dirname, _, jsonpatch, SYS, XT, X*/
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
  // var datasource = require("./lib/ext/datasource");
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

  // TODO: Once we get around to having proper :org handling, we should convert
  //       this to make one connection for each database.
  var dbConf = X.options.databaseServer;
  dbConf.database = 'dev';

  X.DB = require('./lib/datasource')(dbConf);
  X.Query = require('./lib/query');

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
var express = require('express'),
    session = require('express-session'),
    passport = require('passport'),
    path = require('path'),
    favicon = require('serve-favicon'),
    logger = require('morgan'),
    cookieParser = require('cookie-parser'),
    bodyParser = require('body-parser'),
    routes = require('./routes/routes');

var app = express();
X.app = app;  // Never know when this might come in handy

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

// TODO: This is a first pass and should NOT BE PART OF THE FINAL PRODUCT!!!!!!!
// Session shit
app.use(session({
  secret: 'SUPER SECRET!!!',
  resave: false,
  saveUninitialized: false
}));
app.use(passport.initialize());
app.use(passport.session());

// TODO: Document the fuck out of this vvvvvvv
var auth = require('../lib/extensions/authentication');

// DISCOVERY SERVICE
//app.use('/:org/discovery/v1alpha1/apis/v1alpha1/rest', routes.discovery_v1alpha1.getRest);
//app.use('/:org/discovery/v1alpha1/apis/:model/v1alpha1/rest', routes.discovery_v1alpha1.getRest);
//app.use('/:org/discovery/v1alpha1/apis', routes.discovery_v1alpha1.list);
//
//app.post('/:org/api/v1alpha1/services/:service/:id', routes.rest_v1alpha1);
//app.use('/:org/api/v1alpha1/resources/:model/:id', routes.rest_v1alpha1);
//app.use('/:org/api/v1alpha1/resources/:model', routes.rest_v1alpha1);
//app.use('/:org/api/v1alpha1/resources/*', routes.rest_v1alpha1);

app.use('/login', auth({
                    successRedirect: '/app',
                    failureRedirect: '/?fail'
                  }));

app.use('/app', function(req, res) {
  var user = req.user;
  if(!user || !user.groups) {
    return res.redirect('/');
  }
  res.render('index', { title: 'xCore' });
});

app.use('/', function(req, res) {
  var message = false,
      user = req.user;

  if(user && user.groups) {
    return res.redirect('/app');
  }

  if(req.query.fail !== undefined) {
    message = 'Invalid Username or Password';
  }

  res.render('login', { title: 'xCore login', message: message });
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

var io = require('socket.io')({ serveClient: true, path: '/clientsock' }),
    nsp = io.of('/clientsock');

X.sock = io; // keep a copy of io on X so we can use it elsewhere as needed

io.on('connection', function(socket) {
  console.log('websocket connected', socket.id);
  // this can probably be used to do session management since it's always called
});

nsp.on('connection', function(socket) {
  console.log('websocket connected on clientsock');

  _.each(['GET', 'POST', 'PATCH', 'DELETE'], function(verb) {
    socket.on(verb, function(msg) {
      X.DB.Rest(verb, msg.data, 'admin', function(error, rows) {
        var response = { reqId: msg.reqId };

        if(error) {
          response.error = error;
        } else {
          response.data = rows;
        }

        socket.emit('response', response);
      });
    });
  });
});

exports.router = app;
exports.socket = io;
