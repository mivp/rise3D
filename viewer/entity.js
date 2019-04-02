/**
 * DataEntity - generic data source for RISE viewer; all source data types can build from here
 */

var EntityType = {
    None : "None",                              // entity type not defined, won't be useful
    Building : "Building",                      // a building/residence
    Object : "Object",                          // a physical object, probably represented by a mesh
    Region : "Region",                          // a geographical region
    Marker : "Marker",                          // a single-point marker (e.g. from KML)
    Hygrochron : "Hygrochron",                  // a combined hygrometer/thermometer device
    WeatherCollection : "WeatherCollection",    // a collection of weather snapshots, needs to be associated with a Region
    // more to come..
};

class DataEntity
{
    constructor(id)
    {
        this.type = EntityType.None;        // type of entity, for identifying the data structure layout
        this.id = id;
        this.data = null;                   // data structure will depend on the type of entity
                                            // this will probably be the source data supplied for the project, or some derivative of it
                                            // that isn't in Cesium.js format, and isn't in Cesium.js time intervals
        this._data_entity_type = true;      // an identifier to indicate this is a DataEntity

        g_allEntities.set(id, this);
    }

    static getById(id)
    {
        return g_allEntities.get(id);
    }
}

var g_allEntities = new Map();
