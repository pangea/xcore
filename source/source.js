/*jshint*/
/*global io, enyo*/

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

      if(!this.socket) {
        throw "WebsocketRequests cannot be created without a websocket (`socket`)";
      }

      if(!data) {
        throw "WebsocketRequests must have `data` to send";
      }

      if(typeof data === 'function') {
        data = data();
      }

      payload.data = data;
      this.socket.emit(this.get('method'), payload);
    },
    success: function() {
      throw "Not implemented.  You must provide a `success` function when creating a WebsocketRequest";
    },
    fail: function() {}
  });

  enyo.kind({
    name: 'XM.WebsocketSource',
    kind: 'enyo.Source',
    socket: io('/clientsock'),
    constructor: function() {
      this.inherited(arguments);

      this.socket.on('response', function(msg) {
        var req = enyo.store.getRecord(msg.reqId);
        if(msg.error) {
          console.error(msg.error);
          req.fail(msg.error);
        } else {
          console.log(msg.data);
          req.success(msg.data);
        }
      });

      this.socket.on('update', function() {
        // not used right now.  Will be used for unsolicited model updates from
        // the server
      });
    },
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
      options.method = 'POST';
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
      var model = (record instanceof enyo.Collection) ? record.model : record.kindName,
          parts = model.split('.');

      _.extend(options, {
        nameSpace: parts[0],
        type: parts[1]
      });

      if(record.get('id')) {
        options.id = record.get('id');
      }

      // options.query = this.generateQuery(record);
    },
    makeRequest: function(options) {
      var properties = _.pick(options, 'success', 'fail'),
          attributes = _.pick(options, 'method');
      properties.socket = this.socket;
      options = _.omit(options, 'success', 'fail', 'method');
      attributes.data = options;
      console.log(attributes, properties);

      new XM.WebsocketRequest(attributes, properties);
    }
  });

  enyo.store.addSources({ websocket: 'XM.WebsocketSource' });
}());
