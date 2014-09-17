/*jshint node:true */
/*global require, exports, __dirname, _, jsonpatch, SYS, XT, X*/
_ = require("underscore");
jsonpatch = require("fast-json-patch");
SYS = {};
XT = { };

var Debug = false;

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

  Debug = X.options.datasource.debugging;

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
  var encryptionKeyFilename = X.options.datasource.saltFile;
  if(X.fs.existsSync(encryptionKeyFilename)) {
    X.options.encryptionKey = X.fs.readFileSync(encryptionKeyFilename, "utf8");
  } else {
    X.options.encryptionKey = Math.random().toString(36).slice(2);
    X.fs.writeFile(encryptionKeyFilename, X.options.encryptionKey);
  }

  // TODO: Once we get around to having proper :org handling, we should convert
  //       this to make one connection for each database.
  var dbConf = X.options.databaseServer;
  dbConf.database = X.options.datasource.databases[0];

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

  X.dbListeners = {};

  X.DB.Listen("nodext", function(msg) {
    var handler;
    if(_.isObject(msg)) {
      handler = msg.handler;
      delete msg.handler;

      if(handler) {
        if(X.dbListeners[handler]) {
          X.dbListeners[handler].call(null, msg);
        } else {
          X.err("No listeners found for handler '" + handler + "'");
        }
      }
    } else {
      console.log(msg);
    }
  });

}());

// Configure Express Application
var express = require('express'),
    Session = require('express-session'),
    Store = require('connect-session-knex')(Session),
    passport = require('passport'),
    path = require('path'),
    favicon = require('serve-favicon'),
    logger = require('morgan'),
    CookieParser = require('cookie-parser'),
    bodyParser = require('body-parser'),
    routes = require('./routes/routes'),
    cookieParser = CookieParser(X.options.encryptionKey),
    sessionStore = new Store({
      knex: X.DB,
      tablename: 'xcore_sessions'
    }),
    // These are stored separately for use in Primus
    session = Session({
      secret: X.options.encryptionKey,
      store: sessionStore,
      cookie: { secure: true },
      resave: false,
      saveUninitialized: false
    }),
    passportInit = passport.initialize(),
    passportSession = passport.session();

var app = express();
X.app = app;  // Never know when this might come in handy

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(favicon(path.join(__dirname, 'public/images/icon.png')));
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded());
app.use(cookieParser);
app.use(require('less-middleware')(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'public')));

// Initialize Session
// TODO: Clear old sessions?
app.use(session);
app.use(passportInit);
app.use(passportSession);

// TODO: Document the fuck out of this vvvvvvv
var auth = require(X.options.datasource.authentication);

// DISCOVERY SERVICE
//app.use('/:org/discovery/v1alpha1/apis/v1alpha1/rest', routes.discovery_v1alpha1.getRest);
//app.use('/:org/discovery/v1alpha1/apis/:model/v1alpha1/rest', routes.discovery_v1alpha1.getRest);
//app.use('/:org/discovery/v1alpha1/apis', routes.discovery_v1alpha1.list);
//
//app.post('/:org/api/v1alpha1/services/:service/:id', routes.rest_v1alpha1);
//app.use('/:org/api/v1alpha1/resources/:model/:id', routes.rest_v1alpha1);
//app.use('/:org/api/v1alpha1/resources/:model', routes.rest_v1alpha1);
//app.use('/:org/api/v1alpha1/resources/*', routes.rest_v1alpha1);

// PAYMENTS GATEWAY
app.post('/payments', routes.payment_gateway.pay);

app.use('/login', auth({
                    successRedirect: '/app',
                    failureRedirect: '/?fail'
                  }));

app.use('/logout', function(req, res) {
  req.logout();
  res.redirect('/');
});

app.use('/app', function(req, res) {
  var user = req.user;
  if(!user || !user.groups) {
    return res.redirect('/');
  }
  res.render('index', { title: 'xCore', user: user });
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

var https = require('https'),
    server = https.createServer({
      key: X.fs.readFileSync(X.options.datasource.keyFile),
      cert: X.fs.readFileSync(X.options.datasource.certFile)
    }, app);

var Primus = require('primus'),
    io = new Primus(server),
    allowedVerbs = ['GET', 'POST', 'PATCH', 'DELETE'],
    doNotify = function(handler, data) {
      var msg = {
            handler: handler
          };

      _.extend(msg, data);

      X.DB.Notify("nodext", msg);
    },
    doModelUpdate = function(data) {
      doNotify("ModelUpdate", data);
    },
    doModelDelete = function(data) {
      doNotify("ModelDelete", data);
    },
    responseHandlers = {
      'GET' : function(resp) {
        return JSON.parse(resp.rows[0].get);
      },
      'POST' : function(resp) {
        var post = JSON.parse(resp.rows[0].post);
        if(post.patches) {
          post.data = { patches: post.patches };
          delete post.patches;
        }
        doModelUpdate(post);
        return post;
      },
      'PATCH' : function(resp) {
        var patch = JSON.parse(resp.rows[0].patch);
        patch.data = { patches: patch.patches };
        delete patch.patches;
        doModelUpdate(patch);
        return patch;
      },
      'DELETE' : function(resp) {
        var del = JSON.parse(resp.rows[0].delete);
        doModelDelete(del);
        return del;
      }
    };

// Save compiled client library
io.save(X.path.join(__dirname, 'public', 'javascripts', 'primus.js'));

// IMPORTANT!!
// These middlewares MUST be the same as the ones used for Express
// If they are not, sessions may not properly propagate between Express and Primus
io.before('cookie', cookieParser);
io.before('session', session);
// io.before('passport init', passportInit);
// io.before('passport sess', passportSession);

io.on('connection', function(sock) {
  var user;
  try {
    user = JSON.parse(sock.request.session.passport.user);
  } catch(e) {
    sock.end('forbidden');
  }

  sock.on('data', function(payload) {
    var verb = payload.method,
        msg = payload.data;

    if(_.include(allowedVerbs, verb)) {
      if(Debug) { console.log(verb, 'request', msg); }
      X.DB.Rest(verb, msg, user.uid, function(error, resp) {

        var parsed,
            response = { 
              handler: 'response',
              reqId: payload.reqId
            };

        if(error) {
          response.error = error;
        } else {
          try {
            parsed = responseHandlers[verb].call(null, resp);
            if(_.isArray(parsed)) {
              response.data = parsed;
            } else {
              _.extend(response, parsed);
            }
          } catch(e) {
            response.error = e;
          }
        }

        if(Debug) { console.log('response', response); }

        sock.write(response);
      });
    }
  });
});

// Add our listeners
_.extend(X.dbListeners, {
  "ModelUpdate": function(msg) {
    msg.handler = 'update';
    io.write(msg);
  },
  "ModelDelete": function(msg) {
    msg.handler = 'delete';
    io.write(msg);
  }
});

server.listen(8443);
