exports.address = function (req, res){
  // Create the real data obj
  var addressObj = {
    addressOne: req.StreetAddressAddress,
    addressTwo: req.AddressLine2Address,
    city: req.CityAddress,
    state: req.StateProvinceRegionAddress,
    postalCode: req.PostalZipCodeAddress,
    country: req.CountryAddress,
    number: req.StreetAddressAddress
  },
      postData = {
        nameSpace: 'XM',
        type: 'Address',
        data: addressObj
      };

  X.DB.Rest("POST", postData, "bzettler", function(error,resp){
    if(error){
      console.log(error);
    } else {
      console.log(resp);
    }
  });
};
