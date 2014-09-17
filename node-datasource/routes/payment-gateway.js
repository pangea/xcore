var XMerchant = require('../lib/xMerchant'),
    UsaepayGateway = require('../lib/xMerchant/client/usaepay_gateway'),
    xmerchant = new XMerchant(),
    usaepay = new UsaepayGateway();

usaepay.UMkey = 'f2U9x3xqNqn7VnCE3X3H1BebG4cp4M22';
usaepay.pin = '1234';

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
          email: req.body.email
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
      res.send(result.paymentId);
    });
  } else if (req.body.recurrenceAmount == "1+" && req.body.recurrenceStart == todaysDate) {
    data.recurrence = {
      schedule: "monthly",
      start: "next",
      number: "0" // Run monthly untill canceled
    };

    xmerchant.pay(data,function(result){
      res.send(result.paymentId);
    });
  } else if (req.body.recurrenceAmount == "1+" && req.body.recurrenceStart != todaysDate) {
    data.recurrence = {
      schedule: "monthly",
      start: req.body.recurrenceStart,
      number: "0" // Run monthly untill canceled
    };

    xmerchant.addCustomer(data,function(result){
      res.send(result.paymentId);
    });
  } else {
    xmerchant.pay(data,function(result){
      res.send(result.paymentId);
    });
  }
  
};
