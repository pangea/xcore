(function() {
  // TODO: Better documentation is probably in order.

  enyo.kind({
    name: 'XV.Application',
    kind: 'enyo.Application',
    published: {
      /**
       * Holds the registered extensions organized by name for easier retrieval
       */
      _registeredExtensions: {},
      /**
       * Holds fields required for extensions to be valid.  By default, we only
       * require a name, but some GUIs might require more.
       */
      _requiredExtensionFields: [ 'name' ],
      _currentUser: currentUser,
      /**
       * TODO: Documentation!  :D
       */
      settings: []
    },
    renderOnStart: false,
    /**
     * addSetting pushes a new setting into the array of settings.
     * Modules implementing their own custom settings paradigm can override this
     * method to add their own logic.
     *
     * @param setting the setting to push onto the array of settings
     */
    addSetting: function(setting) {
      this.settings.push(setting);
    },
    /**
     * Registers the GUI to be used by the application
     *
     * @param {String|Function} component The name or constructor for the kind
     *                                    which should be used as the GUI for
     *                                    the application.
     */
    registerGui: function(component) {
      // TODO: Is there ever an instance we might want more than one GUI?
      if(this.$.gui) { throw "Cannot register more than one GUI"; }

      var gui = this.createComponent({
        kind: component,
        name: 'gui'
      });

      this.view = gui;

      // Setup registered extensions with the GUI
      _.each(this._registeredExtensions, function(extension) {
        gui.registerExtension(extension);
      });

      this.render();
    },
    /**
     * Adds a field to the required fields for extensions.  This triggers an is
     * valid check on all registered extensions and can slow down your app as all
     * the extensions are checked.
     * Under normal circumstances, your GUI will be loaded before any extensions.
     * Hence, this check should happen (nearly) instantly.
     *
     * This function can be invoked one of three ways:
     *  * addRequiredExtensionField('fieldname');
     *  * addRequiredExtensionField(['array', 'of', 'fields']);
     *  * addRequiredExtensionField('list', 'of', 'fields');
     *
     * **IMPORTANT**: This function should be called in the `create` method of
     * your GUI.  Otherwise, the app may attempt to register invalid extensions
     * with the newly registered GUI.
     *
     * @param {String|Array<String>} field the field or array of fields to add
     *                                     to the list of required fields
     */
    addRequiredExtensionField: function(field) {
      // Convert multiple argument invocation into array invocation
      if(arguments.length > 1) { field = Array.prototype.slice.call(arguments); }

      // Handle array invocation
      if(_.isArray(field)) {

        // Prevent the recursive calls from triggering multiple reverifications
        this.addingMultipleFields = true;

        _.each(field, this.addRequiredExtensionField);

        this.reverifyExtensions();

        // No sense in keeping this field around.
        delete this.addingMultipleFields;
        return;
      }

      // Handle single field invocation
      if(!_.contains(this.requiredExtensionFields, field)) {
        this.requiredExtensionFields.push(field);

        if(!this.addingMultipleFields) {
          this.reverifyExtensions();
        }
      }
    },
    /**
     * Gets all the currently registered extensions.  Extensions are stored in an
     * object under their name.  E.g. `{ 'someExtension' : {} }`
     *
     * @return {Object} All the registered extensions organized by name
     */
    getExtensions: function() {
      return this._registeredExtensions;
    },
    /**
     * Gets a specific extension by the name it registered with.
     *
     * @param {String} name The name the extension registered with
     *
     * @return {Object|Undefined} The extension registered under the given name
     */
    getExtension: function(name) {
      return this._registeredExtensions[name];
    },
    /**
     * Registers a new extension with the application.
     * The parameters given here are the only ones required by xCore.  Different
     * GUIs may require additional parameters.
     *
     * @param {Object} extension      The extension to be registered
     * @param {String} extension.name The name of the extension being registered.
     *                             Used to look up the extension
     */
    registerExtension: function(extension) {
      if(this.extensionIsValid(extension)) {
        this._registeredExtensions[extension.name] = extension;
        // Has a GUI been registered?
        if(this.$.gui) {
          this.$.gui.registerExtension(extension);
        }
      }
    },
    /**
     * Runs extensionIsValid for all registered extensions.  This method is generally
     * only called by addRequiredExtensionFields to ensure that all loaded extensions
     * are valid for the given GUI.
     */
    reverifyExtensions: function() {
      _.each(this._registeredExtensions, function(extension) {
        this.extensionIsValid(extension);
      }, this);
    },
    /**
     * Determines if a extension has all the fields required by the App.
     * GUIs can add additional required fields.
     *
     * @param {Object} extension the extension to validate
     *
     * @throws Error when the extension does not have all the required fields
     *
     * @returns {Boolean} true
     */
    extensionIsValid: function(extension) {
      _.each(this.requiredExtensionFields, function(field) {
        if(!extension[field]) {
          throw "extension " + extension.name + " is missing required field " + field;
        }
      });

      return true;
    },
    currentUser: function(user) {
      if(user) {
        this._currentUser = user;
      }

      return this._currentUser;
    },
    getRecordForKind: function(kind, id) {
      if(!enyo.isFunction(kind)) {
        kind = enyo.isString(kind) && enyo.getPath(kind);
      }

      if(!kind) {
        throw new Error('Invalid kind');
      }

      var tmp = new kind(),
          pk = tmp.primaryKey,
          opts = {},
          store = tmp.store;

      opts[pk] = id;

      tmp.destroyLocal();  // clean up after ourselves

      return store.findLocal(kind, opts);
    },
    findModelByKey: function(kind, key, opts) {
      if(!enyo.isFunction(kind)) {
        kind = enyo.isString(kind) && enyo.getPath(kind);
      }

      if(!kind) {
        throw new Error('Invalid kind');
      }

      var tmp = new kind(),
          searchKey = tmp.naturalKey || tmp.primaryKey,
          searchOpts = {},
          model;

      if(!searchKey) {
        throw new Error(tmp.kindName + ' has neither a natural or primary key');
      }

      searchOpts[searchKey] = key;

      model = tmp.store.findLocal(tmp.kindName, searchOpts);

      if(!model) {
        tmp.setKey(key);
        tmp.fetch(opts);
      } else {
        tmp.destroyLocal();
        enyo.asyncMethod(this, function() {
          opts.success && opts.success(model);
        });
      }
    },
    /**
     * resize is a convenience function for forcing a resize of everything on
     * the screen.  There are a couple of cases where triggering a resize on a
     * specific object doesn't work or finding the correct object to call it on
     * is non-trivial.  This allows you to quickly force a full screen refresh
     * of all Enyo objects that draw themselves based on the size of the screen.
     */
    resize: function() {
      window.dispatchEvent(new Event('resize'));
    }
  });

  xCore.name = 'xCore';
  new XV.Application(xCore);
}());
