module.exports = (data) => {

  return `<form action="/housing/affordable-housing/search" action="get" id="housing-search">
  <label for="city">City</label>
  <select name="city" id="city" multiple>
    <option value="">All cities</option>
    <option value="Mountain View">Mountain View</option>
    <option value="San Jose">San Jose</option>
    <option value="Cupertino">Cupertino</option>
    <option value="Milpitas">Milpitas</option>
  </select>
  
  <label for="unitType">Unit type</label>
  <select name="unitType" id="unitType" multiple>
    <option value="1 Bedroom">1 Bedroom</option>
    <option value="2 Bedroom">2 Bedroom</option>
    <option value="3 Bedroom">3 Bedroom</option>
    <option value="4 Bedroom">4 Bedroom</option>
    <option value="5 Bedroom">5 Bedroom</option>
    <option value="6 Bedroom">6 Bedroom</option>
    <option value="7 Bedroom">7 Bedroom</option>
  </select>

  <input type="submit" value="Search" />
</form>
`;
}
