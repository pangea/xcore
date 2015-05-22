enyo.kind({
  name: "XV.GuiInterface",
  kind: "FittableRows",
  handlers: {
    onStatusAlert: "statusAlertAction"
  },
  registerExtension: function() {
    throw new NotImplementedError("GUI kinds must implement registerExtension");
  },
  statusAlertAction: function() {
    throw new NotImplementedError("GUI kinds must implement statusAlertAction");
  }
});
