    // External libraries
var externals = require('externals'),
    _ = externals._,
    jiff = externals.jiff,

    // Internal globals
    xCore = {},
    XV = {},
    XM = {},

    // A specific error type we can use in our abstract interface kinds
    NotImplementedError = function(message) {
      this.message = message;
      this.stack = (new Error()).stack;
    };

NotImplementedError.prototype = new Error;
NotImplementedError.prototype.name = 'NotImplementedError';
NotImplementedError.prototype.message = 'Subkinds must implement this behavior';
