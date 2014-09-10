(function() {
  "use strict";
  
  enyo.kind({
    name: 'XM.Store',
    kind: 'enyo.Store',
    statics: {
      delegates: {}
    },
    published: {
      duplicateStrategy: null
    },
    constructor: enyo.inherit(function(sup) {
      return function(props) {
        var duplicateStrategy = (
              (props && props.duplicateStrategy) || 
              this.duplicateStrategy || 
              "default"
            );

        this.delegate = XM.Store.delegates[duplicateStrategy];

        sup.apply(this, arguments);
      };
    }),
    addRecord: function(rec) {
      var records = this.records,
          key = rec.naturalKey || rec.primaryKey,
          kindName = rec.kindName,
          kinds = records.pk[kindName] || (records.pk[kindName] = {}),
          id = rec.get(key),
          euid = rec.euid;

      if(rec.store && rec.store !== this) {
        rec.store.removeRecord(rec);
      }

      if(records.euid[euid] && records.euid[euid] !== rec) {
        throw new Error("Duplicate and unmatching euid records found");
      } else {
        records.euid[euid] = rec;
      }

      if(id !== undefined && id !== null) {
        if(kinds[id] && kinds[id] !== rec) {
          this.delegate.handleDuplicate(this, rec);
        } else {
          kinds[id] = rec;
        }
      }

      records.kn[kindName] || (records.kn[kindName] = {});
      records.kn[kindName][euid] = rec;
      if(!rec.store) {
        rec.store = this;
      }
    }
  });

  XM.Store.delegates.default = {
    handleDuplicate: function(store, record) {
      var message = "Duplicate record added to store for kind '%1' with key '%2'.";
      throw new Error(enyo.format(message, record.kindName, record.getKey()));
    }
  };

  XM.Store.delegates.ignore = {
    handleDuplicate: function() {
      // All good.  We don't actually need to do anything here.
    }
  };

  XM.Store.delegates.merge = {
    handleDuplicate: function(store, record) {
      if(!record.mergeKeys) {
        throw new Error('No mergeKeys found for kind ' + record.kindName + '.');
      }

      var col = new enyo.Collection(),
          kinds = store.records.pk[record.kindName],
          id = record.getKey();

      col.add(kinds[id]);
      col.merge(record);

      if(col.length > 1) {
        throw new Error('Unable to merge new record with existing record');
      }

      kinds[id] = col.at(0);
    }
  };

  XM.store = new XM.Store({ duplicateStrategy: "merge" });
}());
