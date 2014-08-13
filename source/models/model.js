(function() {
  enyo.kind({
	  name: 'XM.Model',
	  kind: 'enyo.Model',
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
        this.previous = this.attributes;
        sup.apply(this, arguments);
      };
    })
  });

  enyo.kind({
    name: 'XM.Collection',
    kind: 'enyo.Collection',
    defaultSource: 'websocket',
    /**
     * Overloads enyo's default fetch to allow for multiple collections to exist
     * simultaneously.  It does this by bypassing the usual fetch mechanics and
     * only grabbing models that exist locally to the application.
     *
     * @param {Object} opts       options to use while fetching
     * @param {Object} opts.force if true, forces the default behavior of fetch
     */
    fetch: function(opts) {
      if(!opts) { opts = {}; }
      if(opts.force) {
        this.inherited(arguments);
        return;
      }

      var existingModels = this.store.findLocal(this.model, opts);
      if(existingModels.length) {
        this.reset(existingModels);
      } else {
        this.inherited(arguments);
      }
    }
  });
}());
