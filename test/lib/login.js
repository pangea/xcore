(function() {
  
  var zombie = require('zombie'),
      secondsToWait = 40;
  
  var loadApp = function(callback) {
    zombie.visit('https://localhost:8443/', function(e, browser) {
      var timeout = setTimeout(function() {
        console.log('App did not load');
        process.exit(1);
      }, secondsToWait * 1000);
      
      var interval = setInterval(function() {
        if (browser.window.xCore) {
          application = browser.window;
          clearInterval(interval);
          clearTimeout(timeout);
          callback();
        }
      }, 100);      
    });
  };

  exports.loadApp = loadApp; 
})();
