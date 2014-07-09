var _ = require('underscore'),
    fs = require('fs'),
    path = require('path');

(function() {
  'use strict';

  var extensionTestFolder = function(extensionPath) {
    var testPath = path.join(extensionPath, 'test');
    fs.mkdir(testPath);
  };
  
  var extensionDatabaseFolder = function(extensionPath) {
    var databasePath = path.join(extensionPath, 'database');
    
    fs.mkdir(databasePath, function() {
      fs.mkdir(path.join(databasePath, 'orm'), function() {
        var ormFolders = ['ext', 'models'];
        _.each(ormFolders, function(folder) {
          fs.mkdir(path.join(databasePath, 'orm', folder));
        });
      });
      
      fs.mkdir(path.join(databasePath, 'source'), function() {
        var sourceFiles = ['manifest.js'];
        _.each(sourceFiles, function(file) {
           fs.writeFile(path.join(databasePath, 'source', file));       
        });
      });
    });
  };

  var extensionClientFolder = function(extensionPath) {
    var clientPath = path.join(extensionPath, 'client'),
        folders = ['views', 'widgets', 'models'],
        files = ['package.js', 'core.js'];

    fs.mkdir(clientPath, function() {
      _.each(files, function(file) {
        fs.writeFile(path.join(clientPath, file));
      });
      _.each(folders, function(folder) {
        fs.mkdir(path.join(clientPath, folder));
      });

      fs.mkdir(path.join(clientPath, 'assets'), function() {
        var assetsFolders = ['stylesheets', 'images'];
        _.each(assetsFolders, function(folder) {
          fs.mkdir(path.join(clientPath, 'assets', folder));
        });
      });            
    });
  };

  var generateExtension = function(name) {
    var extensionDir = path.join(__dirname, '../../../lib/extensions', name);
    fs.mkdir(extensionDir, function() {
      extensionClientFolder(extensionDir);
      extensionDatabaseFolder(extensionDir);
      extensionTestFolder(extensionDir);
    });
  };

  exports.generateExtension = generateExtension;
  
}());
