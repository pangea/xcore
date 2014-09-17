(function () {
	"use strict";

	var discoveryV1Alpha1	= require('./discovery-v1alpha1'),
			restV1Alpha1 			= require('./rest-v1alpha1'),
      paymentGateway    = require('./payment-gateway'),
			data 							= require('./data');


	// DISCOVERY SERVICE
	exports.discovery_v1alpha1 = discoveryV1Alpha1;
	exports.rest_v1alpha1 = restV1Alpha1.router[0];

  // PAYMENT GATEWAY
  exports.payment_gateway = paymentGateway;

	// DATABASE
	exports.queryDatabase = data.queryDatabase;

}());
