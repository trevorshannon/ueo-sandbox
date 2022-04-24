const Airtable = require('airtable');
const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);
const pageTemplate = require("./includes/base.js");
const searchForm = require("./includes/search-ui.js");


// Look up data for this query from the Airtable API
const fetchData = async(query) => {
  const table = base("tblNLrf8RTiZdY5KN"); // Units table
  return table.select({
      view: "API all units",
      filterByFormula: query
    })
    .all()
    .then(records => {
      housingList = [];
      records.forEach(function(record) {
        housingList.push({
          id: record.get("ID (from Housing)"),
          apt_name: record.get("Address (from Housing)"),
        })
      });

      // return a set of de-duped results
      return Array.from(
        new Set(housingList.map((obj) => JSON.stringify(obj)))
      ).map((string) => JSON.parse(string));

    });
};


// Construct some HTML to show the results
const renderResultItems = (data) => {

  const resultItem = (item) => {
    return `<li><a href="/housing/affordable-housing/${item.id[0]}">${ item.apt_name[0] }</a></li>`;
  };

  let resultsHTML = [];
  data.forEach(element => {
    resultsHTML.push(resultItem(element))
  });
  return `<ul>${resultsHTML.join("")}</ul>`;
}



exports.handler = async function(event) {

  const { city, unitType } = event.queryStringParameters;

  // Construct our Airtable filter query.
  // We'll concatenate an AND qunery with multiple ORs for each optio
  let parameters = [];
  if (unitType) {
    let rooms = unitType.split(",");
    let roomsQuery = rooms.map((x) => `{TYPE} = '${x}'`)
    parameters.push(`OR(${roomsQuery.join(",")})`);
  }
  if (city) {
    let cities = city.split(",");
    let cityQuery = cities.map((x) => `{City (from Housing)} = '${x}'`)
    parameters.push(`OR(${cityQuery.join(",")})`);
  }


  let query = `AND(${parameters.join(",")})`;
  console.log(query);

  // query the DB
  let data = await fetchData(query);
  const html = `<h1>Affordable housing database</h1>${searchForm()} ${renderResultItems(data)}`;

  return {
    statusCode: 200,
    body: pageTemplate(html)
  };

};
