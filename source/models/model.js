(function() {
  enyo.kind({
	  name: 'XM.Model',
	  kind: 'enyo.Model',
    store: XM.store,
    defaultSource: 'websocket',
    /**
     * Stores the name of the natural key for this model
     * The default value of `false` dictates that the model has no natural key
     * and the primaryKey should be used instead.
     */
    naturalKey: false,
    parse: function(data) {
      // This means our data is actually an update to the model.  These come down
      // as JSON Patches.  So, we apply the patch and return that insead
      // NOTE: This operation does not change any values in the attributes hash!
      if(data.patches) {
        return jiff.patch(data.patches, this.attributes);
      }

      return data;
    },
	  hasCreator: function() {
		  var creator = this.get('created_by');

		  if ((typeof creator !== 'undefined') && (creator !== '')) {
			  return true;
		  }

		  return false;
	  },
    didCommit: enyo.inherit(function(sup) {
      return function() {
        this.previous = enyo.clone(this.attributes);
        sup.apply(this, arguments);
      };
    }),
    setKey: function(key) {
      if(this.naturalKey) {
        this.set(this.naturalKey, key);
      } else if(this.primaryKey) {
        this.set(this.primaryKey, key);
      } else {
        throw new Error('Cannot set key.  Model has neither a primary or natural key property.');
      }
    },
    getKey: function() {
      if(this.naturalKey) {
        return this.get(this.naturalKey);
      } else if(this.primaryKey) {
        return this.get(this.primaryKey);
      } else {
        return null;
      }
    }
  });

  enyo.kind({
    name: 'XM.Collection',
    kind: 'enyo.Collection',
    store: XM.store,
    defaultSource: 'websocket',
    instanceAllRecords: true,
    /**
     * Overloads enyo's default fetch to allow for multiple collections to exist
     * simultaneously.  It does this by bypassing the usual fetch mechanics and
     * only grabbing models that exist locally to the application.
     *
     * Further, it prevents issues with models being created before a collection
     * has been fetched using a static property on the constructor.  If the
     * collection has never been fetched, it will automatically fetch from the
     * server, regardless of local models.
     *
     * @param {Object} opts options to use while fetching
     * @param {Object} [opts.force] if true, forces the default behavior of fetch
     * @param {Object} [opts.strategy='merge'] the merge strategy to use
     */
    fetch: enyo.inherit(function(sup) {
      return function(opts) {
        if(!opts) { opts = {}; }
        if(!opts.strategy) { opts.strategy = 'merge'; }

        var constructor = enyo.getPath(this.kindName);

        if(opts.force || !constructor.hasFetched) {
          delete opts.force; // don't pollute the regular call
          sup.call(this, opts);
          constructor.hasFetched = true;
          return;
        }

        var existingModels = this.store.findLocal(
              this.model,
              enyo.except(['success', 'fail', 'strategy'], opts)
            );
        if(existingModels.length) {
          // this is done async to maintain feature pairity with regular fetch
          enyo.asyncMethod(this, function() {
            this.didFetch(this, opts, existingModels);
          });
          // this.reset(existingModels);
        } else {
          sup.call(this, opts);
        }
      };
    })
  });
}());
