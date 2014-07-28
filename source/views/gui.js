enyo.kind({
  name: "XV.GuiInterface",
  kind: "FittableRows",
  handlers: {
    onStatusAlert: "statusAlertAction"
  },
  registerExtension: function() {
    throw new Error('Not Implemented');
  },
  statusAlertAction: function() {
    throw new Error('Not Implemented');
  }
});
