var XMerchant = require('../lib/xMerchant'),
    UsaepayGateway = require('../lib/xMerchant/client/usaepay_gateway'),
    xmerchant = new XMerchant(),
    usaepay = new UsaepayGateway();

//SANDBOX
// usaepay.UMkey = 'f2U9x3xqNqn7VnCE3X3H1BebG4cp4M22';
// usaepay.pin = '1234';

//PROD
usaepay.UMkey = 'm279q9KUFn5r5hP77NeXXhx7k67X3X4y';
usaepay.pin = '237456';

xmerchant.setGateway(usaepay);

exports.pay = function(req, res){
  var todaysDate = new Date().toISOString().split("T")[0],
      /**
       * Default data object
       */
      data = {
        type: req.body.type,
        custId: req.body.custId,
        amount: req.body.amount,
        billing: {
          fullName: req.body.firstName + " " + req.body.lastName,
          zip: req.body.zip,
          street: req.body.street,
          street2: req.body.street2,
          email: req.body.email,
          city: req.body.city,
          state: req.body.state
        }
      };

  /**
   * Setting up card/ach object
   */  
  if(req.body.type == "credit") {
    data.card = {
      number: req.body.cardNumber,
      month: req.body.cardExpMonth,
      year: req.body.cardExpYear, 
      verificationValue: req.body.cardCID
    };
  } else if(req.body.type == "ach") {
    data.ach = {
      routing: req.body.routingNumber,
      account: req.body.accountNumber,
      accountType: req.body.accountType
    };    
  } else {
    throw "Type" + req.boyd.type + "is not supported by this gateway";
  }
  
  if(req.body.recurrenceAmount == "1" && req.body.recurrenceStart != todaysDate){
    data.recurrence = {
      schedule: "daily",
      start: req.body.recurrenceStart,
      number: "1"
    };

    xmerchant.addCustomer(data,function(result){
      res.send(result);
    });
  } else if (req.body.recurrenceAmount == "1+" && req.body.recurrenceStart == todaysDate) {
    data.recurrence = {
      schedule: "monthly",
      start: "next",
      number: "0" // Run monthly untill canceled
    };


    xmerchant.pay(data,function(result){
      console.log("###############");
      console.log(result);
      console.log("###############");
      var updateCust = {
        CustNum: result.planId,
        SendReceipt: true
      };

      xmerchant.quickUpdateCustomer(updateCust);
      res.send(result);
    });
  } else if (req.body.recurrenceAmount == "1+" && req.body.recurrenceStart != todaysDate) {
    data.recurrence = {
      schedule: "monthly",
      start: req.body.recurrenceStart,
      number: "0" // Run monthly untill canceled
    };

    xmerchant.addCustomer(data,function(result){
      res.send(result);
    });
  } else {
    xmerchant.pay(data,function(result){
      res.send(result);
    });
  }
  
};
