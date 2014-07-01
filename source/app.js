(function() {
  // TODO: Better documentation is probably in order.

  enyo.kind({
    name: 'XV.Application',
    kind: 'enyo.Application',
    published: {
      /**
       * Holds the registered modules organized by name for easier retrieval
       */
      _registeredModules: {},
      /**
       * Holds fields required for modules to be valid.  By default, we only
       * require a name, but some GUIs might require more.
       */
      _requiredModuleFields: [ 'name' ]
    },
    renderOnStart: false,
    create: function() {
      this.inherited(arguments);
      window.xCore = this;
    },

    start: function() {
      this.inherited(arguments);
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

      // Setup registered modules with the GUI
      _.each(this._registeredModules, function(module) {
        gui.registerModule(module);
      });

      this.render();
    },
    /**
     * Adds a field to the required fields for modules.  This triggers an is
     * valid check on all registered modules and can slow down your app as all
     * the modules are checked.
     * Under normal circumstances, your GUI will be loaded before any modules.
     * Hence, this check should happen (nearly) instantly.
     *
     * This function can be invoked one of three ways:
     *  * addRequiredModuleField('fieldname');
     *  * addRequiredModuleField(['array', 'of', 'fields']);
     *  * addRequiredModuleField('list', 'of', 'fields');
     *
     * **IMPORTANT**: This function should be called in the `create` method of
     * your GUI.  Otherwise, the app may attempt to register invalid modules
     * with the newly registered GUI.
     *
     * @param {String|Array<String>} field the field or array of fields to add
     *                                     to the list of required fields
     */
    addRequiredModuleField: function(field) {
      // Convert multiple argument invocation into array invocation
      if(arguments.length > 1) { field = Array.prototype.slice.call(arguments); }

      // Handle array invocation
      if(_.isArray(field)) {

        // Prevent the recursive calls from triggering multiple reverifications
        this.addingMultipleFields = true;

        _.each(field, this.addRequiredModuleField);

        this.reverifyModules();

        // No sense in keeping this field around.
        delete this.addingMultipleFields;
        return;
      }

      // Handle single field invocation
      if(!_.contains(this.requiredModuleFields, field)) {
        this.requiredModuleFields.push(field);

        if(!this.addingMultipleFields) {
          this.reverifyModules();
        }
      }
    },
    /**
     * Gets all the currently registered modules.  Modules are stored in an
     * object under their name.  E.g. `{ 'someModule' : {} }`
     *
     * @return {Object} All the registered modules organized by name
     */
    getModules: function() {
      return this._registeredModules;
    },
    /**
     * Gets a specific module by the name it registered with.
     *
     * @param {String} name The name the module registered with
     *
     * @return {Object|Undefined} The module registered under the given name
     */
    getModule: function(name) {
      return this._registeredModules[name];
    },
    /**
     * Registers a new module with the application.
     * The parameters given here are the only ones required by xCore.  Different
     * GUIs may require additional parameters.
     *
     * @param {Object} module      The module to be registered
     * @param {String} module.name The name of the module being registered.
     *                             Used to look up the module
     */
    registerModule: function(module) {
      if(this.moduleIsValid(module)) {
        this._registeredModules[module.name] = module;
        // Has a GUI been registered?
        if(this.$.gui) {
          this.$.gui.registerModule(module);
        }
      }
    },
    /**
     * Runs moduleIsValid for all registered modules.  This method is generally
     * only called by addRequiredModuleFields to ensure that all loaded modules
     * are valid for the given GUI.
     */
    reverifyModules: function() {
      _.each(this._registeredModules, function(module) {
        this.moduleIsValid(module);
      }, this);
    },
    /**
     * Determines if a module has all the fields required by the App.
     * GUIs can add additional required fields.
     *
     * @param {Object} module the module to validate
     *
     * @throws Error when the module does not have all the required fields
     *
     * @returns {Boolean} true
     */
    moduleIsValid: function(module) {
      _.each(this.requiredModuleFields, function(field) {
        if(!module[field]) {
          throw "module " + module.name + " is missing required field " + field;
        }
      });

      return true;
    }
  });

  enyo.ready(function() {
    new XV.Application({name: 'xCore'});
  });
}());
