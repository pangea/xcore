var WufooHelpers = require('./wufoo-helpers');

exports.process = function(req , res) {
  var fieldsArray =  JSON.parse(req.body.FieldStructure).Fields,
      formId = JSON.parse(req.body.FormStructure).Url,
      keyValuePairs = {};

  for(var i = 0; i < fieldsArray.length; i++){
    var key,
        value;
    if(fieldsArray[i].SubFields){
      for(var x = 0; x < fieldsArray[i].SubFields.length; x++) {
        key = fieldsArray[i].SubFields[x].Label.replace(/\W/g, '') + fieldsArray[i].Title.replace(/\W/g, ''),
        value = req.body[fieldsArray[i].SubFields[x].ID];

        keyValuePairs[key] = value;
      }
    } else {
      key = fieldsArray[i].Title.replace(/\W/g, ''),
      value = req.body[fieldsArray[i].ID];

      keyValuePairs[key] = value;
    }
  }


  switch (formId) {
    case "test-form-zhzmv5v1km1881":
      WufooHelpers.test(keyValuePairs);
      break;
    default:
      console.log(keyValuePairs);
      break;
  }
  res.send("ok");
};
