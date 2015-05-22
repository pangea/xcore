    // External libraries
var externals = require('externals'),
    _ = externals._,
    jsonpatch = externals.jsonpatch,

    // Internal globals
    xCore = {},
    XV = {},
    XM = {},

    // A specific error type we can use in our abstract interface kinds
    NotImplementedError = function(message) {
      if(message) {
        this.message = message;
      }
      this.stack = (new Error()).stack;
    };

NotImplementedError.prototype = new Error;
NotImplementedError.prototype.name = 'NotImplementedError';
NotImplementedError.prototype.message = 'Subkinds must implement this behavior';
