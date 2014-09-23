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
    /**
     * Contains mappings between property names and related models.
     * This allows us to take nested models/collections and automatically
     * convert them into the models/collections the data represents.
     *
     * @see Model#parse
     */
    relations: {},
    parse: function(data) {
      // This means our data is actually an update to the model.  These come down
      // as JSON Patches.  So, we apply the patch and return that insead
      if(data.patches) {
        data = jiff.patch(data.patches, this.dirty ? this.raw() : this.previous);
      }

      // Process any relations listed on the model
      var relKeys = enyo.keys(this.relations),
          i, key, rel, field;

      for(i = 0; (key = relKeys[i]); i++) {
        field = data[key];
        if(field) {
          // Thankfully, this works for both models AND collections
          rel = enyo.getPath(this.relations[key]);
          data[key] = new rel(field);
        }
      }

      return data;
    },
    set: enyo.inherit(function(sup) {
      return function(prop, value, force) {
        sup.apply(this, arguments);

        var prev = this.previous[prop];

        if( prev instanceof enyo.Model ||
            prev instanceof enyo.Collection) {
          this.previous[prop] = prev.raw();
        }
      };
    }),
    raw: function() {
      var keys = this.includeKeys,
          attrs = this.attributes,
          ret;

      // ensure includeKeys is used, if provided
      if(keys && keys.length) {
        ret = enyo.only(keys, attrs);
      } else {
        ret = enyo.clone(attrs);
        keys = enyo.keys(ret); // otherwise, we need to make sure it has all the keys
      }

      // Iterate over the keys and transform any that need it
      for(var i = 0, key, prop; (key = keys[i]); i++) {
        prop = ret[key];

        if(enyo.isFunction(prop)) {
          ret[key] = prop.call(this);
        } else if(prop instanceof enyo.Collection || prop instanceof enyo.Model) {
          ret[key] = prop.raw();
        }
      }

      return ret;
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
        // Ensure previous is set properly after a commit
        this.previous = this.raw();
        sup.apply(this, arguments);
      };
    }),
    /**
     * setKey allows us to easily set a model's keys without having to deal with
     * primary/natural key foolery.
     *
     * @param key the value to set as this models primary/natural key
     *
     * @throws Error When the model has no primary or natural key property
     */
    setKey: function(key) {
      if(this.naturalKey) {
        this.set(this.naturalKey, key);
      } else if(this.primaryKey) {
        this.set(this.primaryKey, key);
      } else {
        throw new Error('Cannot set key.  Model has neither a primary or natural key property.');
      }
    },
    /**
     * getKey allows us to easily get a model's key without having to deal with
     * primary/natural key foolery.
     *
     * @returns {String|Null} the model's primary or natural key or null, if no
     *                        key property is found.
     */
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
