enyo.kind({
  name: "XV.GuiInterface",
  kind: "FittableRows",
  handlers: {
    onStatusAlert: "statusAlertAction"
  },
  registerExtension: function() {
    throw new NotImplementedError();
  },
  statusAlertAction: function() {
    throw new NotImplementedError();
  }
});
