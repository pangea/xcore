/*jshint*/
/*global io, enyo*/
(function() {
  "use strict";
  var socket = xCore.socket = io('/clientsock');

  socket.on('session expired', function(err) {
    alert('You session has expired.  Please log in again.');
    location.replace('/');
  });

  socket.on('response', function(msg) {
    var req = enyo.store.getRecord(msg.reqId);

    if(msg.error) {
      req.fail(msg.error);
    } else {
      req.success(msg.data);
    }
  });

  socket.on('update', function(msg) {
    // not used right now.  Will be used for unsolicited model updates from
    // the server
    console.log(msg);
  });
}());

(function() {
  enyo.kind({
    name: 'XM.WebsocketRequest',
    kind: 'enyo.Model',
    defaults: {
      method: 'GET',
      data: null
    },
    constructor: function() {
      this.inherited(arguments);

      var payload = {
            reqId: this.euid
          },
          data = this.get('data');

      if(!xCore.socket) {
        throw "No websocket connection exists in xCore.socket.  Did you destroy it?";
      }

      if(!data) {
        throw "WebsocketRequests must have `data` to send";
      }

      if(typeof data === 'function') {
        data = data.call(this);
      }

      payload.data = data;
      xCore.socket.emit(this.get('method'), payload);
    },
    success: function() {
      throw new Error("Not implemented.  You must provide a `success` function when creating a WebsocketRequest");
    },
    fail: function() {}
  });


  enyo.kind({ /** @lends XM.Dispatch */
    name: 'XM.Dispatch',
    kind: 'XM.WebsocketRequest',
    defaults: {
      method: 'POST',
      data: function() {
        return {
          nameSpace: this.get('nameSpace'),
          type: this.get('type'),
          dispatch: {
            functionName: this.get('functionName'),
            parameters: this.get('parameters')
          }
        };
      }
    },
    /**
     * @constructor
     *
     * @param {Object} attributes     an object containing key:value pairs that
     *                                will be set as the model's attributes
     * @param {String} attributes.nameSpace e.g. XM
     * @param {String} attributes.type      name of the object to operate on
     *                                      e.g. Account
     * @param {String} attributes.functionName name of the dispatched function
     *                                         to call
     * @param {Object} opts           an object that will be mixed into the
     *                                resulting model
     * @param {Function} opts.success will be called when the request finishes
     *                                successfully
     * @param {Function} [opts.fail]  will be called if the request fails
     */
    constructor: function(attributes, opts) {
      // Ensure we have everything we need
      _.each(['nameSpace', 'type', 'functionName'], function(attribute) {
        if(!attributes[attribute]) {
          throw new Error('Malformed dispatch request.  No `' + attribute + '` given.');
        }
      });

      // Defend against common mistakes
      if(attributes.success || attributes.fail) {
        throw new Error('`success` and `fail` functions cannot be given as attributes.');
      }

      this.inherited(arguments);
    }
  });

}());

(function() {
  "use strict";

  enyo.kind({
    name: 'XM.WebsocketSource',
    kind: 'enyo.Source',
    find: function(constructor, options) {
      // Might be a collection or a model or the name of the kind
      var model = constructor.model || constructor.name || constructor,
          parts = model.split('.');

      _.extend(options, {
        nameSpace: parts[0],
        type: parts[1]
      });

      options.query = this.generateQuery(options);

      this.makeRequest(options);
    },
    fetch: function(record, options) {
      // If the record has an id, we don't need to generate a query for it
      if(!record.get('id')) {
        options.query = this.generateQuery(record, options);
      }
      this.setupRequest(record, options);
      this.makeRequest(options);
    },
    commit: function(record, options) {
      console.log(arguments);
      options.method = (record.isNew ? 'POST' : 'PATCH');
      this.setupRequest(record, options);
      this.makeRequest(options);
    },
    delete: function(record, options) {
      options.method = 'DELETE';
      this.setupRequest(record, options);
      this.makeRequest(options);
    },
    /**
     * Generates a Query from a record and, optionally, some additional options
     * @see node-datasource/lib/query/xtget_query.js
     *
     * @param {Object} record record to generate a query for
     * @param {Object} record.attributes these will be converted into the query
     * @param {Object} [options] additional options to attach to the query
     * @param {Object} [options.orderBy] attributes to order by
     * @param {Number} [options.rowLimit] total number of records to return
     * @param {Number} [options.rowOffset] number of rows to skip
     * @param {Boolean} [count] Only return the number of rows, not their contents
     *
     * @return {Object} the query object, if one was creatable
     */
    generateQuery: function(record, options) {
      var query = {};

      if(!record.attributes && !options) { return; }

      if(options) {
        query = _.pick(options, 'orderBy', 'rowLimit', 'rowOffset', 'count', 'parameters');
      }

      if(record.attributes) {
        query.parameters = _.chain(query.parameters)
          .union(
            _.map(record.attributes, function(value, attribute) {
              return { attribute: attribute, operator: '=', value: value };
            })
          )
          .compact()
          .value();

        // If we don't have any parameters, delete it off the query object
        if(query.parameters.length < 1) {
          delete query.parameters;
        }
      }

      if(_.keys(query).length === 0) { return; }

      return query;
    },
    setupRequest: function(record, options) {
      var isCollection = record instanceof enyo.Collection,
          model = (isCollection) ? record.model.prototype : record,
          parts = model.kindName.split('.');

      _.extend(options, {
        nameSpace: parts[0],
        type: parts[1]
      });

      if(!isCollection && record.get('id')) {
        options.id = record.get('id');
      }

      if(options.method == 'POST') {
        options.data = _.omit(record.attributes, 'id');
      }

      if(options.method == 'PATCH') {
        options.data = jiff.diff(record.previous, record.attributes);
      }

      // options.query = this.generateQuery(record);
    },
    makeRequest: function(options) {
      var properties = _.pick(options, 'success', 'fail'),
          attributes = _.pick(options, 'method');
      options = _.omit(options, 'success', 'fail', 'method');
      attributes.data = options;

      new XM.WebsocketRequest(attributes, properties);
    }
  });

  enyo.store.addSources({ websocket: 'XM.WebsocketSource' });
}());
