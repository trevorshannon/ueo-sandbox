var Airtable = require('airtable');
var base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);

const AFFORDABLE_HOUSING_CHANGES_TABLE = "tblXy0hiHoda5UVSR";

// TODO: need form completion time stored.
exports.handler = async function(event) {
  console.log(event);
  let eventBody = JSON.parse(event.body);
  console.log(eventBody);
  let table = base(AFFORDABLE_HOUSING_CHANGES_TABLE);
  let formResponses = eventBody.payload.data;
  console.log(formResponses);
  // TODO: error handling. 
  table.create({
    "CAMPAIGN": "First Campaign",
    "FORM_RESPONSE_JSON": JSON.stringify(formResponses),
  }, function(err, record) {
    if (err) {
      console.error(err);
    }
  });
};
