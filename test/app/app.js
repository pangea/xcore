(function() {
  'use strict';

  var zombie = require('zombie'),
      _ = require('underscore'),
      loadApp = require('../lib/login.js').loadApp,
      assert = require('chai').assert,
      sinon = require('sinon'),
      xCore;

  before(function (done) {
    this.timeout(50000);
    var appLoaded = function() {
      xCore = application.xCore;
      done();
    };
    loadApp(appLoaded)
  });

  describe('mainview', function(done) {
    it('already has a gui', function(done) {
      assert.ok(xCore.view);
      done();
    });
  });
       
  describe('registering an extension', function(done) {
    
    var validExtension; 

    before(function (done) {
      var requiredFields = xCore._requiredExtensionFields;
      validExtension = { loadSubList: function() {} };
      
      _.each(requiredFields, function(field) {
        validExtension[field] = 'not null';
      });
      done();
    });

    describe('#extensionIsValid', function(done) {
      it ('returns true if the extension has the required fields', function(done) {
        assert.isTrue(xCore.extensionIsValid(validExtension));
        done();
      });
      
      it('throws an error if it doesnt', function(done) {
        var extension = {};

        assert.throw(function() {xCore.extensionIsValid(extension)}, /(missing required field)/);
        done();
      });
    });

    describe('#registerExtension', function(done) {
      it('can register a valid module by its name', function(done) {
        var name = validExtension.name;
        xCore.registerExtension(validExtension);
        assert.isTrue(xCore._registeredExtensions[name] === validExtension);
        done();
      });
      it('registers the extension on the gui', function(done) {
        var gui = sinon.mock(xCore.view);
        gui.expects('registerExtension');
        xCore.registerExtension(validExtension);
        gui.verify();
        done();
      });
    });
  });  
})();
