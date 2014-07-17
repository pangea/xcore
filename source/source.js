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
      console.log('setting up socket callbacks');
      this.socket.on('xcore message', function(msg) {
        if(msg.reqId) {
          var req = enyo.store.getRecord(msg.reqId);
          if(msg.error) {
            req.fail(msg.error);
          } else {
            req.success(msg.data);
          }
        } else {
          // probably a message or some other update.  We'll have to write some
          // code that figures out what kind of model it is and makes one of it.
        }
      });
    },
    find: function(record, options) {
      options.from = 'find';
      this.makeRequest(options);
    },
    fetch: function(record, options) {
      // var fullname = (record instanceof enyo.Collection) ? record.model : record.name,
      //     modelParts = fullname.split('.'),
      //     namespace = (modelParts.length > 1) ? fullname[0] : "SYS",
      //     model = (modelParts.length > 1) ? fullname[1] : fullname[0];
      options.from = 'fetch';
      this.makeRequest(options);
    },
    commit: function(record, options) {
      options.method = 'POST';
      options.from = 'commit';
      this.makeRequest(options);
    },
    delete: function(record, options) {
      options.method = 'DELETE';
      options.from = 'delete';
      this.makeRequest(options);
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
