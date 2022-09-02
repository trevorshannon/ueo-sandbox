const markdown = require("marked");
const sass = require("sass");
const { EleventyServerlessBundlerPlugin } = require("@11ty/eleventy");
// This requirement is somehow not propagated from affordable-housing.11tydata.js
// so include it here to be sure it makes it into the serverless bundle.
const EleventyFetch = require("@11ty/eleventy-fetch");
var Airtable = require('airtable');
var base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(
  process.env.AIRTABLE_BASE_ID);

const UNITS_TABLE = "tblRtXBod9CC0mivK";

// This is a global sort ranking for all filter options.  
// It assumes no name collisions.
// Highest rank = 1.
// Force an item to be ranked last every time with rank = -1.
const SORT_RANKING = new Map([
  // Unit Type
  ["SRO", 1],
  ["Studio", 2],
  ["Others", -1],
  // Availability
  ["Waitlist Open", 1],
  ["Waitlist Closed", 2],
  ["Call for Status", 3],
  // Populations Served
  ["General Population", 1],
  ["Seniors", 2],
  ["Youth", 3],
  ["Developmentally Disabled", 4],
  ["Physically Disabled", 5],
]);


module.exports = function(eleventyConfig) {

  // Pass through static assets and client-side js files.
  eleventyConfig.addPassthroughCopy({ "src/assets": "/" });
  eleventyConfig.addPassthroughCopy({ "src/site/_includes/js": "/js" });

  // Eleventy Serverless plugin
  eleventyConfig.addPlugin(EleventyServerlessBundlerPlugin, {
    name: "serverless",
    functionsDir: "./netlify/functions/",
    copy: [
      // Files/directories that start with a dot
      // are not bundled by default.
      { from: ".cache", to: "cache" }
    ]
  });

  // Markdown filter
  eleventyConfig.addFilter("markdownify", (str) => {
    str = str.replaceAll("http:///", "/");
    return markdown.marked(str)
  });

  // Get all of the unique values of a property
  eleventyConfig.addFilter("index", function(collection, property) {
    let values = [];
    for (const item in collection) {
      if (collection[item][property]) {
        values = values.concat(collection[item][property]);
      }
    }
    return [...new Set(values)];
  });

  // Filter a data set by a value present in an array property
  eleventyConfig.addFilter("whereIncluded", function(collection, key, value) {
    let filtered = [];
    for (const item in collection) {
      if (collection[item][key] && collection[item][key].includes(value)) {
        filtered.push(collection[item]);
      }
    }
    return filtered;
  });
  // Filter a data set by a value present in an array property
  eleventyConfig.addFilter("whereEmpty", function(collection, key) {
    let filtered = [];
    for (const item in collection) {
      if (!collection[item][key]) {
        filtered.push(collection[item]);
      }
    }
    return filtered;
  });

  // Generates a URL query string from Eleventy serverless query parameters.
  eleventyConfig.addFilter("queryString", function(queryParams) {
    const searchParams = new URLSearchParams(queryParams);
    return searchParams.toString();
  });

  // Formats a value as USD with no decimals.
  eleventyConfig.addFilter("money", function(value) {
    return formatCurrency(value);
  });

  eleventyConfig.addFilter("getValidatedLocCoords", function(address) {
    if (address.verifiedLocCoords && 
        address.locCoords) {
      const coords = address.locCoords.split(",");
      if (coords.length == 2) {
        const lat = Number.parseFloat(coords[0]);
        const lng = Number.parseFloat(coords[1]);
        // Basic bounds checking. Note this also kicks out coordinates that
        // can't be parsed, since NaN will always fail the below check.
        if (lat > 35.952462 && lat < 38.216103 &&
          lng > -123.069952 && lng < -120.806286) {
          return [lat, lng];
        }
      }
    }
    return;
  });

  // Sorts items according to the ranking defined in SORT_RANKING.
  eleventyConfig.addFilter("rankSort", function(values, property="") {
    let sorted = values.sort(function(a, b) {
      let valA = property ? a[property] : a;
      let valB = property ? b[property] : b;
      let rankA = SORT_RANKING.get(valA);
      let rankB = SORT_RANKING.get(valB);
      // Special handling for the -1 rank, which is always sorted last.
      if (rankB < 0) {
        return -1;
      } else if (rankA < 0) {
        return 1;
      // Sort by rank if both items have one.
      } else if (rankA && rankB) {
        return rankA - rankB;
      // Put unranked items after the ranked ones.
      } else if (rankA && !rankB) {
        return -1;
      } else if (!rankA && rankB) {
        return 1;
      // Sort unranked items alphabetically.
      } else if (valA < valB) {
        return -1;
      } else if (valA > valB) {
        return 1;
      }
      return 0;
    });
    return sorted;
  });

  eleventyConfig.addFilter("numFiltersApplied", function(query){
    // TODO: Don't hardcode this list of filters here.
    const allowedFilters = [
      "city", 
      "availability", 
      "unitType", 
      "propertyName",
      "rentMax", 
      "income", 
      "populationsServed", 
      "wheelchairAccessibleOnly",
      "includeReferrals",
    ];
    let count = 0;
    for (const key in query) {
      if (allowedFilters.includes(key) && query[key]) {
        count++;
      }
    }
    return count;
  });

  // Add filter checkbox state from the query parameters to 'filterValues'. 
  eleventyConfig.addFilter("updateFilterState", function(filterValues, query) {
    // The AssetCache holding filterValues stores a buffered version of the
    // cached filterValues and does not read it in from the filesystem on each
    // page render. We need to be sure to not modify the original object, lest
    // those edits persist in the cached object.
    let filterValuesCopy = JSON.parse(JSON.stringify(filterValues));
    // If there is no query (such as on the affordable housing landing page)
    // there is no state to add to the filterValues.
    if (!query) { return filterValuesCopy; }

    // Updates the state of the FilterSection with the name 'filterName'
    // according to 'queryValue'
    function updateFilterSection(queryValue, filterName) {
      if (!queryValue) { return; }
      let selectedOptions = queryValue.split(", ");
      let filterIdx = filterValuesCopy.findIndex(f => f.name == filterName);
      if (filterIdx < 0) { return; }
      for (const selectedOption of selectedOptions) {
        let idx = filterValuesCopy[filterIdx].options.findIndex(
          v => v.name.split(", ").includes(selectedOption));
        if (idx >= 0) {
          filterValuesCopy[filterIdx].options[idx].selected = true;
        }
      }
    }
    for (const section in query){
      updateFilterSection(query[section], section);
    }

    return filterValuesCopy;
  });


  // Changes the URL query parameters to get rid of waitlist closed locations.
  //
  // If nothing is set for the availability parameter or if "Waitlist Closed" is
  // the only value set, all availabilities will be added to the URL query 
  // parameters *except* "Waitlist Closed". 
  // If there is something set for the availability parameter, "Waitlist Closed"
  // will simply be removed from the existing list of values.
  // 
  // This funtion is intended to be used to generate a URL query string that 
  // forces properties with a closed waitlist to be filtered out.  "query" is an
  // eleventy.serverless.query object and "allAvailabilities" is a list of
  // all possible values for the availability parameter, generally fetched
  // ahead of time from Airtable.  Returns a URL query string.
  eleventyConfig.addFilter("removeWaitlistClosed", function(query, 
    allAvailabilities) {
    const availKey = "availability";
    const closedValue = "Waitlist Closed";
    let queryParams = new URLSearchParams(query);
    // Copy existing availability values that were set by the user.
    let availabilityValues = queryParams.get(availKey);
    if (!availabilityValues || availabilityValues === closedValue) {
      // The user had no availabilities set or only asked for waitlist closed, 
      // so initialize to the full list.
      availabilityValues = allAvailabilities.join(", ");
    }
    // Remove the Waitlist Closed item from the availability values.
    availabilityValues = (availabilityValues.split(", ")
      .filter(x => x !== closedValue).join(", "));
    queryParams.set(availKey, availabilityValues);
    return queryParams.toString();
  });

  // Converts "camelCaseString" to "Camel Case String".
  // https://stackoverflow.com/questions/4149276/how-to-convert-camelcase-to-camel-case
  const camelCaseToSpaces = function(str) {
    // Insert space before each capital letter.
    let spaced = str.replace(/([A-Z])/g, " $1");
    // The first word is all lowercase, so capitalize it.
    return `${spaced[0].toUpperCase()}${spaced.slice(1)}`
  }

  // Formats a value as USD with no decimals.
  const formatCurrency = function(value) {
    return Number(value).toLocaleString("en-US",
    {
      style: "currency", 
      maximumFractionDigits: 0, 
      minimumFractionDigits: 0, 
      currency: "USD"
    });
  }

  // Generates a label tag for the given 'fieldName'. 
  // 
  // The parameter 'fields' is
  // a list of Airtable fields returned by fetchHousingSchema() in
  // affordable-housing-changes.11tydata.js. The user-visible labels text is
  // given by 'labelText'.  This function automatically generates a field id
  // that will match the id generated by formField() for the same 'fieldName'.
  // An optional 'index' string will be appended to the generated id like 
  // "id:index".  If the field specified by 'fieldName' includes a description,
  // it will be rendered next to the label text as a hover tooltip icon.
  const fieldLabel = function(labelText, fields, fieldName, index="") {
    let forAttr = `${fields[fieldName].id}${index !== "" ? ":" + index : ""}`;
    let tag = `<label for="${forAttr}">${labelText}</label>`;
    let tooltip = "";
    if (fields[fieldName].description) {
      let descStr = fields[fieldName].description.replace(/\n/g, "<br/>");
      tooltip = `<span class="tooltip_entry">
<span class="icon_query"></span>
<span class="tooltip_content">${descStr}</span>
</span>`;
    }
   return `${tag} ${tooltip}`;
  }

  // Generates an HTML form input for the field specified by 'fieldName'.
  // 
  // The parameter 'fields' is a list of Airtable fields returned by
  // fetchHousingSchema() in affordable-housing-changes.11tydata.js. The type
  // of input rendered depends on the data type of the Airtable field.
  // This function automatically generates a field id that will match the id
  // generated by fieldLabel() for the same 'fieldName'. An optional 'index' 
  // string will be appended to the generated id like 'id:index'. The input
  // (or select, or textarea) element style can be adjusted with the 'className' 
  // string.
  const formField = function(fields, fieldName, className="", index="") {
    let field = fields[fieldName];
    let tag = "";
    let options = "";
    let content = "";
    let endtag = "";
    let indexStr = index !== "" ? ":" + index : "";
    let classStr = className !== "" ? `class="${className}"` : "";
    if (field.type === "singleSelect") {
      tag = "select";
      endtag = "</select>";
      content = `<option></option>`;
      for (const choice of field.options.choices) {
        content += `<option value="${choice.name}"
          data-color="${choice.color}">${choice.name}</option>`;
      }
    } else if (field.type === "multipleSelects") {
      let checkboxes = [];
      for (const choice of field.options.choices) {
        let choiceId = choice.name.replace(/\s/g, "-").toLowerCase();
        let id = `${field.id}:${choiceId}${indexStr}`;
        checkboxes.push(`<input type="checkbox" id="${id}"
          name="${field.name}${indexStr}" value="${choice.name}"
          data-color="${choice.color}"> <label
          for="${id}">${choice.name}</label>`);
      }
      // Break out of the generalized element generation and just
      // return what we've come up with above for multipleSelects.
      return checkboxes.join("<br/>");
    } else if (field.type === "multilineText") {
      tag = "textarea";
      endtag = "</textarea>";
    } else if (field.type === "number") {
      let precision = Number(field.options.precision);
      tag = "input";
      options = `type="number" min="0" step="${10 ** (-1 * precision)}"`
    } else if (field.type === "email") {
      tag = "input";
      options = `type="email"`;
    } else if (field.type === "phoneNumber") {
      tag = "input";
      options = `type="tel"`;
    } else if(field.type === "url") {
      tag = "input";
      options = `type="url"`;
    } else if (field.type === "singleLineText") {
      tag = "input";
      options = `type="text"`;
    } else if (field.type === "checkbox") {
      tag = "input";
      options = `type="checkbox"`;
    } else {
      return "";
    }
    return `<${tag} id="${field.id}${indexStr}"
      name="${field.name}${indexStr}" ${options} ${classStr}>${content}${endtag}`;
  }

  eleventyConfig.addShortcode("fieldLabel",
      function(labelText, fields, fieldName) {
    return fieldLabel(labelText, fields, fieldName);
  });

  eleventyConfig.addShortcode("indexedFieldLabel", 
      function(index, labelText, fields, fieldName) {
    return fieldLabel(labelText, fields, fieldName, index);
  });

  eleventyConfig.addShortcode("formField", 
      function(fields, fieldName, className="") {
    return formField(fields, fieldName, className);
  });

  eleventyConfig.addShortcode("indexedFormField", 
      function(index, fields, fieldName, className="") {
    return formField(fields, fieldName, className, index);
  });

  // Generates a rendered summary of affordable housing filter options.
  eleventyConfig.addShortcode("querySummary", function(query) {
    // Copy the query so we don't modify it directly when making changes later on.
    let queryCopy = JSON.parse(JSON.stringify(query));
    // The includeUnknown(Rent|Income) parameters only apply if a rent or income
    // is supplied, so remove them if they do not apply.
    if (queryCopy["includeUnknownRent"] && !queryCopy["rentMax"]) {
      delete queryCopy["includeUnknownRent"];
    }
    if (queryCopy["includeUnknownIncome"] && !queryCopy["income"]) {
      delete queryCopy["includeUnknownIncome"];
    }
    let filtersApplied = []
    for (let parameter in queryCopy) {
      let value = queryCopy[parameter];
      if (!value) {
        continue
      }
      if (parameter == "rentMax" || parameter == "income") {
        value = formatCurrency(Number(value));
      }
      if (value == "on") {
        // Simply showing the parameter key is enough.  No need to also show
        // "on" or similar (e.g. "yes", "true").
        value = "";
      }
      let valueStr = "";
      if (value) {
        valueStr = `: ${value}`;
      }
      filtersApplied.push(`<span class="badge"><span class="bold">${camelCaseToSpaces(parameter)}</span>${valueStr}</span>`)
    }
    return filtersApplied.join(" ");
  });

  // Gets a subset of all housing results from Airtable based on 'query'.
  eleventyConfig.addFilter("groupUnits", async function(housingList) {
    // Combine entries with the same housing ID by filling the 'units'
    // property with data from all units for that housing ID.
    let housingListCopy = JSON.parse(JSON.stringify(housingList));
    let housingById = {};
    for (const idx in housingListCopy) {
      let housingId = housingListCopy[idx].id;
      housingById[housingId] = housingById[housingId] || housingListCopy[idx];
      housingById[housingId].units.push(housingListCopy[idx].unit);
      // The 'unit' property was temporary and used only to hold
      // the unit-level data for each fetched record.  The same data
      // (plus data for other units with the same housing ID)
      // now resides in the 'units' property.
      delete housingById[housingId].unit;
    }
    // Each housing ID key is also stored in the value as the 'id' property
    // so the object can be converted to an array without information loss.
    return Object.values(housingById);
  });

  // Summarizes the 'units' array of each item in 'housingList' by the
  // 'summarizeBy' keys.
  // 'housingList' is an array of apartments returned by the housingResults
  // filter. 'summarizeBy' is a list of unit keys 
  // (e.g. ["openStatus", "unitType"]) that all units in a given apartment
  // should be summarized by.  The summary is generated by removing all keys
  // except those in 'summarizeBy' and then getting the unique set of the 
  // resulting array of units.
  eleventyConfig.addFilter("summarizeUnits", function(housingList, summarizeBy) {
    let housingListCopy = JSON.parse(JSON.stringify(housingList));
    for (let housing of housingListCopy) {
      let summary = new Set();
      for (let unit of housing.units) {
        let unitSummary = {};
        for (let prop of summarizeBy) {
          unitSummary[prop] = unit[prop];
        }
        // Stringify the unitSummary so that we can ensure uniqueness
        // via the Set.  If an apartment has a single unit type offered
        // at multiple rents, we want to ensure the summary only lists
        // the unit type one time, not once for each rent offering.
        summary.add(JSON.stringify(unitSummary));
      }
      // Make an array from the Set, and also convert the stringified
      // unit objects back into objects.
      housing.units = [...summary].map(x => JSON.parse(x));
    }
    return housingListCopy;
  });

  eleventyConfig.addFilter("filterByQuery", function(housingList, query) {
    query = query || "";
    console.log(query);
    let housingListCopy = JSON.parse(JSON.stringify(housingList));
    if (!query.includeReferrals) {
      housingListCopy = housingListCopy.filter(x => !x.disallowsPublicApps);
    }

    if (query.unitType) {
      const rooms = query.unitType.split(", ");
      housingListCopy = housingListCopy.filter(
        x => rooms.includes(x.unit.unitType));
    }

    if (query.city) {
      const cities = query.city.split(", ");
      housingListCopy = housingListCopy.filter(x => cities.includes(x.city));
    }

    if (query.availability) {
      const availabilities = query.availability.split(", ");
      housingListCopy = housingListCopy.filter(
        x => availabilities.includes(x.unit.openStatus));
    }

    if (query.populationsServed) {
      const populations = query.populationsServed.split(", ");
      housingListCopy = housingListCopy.filter(x => {
        if (!x.populationsServed.length &&
            populations.includes("General Population")) {
          // Entries with an empty _POPULATIONS_SERVED field are interpreted as
          // being open to the general public, so allow those entries as well if
          // the user wants General Population entries.
          return true;
        }
        for (const population of populations) {
          if (x.populationsServed.includes(population)) {
            return true;
          }
        }
      });
    }

    if (query.wheelchairAccessibleOnly) {
      housingListCopy = housingListCopy.filter(
        x => x.hasWheelchairAccessibleUnits);
    }

    if (query.rentMax) {
      const rentMax = Number(query.rentMax);
      housingListCopy = housingListCopy.filter(x => {
        return (
          (query.includeUnknownRent && !x.unit.rent) ||
          Number(x.unit.rent) <= rentMax);
      });
    }

    if (query.income) {
      const income = Number(query.income);
      housingListCopy = housingListCopy.filter(x => {
        const minIncomeMatch = (
          (query.includeUnknownIncome && !x.unit.minIncome) ||
          Number(x.unit.minIncome) <= income);
        const maxIncomeMatch = (
          (query.includeUnknownIncome && !x.unit.maxIncome.high) ||
          Number(x.unit.maxIncome.high) >= income);
        return minIncomeMatch && maxIncomeMatch;
      })
    }

    if (query.propertyName) {
      const propertyName = query.propertyName.toLowerCase();
      housingListCopy = housingListCopy.filter(
        x => x.aptName.toLowerCase().includes(propertyName));
    }

    return housingListCopy;
  });


  // Sass pipeline
  eleventyConfig.addTemplateFormats("scss");
  eleventyConfig.addExtension("scss", {
    outputFileExtension: "css",
    compile: function(contents, includePath) {
      let includePaths = [this.config.dir.includes];
      return () => {
        let ret = sass.renderSync({
          file: includePath,
          includePaths,
          data: contents,
          outputStyle: "compressed"
        });
        return ret.css.toString("utf8");
      }
    }
  });

  return {
    dir: {
      input: "src/site",
      output: "dist"
    }
  }
};