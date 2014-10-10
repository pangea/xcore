(function () {
	"use strict";

	var discoveryV1Alpha1	= require('./discovery-v1alpha1'),
			restV1Alpha1 			= require('./rest-v1alpha1'),
      wufooHandler      = require('./wufoo/wufoo-handler'),
			data 							= require('./data');      


	// DISCOVERY SERVICE
	exports.discovery_v1alpha1 = discoveryV1Alpha1;
	exports.rest_v1alpha1 = restV1Alpha1.router[0];

	// DATABASE
	exports.queryDatabase = data.queryDatabase;

  // WUFOO
  exports.wufoo_handler = wufooHandler;
}());
