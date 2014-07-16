/*jshint*/
/*global io, enyo*/

(function() {
  enyo.kind({
    name: 'XM.WebsocketRequest',
    kind: 'enyo.Model',
    defaults: {
      socket: null,
      method: 'GET',
      data: null
    },
    constructor: function() {
      this.inherited(arguments);

      var payload = {
            id: this.euid
          },
          socket = this.get('socket'),
          data = this.get('data');

      if(!socket) {
        throw "WebsocketRequests cannot be created without a websocket (`socket`)";
      }

      if(!data) {
        throw "WebsocketRequests must have `data` to send";
      }

      if(typeof data === 'function') {
        data = data();
      }

      payload.data = data;
      socket.emit(this.get('method'), payload);
    },
    success: function() {
      throw "Not implemented.  You must provide a `success` function when creating a WebsocketRequest";
    },
    error: function() {}
  });

  enyo.kind({
    name: 'XM.WebsocketRequestCollection',
    kind: 'enyo.Collection',
    model: 'XM.WebsocketRequest'
  });
}());

(function() {
  "use strict";

  enyo.kind({
    name: 'XM.WebsocketSource',
    kind: 'enyo.Source',
    socket: io('/clientsock'),
    create: function() {
      this.inherited(arguments);
      this.socket.on('message', function() {
        console.log(arguments);
      });
    },
    find: function(record, options) {
      options.data = 'find';
      this.makeRequest(options);

      options.success({});
    },
    fetch: function(record, options) {
      // var fullname = (record instanceof enyo.Collection) ? record.model : record.name,
      //     modelParts = fullname.split('.'),
      //     namespace = (modelParts.length > 1) ? fullname[0] : "SYS",
      //     model = (modelParts.length > 1) ? fullname[1] : fullname[0];
      options.data = 'fetch';
      this.makeRequest(options);

      options.success({});
    },
    commit: function(record, options) {
      options.method = 'POST';
      options.data = 'commit';
      this.makeRequest(options);

      options.success({});
    },
    delete: function(record, options) {
      options.method = 'DELETE';
      options.data = 'delete';
      this.makeRequest(options);

      options.success({});
    },
    makeRequest: function(options) {
      options.socket = this.socket;
      xCore.websocketRequests.add(
        new XM.WebsocketRequest(options)
      );
    }
  });

  enyo.store.addSources({ websocket: 'XM.WebsocketSource' });
}());
