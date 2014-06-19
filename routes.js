(function () {
	"use strict";

	var discovery-v1alpha1 = require('./discovery-v1alpha1');
	var rest-v1alpha1 = require('./rest-v1alpha1');
	
	export.discovery-v1alpha1 = discovery-v1alpha1;
	export.rest-v1alpha1 = rest-v1alpha1;

}());

var express = require('express');
var router = express.Router();

/* Load route handlers */
var restDiscovery = require('./rest-discovery'),
    restRouter = require('./rest-router');

/* GET home page. */
router.get('/', function(req, res) {
  res.render('index', { title: 'Express' });
});

/* Discovery Service */
router.get('/:org/discovery/v1alpha1/apis/v1alpha1/rest', restDiscovery.getRest);
router.get('/:org/discovery/v1alpha1/apis/:model/v1alpha1/rest', restDiscovery.getRest);
router.get('/:org/discovery/v1alpha1/apis', restDiscovery.list);

/* REST API */
/*
	exports.restRouter = [
    passport.authenticate('bearer', { session: false }),
    restRouter.router
  ];
*/
app.post('/:org/api/v1alpha1/services/:service/:id', restRouter);
app.all('/:org/api/v1alpha1/resources/:model/:id', restRouter);
app.all('/:org/api/v1alpha1/resources/:model', restRouter);
app.all('/:org/api/v1alpha1/resources/*', restRouter);

module.exports = router;
