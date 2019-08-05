var g_sceneData = null;
var g_defaultElement = null;
var g_weatherData = null;
var g_timeIntervals = null; //= new Cesium.TimeIntervalCollection();
var g_hygroDataIntervals = null;    // JUST FOR TESTING
var g_hygroData = null;
// testing
var housedata = null;
var weatherCtr = null;
var selectedPoint = null;
var g_ctime = null;
var g_displayGroups = new Map();
var g_displayLayers = new Map();    // new approach at grouping data - works like display groups, except that a layer can contain many groups/objects that may not be of similar types

// loader
var _g_loaderTotalSteps = 0;
var _g_loaderCurrentStep = 0;

// also testing, some storage containers that will be improved later..
var g_kmlSources = new Map();

var g_intervalGroups = new Map();   // used for storing intervals as data is loaded in, this will all be merged into g_timeIntervals

var g_objToSrcMap = new Map();  // Cesium object IDs and references to data sources

// object references
var viewer = null;
var previewEntity = null;
var previewDataObj = null;

var weather_icon_names = {
    "Clouds" : "cloud",
    "Thunderstorm" : "flash_on",
    "Rain" : "opacity"
};

async function loadSceneData()
{
    var scene_file = "scene_data.json";
    /*
    var urlvars = getUrlVars();
    console.log("loadScenedata");
    console.log(urlvars);
    if ("scene_file" in urlvars) 
    {
        scene_file=urlvars["scene_file"];
    }
    console.log(scene_file);
    */
    
    var response = await fetch(scene_file);
    var text = await response.text();

    await processSceneData(text);
}

function processSceneData(data)
{
    return new Promise(async (resolve, reject) => {
        console.log("processSceneData()");
        console.log(data);
        var g_sceneData = JSON.parse(data);
        var i = 0;
        
        updateProgressDisplay(0, i, g_sceneData.elements.length)

        for(var element of g_sceneData.elements)
        {
            updateProgressDisplay(0, i);

            console.log("Found scene element, type: " + element.type + ", datatype: " + element.datatype);

            if(element.enabled == false)
            {
                console.log("Scene element with type " + element.type + " not enabled in scene data JSON, skipping..");
                continue;
            }

            if(element.type == "tileset")
            {
                // for elements already in 3D tiles format
                await loadElement(element);
            }
            else if(element.type == "geometry")
            {
                // for geometry defined manually
                if(element.datatype == "shapes")
                {
                    await loadShapeData(element);
                }
                else if(element.datatype == "polylines")
                {
                    console.log('Found polylines scene element, loading..');
                    await loadPolylineData(element);
                }
                else if(element.datatype == "markers")
                {
                    console.log('Found markers scene element, loading..');
                    await loadMarkerData(element);
                }
                else
                {
                    console.log("Unknown geometry element, skipping..");
                }
            }
            else if(element.type == "file")
            {
                await loadFile(element);
            }
            else
            {
                // unknown element type
                console.log("Scene element with unknown type " + element.type + " encounted, skipping..");
            }
            
            i++;
        }

        resolve();
    });
}

function loadElement(description)
{
    return new Promise((resolve, reject) => {
        var element = viewer.scene.primitives.add(new Cesium.Cesium3DTileset({
            url: description.path
        }));

        // 20190304 - for now, first thing loaded will get camera focus
        if(g_defaultElement == null)
        {
            g_defaultElement = element;
        }

        if(description.datatype == "points")
        {
            element.style = new Cesium.Cesium3DTileStyle({
                "pointSize" : "3.0"
            });
        }

        // early grouping work, just create an entity group for each entity
        // var grp = new Cesium.EntityCollection();

        // element.allTilesLoaded.addEventListener(function() {
        element.readyPromise.then(function(element){
            var name = description.name;
            var caption = (description.caption != undefined ? description.caption : description.name);

            var markerPosition = element.boundingSphere.center;

            var marker = viewer.entities.add({
                name : name,
                position : markerPosition,
                point : {
                    pixelSize : 8,
                    color : Cesium.Color.RED,
                    outlineColor : Cesium.Color.WHITE,
                    outlineWidth : 2
                },
                label : {
                    text : caption,
                    font : '24pt Segoe UI',
                    style : Cesium.LabelStyle.FILL_AND_OUTLINE,
                    outlineWidth : 1.0,
                    outlineColor: Cesium.Color.BLACK,
                    verticalOrigin : Cesium.VerticalOrigin.BOTTOM,
                    pixelOffset : new Cesium.Cartesian2(0, -9)
                }
            });

            // grp.add(element);
            
            // addDisplayGroup(description.name + "(" + description.datatype + ")", grp);
            addDisplayGroup(description.name + "(" + description.datatype + ")", element);

            var dataObj = new DataEntity("points_" + description.name);
            dataObj.type = EntityType.PointCloud;
            dataObj.data = {
                name : description.name,
                source : element
            };
    
            // element.id = dataObj; // TODO: this isn't 100% consistent, need to make all objects reference data entities or have an ID that can be looked up, preferably not a mix of both :)
    
            g_objToSrcMap.set("points_" + description.name, dataObj);
        });    

        resolve();
    });
}

async function loadFile(element)
{
    if(element.datatype == "kml")
    {
        await loadKML(element);
    }
    else if(element.datatype == "mesh")
    {
        await loadMesh(element);
    }
    else if(element.datatype == "hygro_csv")
    {
        // loads a set of sample data from a csv, expects a specific format here, so this one is purpose-built
        await loadHygrodata(element);
    }
    else if(element.datatype == "orthophoto")
    {
        await loadOrthophoto(element);
    }
}

function loadKML(description)
{
    return new Promise(async (resolve, reject) => {
        console.log("Loading KML/KMZ: " + new URL(description.path, window.location.href));

        var dataSource = await Cesium.KmlDataSource.load(description.path);

        viewer.dataSources.add(dataSource,
            {
                camera: viewer.scene.camera,
                canvas: viewer.scene.canvas
            });

        g_kmlSources.set(description.path, dataSource);

        var selector = document.getElementById("sitesSelector");
        var grp = document.createElement("optgroup");
        // grp.label = description.path;

        grp.label = description.path.substring(description.path.lastIndexOf('/') + 1, description.path.lastIndexOf('.'));

        selector.add(grp);

        var eIndex = 0;

        for(var e of dataSource.entities.values)
        {
            console.log("KML entity:");
            console.log(e.name);

            updateProgressDisplay(eIndex / dataSource.entities.values.length);

            if(e.position == undefined)
            {
                console.log("Does not appear to be a positional marker, skipping..");
                continue;
            }

            // selector.add(Option(e.name));
            opt = new Option(e.name);
            opt.className = "selector_line";
            opt.value = e.id;
            grp.appendChild(opt);

            var dataObj = new DataEntity("kml_marker_" + e.id);
            dataObj.type = EntityType.Marker;
            dataObj.data = {
                name : e.name,
                source : e
            };

            g_objToSrcMap.set(e.id, dataObj);

            eIndex++;
        }
        resolve();
    });
}

// TESTING ONLY REMOVE ASAP (for console reference to the main mesh)
var g_mesh = null;

function loadMesh(description)
{
    return new Promise((resolve, reject) => {
        console.log("Loading mesh file: " + new URL(description.path, window.location.href));

        var deg = toLatLon(description.position.x, description.position.y, 50, 'M');

        var origin = Cesium.Cartesian3.fromDegrees(deg.longitude, deg.latitude);
        var modelMatrix = Cesium.Transforms.eastNorthUpToFixedFrame(origin);
        // Cesium.Matrix4.multiplyByTranslation(modelMatrix, new Cesium.Cartesian3(0, 1, 0), modelMatrix);
        Cesium.Matrix4.multiply(modelMatrix, Cesium.Matrix4.fromTranslationQuaternionRotationScale(
            new Cesium.Cartesian3(description.transform.translation.x, description.transform.translation.y, description.transform.translation.z),
            new Cesium.Quaternion.fromHeadingPitchRoll(new Cesium.HeadingPitchRoll(Math.PI * (description.transform.orientation.y / 180), Math.PI * (description.transform.orientation.x / 180), Math.PI * (description.transform.orientation.z / 180))),
            new Cesium.Cartesian3(description.transform.scale.x, description.transform.scale.y, description.transform.scale.z)),
            modelMatrix);

        // early grouping work, just create an entity group for each entity
        // var grp = new Cesium.EntityCollection();
        
        var model = Cesium.Model.fromGltf({
            url: description.path,
            // scale: 0.05,
            show: true,
            modelMatrix: modelMatrix,
            allowPicking: true
        });

        // grp.add(model);
        var primitive = viewer.scene.primitives.add(model);

        if(description.path.indexOf('Makassar') != -1)
        {
            console.log('Storing global reference to test mesh');
            g_mesh = model;
        }

        // addDisplayGroup(description.name + "(" + description.datatype + ")", grp);
        addDisplayGroup(description.name + "(" + description.datatype + ")", model);

        var dataObj = new DataEntity("model_" + description.name);
        dataObj.type = EntityType.Object;
        dataObj.data = {
            name : description.name,
            source : model
        };

        model.id = dataObj; // TODO: this isn't 100% consistent, need to make all objects reference data entities or have an ID that can be looked up, preferably not a mix of both :)

        g_objToSrcMap.set("model_" + description.name, dataObj);

        resolve();
    });
}

async function loadHygrodata(description)
{
    // first load the filelist
    var response_filelist = await fetch(description.filelist);
    var text_filelist = await response_filelist.text();

    // now load the summary CSV
    var response = await fetch(description.path);
    var text = await response.text();
    await processHygrodataSummary(text, text_filelist, description.datapath, description);
}

async function processHygrodataSummary(description, filenames, datapath, sourceElement)
{
    console.log("processHygrodataSummary()");
    console.log(description);

    var dataFilenames = filenames.split('\n');

    console.log(dataFilenames);

    // early grouping work, just create an entity group for each entity
    var grp = new Cesium.EntityCollection();
 
    // var hygrosummary = JSON.parse(description);
    var lines = description.split('\n');
    var data = [];
    g_hygroData = new Map();

    for(var line of lines)
    {
        var fields = line.split(',');

        console.log("Line:");
        console.log(fields);

        if(fields.length < 2)
        {
            continue;
        }
        
        data.push(fields);
    }

    // skip headers line
    for(let i = 1; i < data.length; i++)
    {
        var pointID = data[i][0].slice(-3);

        updateProgressDisplay(i / data.length);

        // create the marker to represent the data collection location
        var markerPosition = Cesium.Cartesian3.fromDegrees(data[i][2], data[i][1]);
        var markerName = data[i][5] + " " + data[i][0];
    
        var marker = viewer.entities.add({
            name : "marker_" + pointID,
            position : markerPosition,
            point : {
                pixelSize : 8,
                color : Cesium.Color.BLUE,
                outlineColor : Cesium.Color.WHITE,
                outlineWidth : 2
            },
            label : {
                text : data[i][5] + " " + data[i][0],
                font : '16pt Segoe UI',
                style : Cesium.LabelStyle.FILL_AND_OUTLINE,
                outlineWidth : 1.5,
                outlineColor: Cesium.Color.BLACK,
                verticalOrigin : Cesium.VerticalOrigin.BOTTOM,
                pixelOffset : new Cesium.Cartesian2(0, -9),
                distanceDisplayCondition : new Cesium.DistanceDisplayCondition(0.0, 8000.0),
                translucencyByDistance : new Cesium.NearFarScalar(1000.0, 1.0, 8000.0, 0.0)
            },
            id : pointID
        });

        grp.add(marker);

        var dataObj = new DataEntity("hygro_" + pointID);
        dataObj.type = EntityType.Hygrochron;
        dataObj.data = {
            name : marker.name,
            source : null
        };

        // g_objToSrcMap.set("hygro_" + pointID, dataObj);
        g_objToSrcMap.set(pointID, dataObj);

        // load the time series for this data location
        var foundDataFile = false;
        var targetFile = "";

        console.log("pointID for this marker: " + pointID);

        for(let filename of dataFilenames)
        {
            var candidateString = filename.slice(-12, -7).split(' ').join('').toUpperCase();

            // console.log("Candidate string: " + candidateString);

            if(candidateString == pointID)
            {
                targetFile = filename;
                foundDataFile = true;
                break;
            }
        }

        if(foundDataFile)
        {
            console.log("Matched file " + targetFile + " from pointID " + pointID);

            // now load the summary CSV
            var response = await fetch(datapath + "/" + targetFile);
            var text = await response.text();
            await processHygrodataSeries(text, pointID, marker, sourceElement, markerName, dataObj);
        }
    }

    addDisplayGroup(sourceElement.name + "(" + sourceElement.datatype + ")", grp);
}

// FIXME: currently storing a reference to each updatable marker here, really should have a dedicated structure and search feature for this
async function processHygrodataSeries(rawdata, pointID, marker, sourceElement, markerName, dataObj)
{
    return new Promise((resolve, reject) => {
        console.log("processHygrodataSeries()");

        var lines = rawdata.split('\n');
        var data = [];
    
        for(var line of lines)
        {
            var fields = line.split(',');
    
            // console.log("Line:");
            // console.log(fields);
    
            if(fields.length < 2)
            {
                continue;
            }
            
            data.push(fields);
        }
    

        var intervals = new Array();

        // skip headers line
        for(let i = 1; i < data.length; i++)
        {
            // console.log("Snapshot " + data[i][0]);

            var startDate = new Date(data[i][1], data[i][2], data[i][3], data[i][4], data[i][5], data[i][6]);
            var endInterval = new Date(startDate);
            endInterval.setSeconds(startDate.getSeconds() + 3599);

            var interval = new Cesium.TimeInterval(
                {
                    "start" : Cesium.JulianDate.fromDate(startDate),
                    "stop" : Cesium.JulianDate.fromDate(endInterval),
                    "isStartIncluded" : true,
                    "isStopIncluded" : false,
                    // "isStopIncluded" : true,//false,
                    // "data" : { "temperature" : data[i][7], "humidity" : data[i][8] }
                    "data" : //[
                        { 
                            "element" : marker,
                            "type" : "hygro",
                            "owner" : markerName,
                            "value" : {
                                "temperature" : data[i][7], "humidity" : data[i][8]
                            }
                        }
                    //]
                }
            );

            // console.log("Adding interval");
            intervals.push(interval);
        }

        // g_intervalGroups.set(sourceElement.name, new Cesium.TimeIntervalCollection(intervals));
        var intervalCollection = new Cesium.TimeIntervalCollection(intervals);
        g_intervalGroups.set(markerName, intervalCollection);

        dataObj.data.source = intervalCollection;

        // g_timeIntervals = new Cesium.TimeIntervalCollection(intervals);
        g_hygroData.set(pointID, { "intervals" : new Cesium.TimeIntervalCollection(intervals), "marker" : marker, "caption" : marker.label.text });

        resolve();
    });
}

function loadOrthophoto(description)
{
    console.log("Loading orthophoto file: " + new URL(description.path, window.location.href));

    // early grouping work, just create an entity group for each entity
    // var grp = new Cesium.EntityCollection();
 
    var tms = Cesium.createTileMapServiceImageryProvider({
        url : description.path,
        fileExtension: 'png'
        // maximumLevel: 10
    })

    var layer = viewer.imageryLayers.addImageryProvider(tms);

    // grp.add(tms);
    // addDisplayGroup(description.name + "(" + description.datatype + ")", grp);
    addDisplayGroup(description.name + "(" + description.datatype + ")", layer);
}

function loadShapeData(element)
{
    var req = new XMLHttpRequest();
    req.addEventListener("load", function(evt){
        processShapeData(req.responseText, element);
    });
    req.open("GET", element.path);
    req.send();
}

function processShapeData(description, sourceElement)
{
    var geometry = JSON.parse(description);
    var housedata = geometry;   // todo: remove this, probably won't be needed
 
    // early grouping work, just create an entity group for each entity
    var grp = new Cesium.EntityCollection();
 
    var i = 0;

    for(var shape of geometry.shapes)
    {
        i++;
        var degArr = [];

        var avgLong = 0.0;
        var avgLat = 0.0;

        for(var line of shape.lines)
        {
            var deg = toLatLon(line.x, line.y, 50, 'M');
            degArr.push(deg.longitude);
            degArr.push(deg.latitude);

            avgLong += deg.longitude;
            avgLat += deg.latitude;
        }

        avgLong /= shape.lines.length;
        avgLat /= shape.lines.length;

        // add first vertex again to close the path
        var deg = toLatLon(shape.lines[0].x, shape.lines[0].y, 50, 'M');
        degArr.push(deg.longitude);
        degArr.push(deg.latitude);

        // console.log(degArr);

        var shapeVol = viewer.entities.add({
            polylineVolume : {
                positions : Cesium.Cartesian3.fromDegreesArray(degArr),
                cornerType: Cesium.CornerType.MITERED,
                material: Cesium.Color.RED,
                shape: [new Cesium.Cartesian2(-1, 0),
                    new Cesium.Cartesian2(1, 0),
                    new Cesium.Cartesian2(1, 5),
                    new Cesium.Cartesian2(-1, 5)],
                shadows: Cesium.ShadowMode.ENABLED,
                fill: true
            }
        });

        grp.add(shapeVol);

        var dataObj = new DataEntity("shape_" + shape.id);
        dataObj.type = EntityType.Building;
        dataObj.data = {
            name : shape.id,
            shape : shape.lines
        };

        g_objToSrcMap.set(shapeVol._id, dataObj);

        // var shapeGeomSrc = new Cesium.PolylineVolumeGeometry({
        //     // vertexFormat : Cesium.VertexFormat.POSITION_ONLY,
        //     vertexFormat : Cesium.PerInstanceColorAppearance.VERTEX_FORMAT,
        //     polylinePositions : Cesium.Cartesian3.fromDegreesArray(degArr),
        //     shapePositions : [new Cesium.Cartesian2(-1, 0),
        //         new Cesium.Cartesian2(1, 0),
        //         new Cesium.Cartesian2(1, 25),
        //         new Cesium.Cartesian2(-1, 25)]
        // });

        // var shapeGeom = Cesium.PolylineVolumeGeometry.createGeometry(shapeGeomSrc);

        var shapeGeom = new Cesium.PolygonGeometry({
            // vertexFormat : Cesium.VertexFormat.POSITION_ONLY,
            vertexFormat : Cesium.PerInstanceColorAppearance.VERTEX_FORMAT,
            // polylinePositions : Cesium.Cartesian3.fromDegreesArray(degArr),
            polygonHierarchy : new Cesium.PolygonHierarchy(Cesium.Cartesian3.fromDegreesArray(degArr)),
            extrudedHeight : 50.0
            // shapePositions : [new Cesium.Cartesian2(-1, 0),
            //     new Cesium.Cartesian2(1, 0),
            //     new Cesium.Cartesian2(1, 25),
            //     new Cesium.Cartesian2(-1, 25)]
        });

        shapeGeom = Cesium.PolygonGeometry.createGeometry(shapeGeom);

        // var origin = new Cesium.Cartesian3.fromDegrees(degArr[0], degArr[1]);
        var origin = Cesium.Cartesian3.fromDegrees(avgLong, avgLat);
        var modelMatrix = Cesium.Transforms.eastNorthUpToFixedFrame(origin);
        var translation = Cesium.Matrix4.fromTranslation(new Cesium.Cartesian3(0.0, 35.0, 0.0));
        Cesium.Matrix4.multiply(modelMatrix, translation, modelMatrix);

        var testColours = [
            [0.0, 0.0, 1.0],
            [0.0, 1.0, 0.0],
            [0.0, 1.0, 1.0],
            [1.0, 0.0, 0.0],
            [1.0, 0.0, 1.0],
            [1.0, 1.0, 0.0],
            [1.0, 1.0, 1.0],
            [0.5, 0.5, 1.0],
            [0.5, 1.0, 0.5],
            [0.5, 1.0, 1.0],
            [1.0, 0.5, 0.5],
            [1.0, 0.5, 1.0],
            [1.0, 1.0, 0.5],
            [0.5, 0.5, 0.5],
        ];

        var testColourIndex = Math.trunc(Math.random() * testColours.length);
        testColourIndex = 6;    // using white for now
        var testColour = new Cesium.Color(testColours[testColourIndex][0], testColours[testColourIndex][1],testColours[testColourIndex][2], 0.5);

        var highlight = viewer.scene.primitives.add(new Cesium.ClassificationPrimitive({
            geometryInstances: new Cesium.GeometryInstance({
                geometry: shapeGeom,
                // id: shape.id,
                // id: dataObj.id,
                // geometry : new Cesium.EllipsoidGeometry({
                //     radii : new Cesium.Cartesian3(20.0, 20.0, 20.0)
                // }),
                // modelMatrix : Cesium.Transforms.eastNorthUpToFixedFrame(origin),
                // modelMatrix : modelMatrix,
                attributes : {
                    // color: Cesium.ColorGeometryInstanceAttribute.fromColor(new Cesium.Color(1.0, 0.0, 1.0, 0.5)),
                    // color: Cesium.ColorGeometryInstanceAttribute.fromColor(new Cesium.Color(1.0, 0.0, 1.0, 0.5)),
                    color: Cesium.ColorGeometryInstanceAttribute.fromColor(testColour),
                    show: new Cesium.ShowGeometryInstanceAttribute(true)
                },
                // id: 'volume' + i.toString()
                id: 'volume_' + dataObj.id
            }),
            show: true,
            classificationType : Cesium.ClassificationType.CESIUM_3D_TILE
        }));

        g_objToSrcMap.set(highlight.geometryInstances.id, dataObj);
    }

    addDisplayGroup(sourceElement.name + "(" + sourceElement.datatype + ")", grp);
}

async function loadMarkerData(element)
{
    var req = new XMLHttpRequest();
    req.addEventListener("load", function(evt){
        processMarkerData(req.responseText, element);
    });
    req.open("GET", element.path);
    req.send();
    // var response = await fetch(element.path);
    // var text = await response.text();
    // await processPolylineData(text);
}

function processMarkerData(description, sourceElement)
{
    console.log("processMarkerData()");
    // console.log(description);
    var geometry = JSON.parse(description.toString());

    var i = 0;

    // early grouping work, just create an entity group for each entity
    var grp = new Cesium.EntityCollection();

    for(var marker of geometry.markers)
    {
        i++;
        var lineWidth = 15.0;

        var deg = toLatLon(marker.x, marker.y, 50, 'M');

        var z = 0.0;

        // if this is a 3D polyline, add the Z dimension
        if(geometry.dimensions && geometry.dimensions == 3)
        {
            z = point.z;
            lineWidth = 5.0;
        }

        console.log("Marker: " + deg.longitude + " deg, " + deg.latitude + " deg" + ", height " + z);

        var ent = viewer.entities.add({
            position: Cesium.Cartesian3.fromDegrees(deg.longitude, deg.latitude),
            point : { 
                pixelSize: lineWidth,
                color: Cesium.Color.BLUE
            }
        });

        // ent.polyline.material = Cesium.Material.fromType('Color', {
        //     color : new Cesium.Color(0.0, 0.0, 1.0, 0.0)
        // });

        grp.add(ent);

        var dataObj = new DataEntity("markers_" + ent.id);
        dataObj.type = EntityType.Marker;
        dataObj.data = {
            name : sourceElement.name,
        };
    
        g_objToSrcMap.set(ent.id, dataObj);
    }

    // viewer.entities.add(grp);

    console.log("Adding display group " + sourceElement.name + "(" + sourceElement.datatype + ")");
    addDisplayGroup(sourceElement.name + "(" + sourceElement.datatype + ")", grp);
}

async function loadPolylineData(element)
{
    var req = new XMLHttpRequest();
    req.addEventListener("load", function(evt){
        processPolylineData(req.responseText, element);
    });
    req.open("GET", element.path);
    req.send();
    // var response = await fetch(element.path);
    // var text = await response.text();
    // await processPolylineData(text);
}

function processPolylineData(description, sourceElement)
{
    console.log("processPolylineData()");
    // console.log(description);
    var geometry = JSON.parse(description.toString());

    var i = 0;

    // early grouping work, just create an entity group for each entity
    var grp = new Cesium.EntityCollection();

    for(var polyline of geometry.polylines)
    {
        i++;
        var degArr = [];

        var avgLong = 0.0;
        var avgLat = 0.0;
        var lineWidth = 15.0;

        // for(var line of polyline.lines)
        for(var point of polyline.points)
        {
            // var deg = toLatLon(line.x1, line.y1, 50, 'M');
            var deg = toLatLon(point.x, point.y, 50, 'M');
            degArr.push(deg.longitude);
            degArr.push(deg.latitude);

            var z = 0.0;

            // if this is a 3D polyline, add the Z dimension
            if(geometry.dimensions && geometry.dimensions == 3)
            {
                z = point.z;
                lineWidth = 5.0;
            }

            degArr.push(z);

            avgLong += deg.longitude;
            avgLat += deg.latitude;

            console.log("Point: " + deg.longitude + " deg, " + deg.latitude + " deg" + ", height " + z);

            // deg = toLatLon(line.x2, line.y2, 50, 'M');
            // degArr.push(deg.longitude);
            // degArr.push(deg.latitude);
        }

        // avgLong /= polyline.lines.length;
        // avgLat /= polyline.lines.length;
        avgLong /= polyline.points.length;
        avgLat /= polyline.points.length;

        var ent = viewer.entities.add({
        // var ent = new Cesium.Entity({
            // position : Cesium.Cartesian3.fromDegrees(avgLong, avgLat),
            polyline : {
                positions: Cesium.Cartesian3.fromDegreesArrayHeights(degArr),
                width: lineWidth,
                material: Cesium.Color.BLUE,
                clampToGround: true
            },
            show : true
        });

        // ent.polyline.material = Cesium.Material.fromType('Color', {
        //     color : new Cesium.Color(0.0, 0.0, 1.0, 0.0)
        // });

        grp.add(ent);

        var dataObj = new DataEntity("polyline_" + ent.id);
        dataObj.type = EntityType.Polyline;
        dataObj.data = {
            name : sourceElement.name,
            // lines : ent.polyline,
            // material: mat
        };
    
        g_objToSrcMap.set(ent.id, dataObj);

        /*
        var pl = new Cesium.PolylineCollection();
        pl.add({
            show: true,
            positions : Cesium.Cartesian3.fromDegreesArray(degArr),
            // cornerType: Cesium.CornerType.MITERED,
            // material: Cesium.Color.RED,
            width: 15
        });

        grp.add(pl);

        var lineGeom = viewer.scene.primitives.add(new Cesium.PolylineGeometry({
            geometryInstances: new Cesium.GeometryInstance({
                positions : Cesium.Cartesian3.fromDegreesArray(degArr),
                width: 15
                // id: 'volume_' + dataObj.id
            }),
            show: true
            // classificationType : Cesium.ClassificationType.CESIUM_3D_TILE
        }));

        */
        // g_objToSrcMap.set(highlight.geometryInstances.id, dataObj);

        // viewer.scene.primitives.add(pl);

        // var dataObj = new DataEntity("shape_" + shape.id);
        // dataObj.type = EntityType.Building;
        // dataObj.data = {
        //     name : shape.id,
        //     shape : shape.lines
        // };

        // g_objToSrcMap.set(shapeVol._id, dataObj);

        // g_objToSrcMap.set(highlight.geometryInstances.id, dataObj);
    }

    // viewer.entities.add(grp);

    console.log("Adding display group " + sourceElement.name + "(" + sourceElement.datatype + ")");
    addDisplayGroup(sourceElement.name + "(" + sourceElement.datatype + ")", grp);
}

async function loadWeatherData()
{
    /*
    var req = new XMLHttpRequest();
    req.addEventListener("load", function(evt){
        processWeatherData(req.responseText);
    });
    req.open("GET", "weather_data.json");
    req.send();
    */

    // await fetch("weather_data.json").then(function(response) {
    //     response.text().then(function(text) {
    //         processWeatherData(text);
    //     });
    // });

    var response = await fetch("weather_data.json");
    var text = await response.text();
    await processWeatherData(text);
}

async function processWeatherData(description)
{
    return new Promise((resolve, reject) => {
        console.log("processWeatherData()");
        console.log(description);

        var g_weatherData = JSON.parse(description);
        var intervals = new Array();

        for(var snapshot of g_weatherData.weather)
        {
            console.log("Snapshot time " + snapshot.dt);

            var interval = new Cesium.TimeInterval(
                {
                    "start" : Cesium.JulianDate.fromDate(new Date(snapshot.dt * 1000)),
                    "stop" : Cesium.JulianDate.fromDate(new Date((snapshot.dt * 1000) + 3600000)),
                    "isStartIncluded" : true,
                    "isStopIncluded" : false,
                    // "data" : snapshot.weather
                    "data" : //[
                        {
                            "element" : null,
                            "owner" : null,
                            "type" : "weather",
                            "value" : snapshot
                        }
                    //]
                }
            );

            console.log("Adding interval");
            intervals.push(interval);
        }

        // g_timeIntervals = new Cesium.TimeIntervalCollection(intervals);
        g_intervalGroups.set("weather", new Cesium.TimeIntervalCollection(intervals));

        resolve();
    });
}

function getUrlVars() {
    var vars = {};
    var parts = window.location.href.replace(/[?&]+([^=&]+)=([^&]*)/gi, function(m,key,value) {
        vars[key] = value;
    });
    return vars;
}

function ah_sandpit(viewer)
{
    //viewer.dataSources.add(new Cesium.CzmlDataSource().load('../assets/simple.czml'))
    //var scene_file=getUrlVars()["scene_file"];
    //console.log(urlvars)
}

async function startup()
{
    // create a Cesium viewer and load Earth data
    
    Cesium.Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI0ZDgyMmRiYS0zMjMyLTQxMzMtYTNiMC05ZmZiZTRkZWQ2YTQiLCJpZCI6ODMyMywic2NvcGVzIjpbImFzciIsImdjIl0sImlhdCI6MTU1MTc1MzAzNX0.wDKGdaNCaseIbASuOFeSRdXF-Ch4uGfMQdeVBKTCzNU';

    viewer = new Cesium.Viewer('cesiumContainer', 
        {
            // 'vrButton' : true    // cardboard (not webVR) mode switch button
        }
    );

    viewer.clock.shouldAnimate = true;

    // load imagery
    var imageryLayer = viewer.imageryLayers.addImageryProvider(
        new Cesium.IonImageryProvider({ assetId: 3813 })
    );

    weatherCtr = document.getElementById("weatherReadout");
    
    //viewer = new Cesium.Viewer('cesiumContainer', {
    //    imageryProvider: Cesium.createTileMapServiceImageryProvider({
    //       url: '../Assets/imagery/NaturalEarthII'
    //    }),
        // terrainProvider: Cesium.createWorldTerrain({ // Cesium ion account is expected for this
        //     requestVertexNormals : true
        //}),
    //baseLayerPicker: false,
    //    geocoder: false
    //});

    // load all scene data
    await loadSceneData();

    // load demo weather data
    await loadWeatherData();

    document.getElementById('loaderProgressDisplay').style.display = 'none';
    
    // merge all timesteps together
    g_timeIntervals = new Cesium.TimeIntervalCollection();
    console.log('Combining time interval collections, count: ' + g_intervalGroups.size);

    for(var collection of g_intervalGroups.values())
    {
        console.log('Adding time interval collection, length: ' + collection.length);

        for(let i = 0; i < collection.length; i++)
        {
            g_timeIntervals.addInterval(collection.get(i),
                (l, r) => {
                    (l.type == r.type) &&
                    (l.owner == r.owner) &&
                    (l.value == r.value)
                }
            );
        }

        // g_timeIntervals = g_timeIntervals.intersect(
        //     collection,
        //     (l, r) => {
        //         console.log("comparing intervals");
        //         return l == r;
        //     },
        //     (l, r) => {
        //         console.log("concatenating intervals");
        //         return l.concat(r);
        //     }
        // );
    }    

    viewer.clockViewModel.clock.currentTime = g_timeIntervals.get(0).start;

    // look at the default element, this should be selected as part of the loading process
    viewer.zoomTo(g_defaultElement);
    
    // init any callbacks
    var selector = document.getElementById("sitesSelector");
    selector.onchange = (e) => {
        console.log("Selected site: " + e.target.value);

        // find the site
        for(var src of g_kmlSources.values())
        {
            var entity = src.entities.getById(e.target.value);

            if(entity != undefined)
            {
                viewer.zoomTo(entity);
                break;
            }
        }

        // viewer.zoomTo(e.target.value);
    }

    // set default site index
    // TODO: remove hard-coded value
    selector.selectedIndex = 10;

     ah_sandpit(viewer);
    
    // var testRegion = viewer.entities.add({
    //     position: Cesium.Cartesian3.fromDegrees(119.4955547, -5.0835328),
    //     ellipse: {
    //         semiMinorAxis : 100000.0,
    //         semiMajorAxis : 100000.0,
    //         material : Cesium.Color.BLUE.withAlpha(0.1)
    //     }
    // });

    var placeholderEntity = new Cesium.Entity();
    var hoveredEntity = undefined;
    
    viewer.screenSpaceEventHandler.setInputAction(function onLeftClick(movement){
        var feature = viewer.scene.pick(movement.position);
        if(!Cesium.defined(feature) || feature.id == undefined)
        {
            viewer.selectedEntity = null;
            selectedPoint = null;
            return;
        }

        var dataObj = null;
        console.log(feature);

        // first check if the id is a reference to a DataEntity
        if(feature.id._data_entity_type)
        {
            dataObj = feature.id;
        }
        // otherwise check if the _id property exists, if it does, check for a matching data entity
        else if(feature.id._id != undefined)
        {
            // dataObj = DataEntity.getById(feature.id._id);
            dataObj = g_objToSrcMap.get(feature.id._id);
        }

        // if that didn't work, check the id property (for some objects, this is a reference to a Cesium entity though!)
        if(dataObj == null || dataObj == undefined)
        {
            dataObj = g_objToSrcMap.get(feature.id);
        }

            // var collection = g_hygroData.get(feature.id._id).intervals;

            // if(collection != undefined)
            // {
            //     console.log("Found data location " + feature.id._id + ", checking time " + g_ctime);
            // }

            // var interval = collection.findDataForIntervalContainingDate(g_ctime);

            // if(interval != undefined)
            // {
            //     console.log("Current time temp: " + interval.temperature + " | humidity: " + interval.humidity);
            // }            
        // }

        if(dataObj != null && dataObj != undefined)
        {
            // viewer.selectedEntity = feature;

            placeholderEntity.name = "Data entity ID: " + dataObj.data.name;
            // viewer.selectedEntity.description = "Data entity ID: " + dataObj.name + ', type: ' + dataObj.type;
            placeholderEntity.description = "Data entity ID: " + dataObj.data.name + ', type: ' + dataObj.type;

            viewer.selectedEntity = placeholderEntity;

            // previewEntity = new Cesium.Entity();
            // previewEntity.name = "Data entity ID: " + dataObj.data.name;
            // previewEntity.description = "Data entity ID: " + dataObj.data.name + ', type: ' + dataObj.type;
            // previewEntity.position = feature.position;
            // previewEntity.show = true;
            previewEntity = placeholderEntity;
            previewEntity.description = new Cesium.CallbackProperty(updatePreviewEntity, false);
            previewDataObj = dataObj;
        }
        else
        {
            placeholderEntity.name = "Entity #" + feature.id._id;
            placeholderEntity.description = 'Retrieving data for this object is not yet implemented..';

            viewer.selectedEntity = placeholderEntity;
            previewEntity = null;
            previewDataObj = null;

            var collection = previewDataObj.data.source;

            var interval = collection.findDataForIntervalContainingDate(g_ctime);
    
            if(interval != undefined)
            {
                console.log("Current time temp: " + interval.temperature + " | humidity: " + interval.humidity);
            }            
        }

        // viewer.selectedEntity = placeholderEntity;

    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    viewer.screenSpaceEventHandler.setInputAction(function(movement){
        var feature = viewer.scene.pick(movement.endPosition);
        if(!Cesium.defined(feature) || feature.id == undefined)
        {
            return;
        }

        // console.log('Found feature: ' + feature.id);

        var dataObj = null;

        // first check if the id is a reference to a DataEntity
        if(feature.id._data_entity_type)
        {
            dataObj = feature.id;
        }
        // otherwise check if the _id property exists, if it does, check for a matching data entity
        else if(feature.id._id != undefined)
        {
            // dataObj = DataEntity.getById(feature.id._id);
            dataObj = g_objToSrcMap.get(feature.id._id);
        }

        // if that didn't work, check the id property (for some objects, this is a reference to a Cesium entity though!)
        if(dataObj == null || dataObj == undefined)
        {
            dataObj = g_objToSrcMap.get(feature.id);
        }

        if(hoveredEntity)
        {
            var attr = hoveredEntity.primitive.getGeometryInstanceAttributes(hoveredEntity.id);

            if(attr)
            {
                attr.color = hoveredEntity.primitive.originalColour;
            }

            // remove the original colour so that it has to be checked again next time
            delete hoveredEntity.primitive.originalColour;
            hoveredEntity = undefined;
        }

        if(feature.primitive && 'getGeometryInstanceAttributes' in feature.primitive)
        {
            var attr = feature.primitive.getGeometryInstanceAttributes(feature.id);

            if(attr)
            {
                if(feature.primitive.originalColour === undefined)
                {
                    feature.primitive.originalColour = attr.color;
                }
    
                hoveredEntity = feature;

                // console.log(attr);
                // attr.color = Cesium.Color.YELLOW;
                attr.color = [255, 255, 0, 128];
            }
        }

    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

    viewer.clockViewModel.clock.onTick.addEventListener(function(clock)
    {
        updateFromTime(clock);
    });
}

function updatePreviewEntity(time, result)
{
    // console.log("updatePreviewEntity()");
    var description = "";
    if(previewDataObj == null)
    {
        // console.log("updatePreviewEntity(): no data object");
        description += "No data recorded for this interval";
        return description;
    }

    description = "Data type: " + previewDataObj.type + "<br/><br/>";

    if(previewDataObj.type == EntityType.Hygrochron)
    {
        var collection = previewDataObj.data.source;

        var interval = collection.findDataForIntervalContainingDate(time);

        if(interval != undefined)
        {
            // previewEntity.description += ("Current time temp: " + interval.temperature + " | humidity: " + interval.humidity);
            description += ("Current time temp: " + Math.abs(interval.value.temperature).toFixed(2) + "C | humidity: " + Math.abs(interval.value.humidity).toFixed(2) + "%");
        }
    }
    else
    {
        // console.log("updatePreviewEntity(): not a hygrochron snapshot");
    }

    return description;
}

/**
 * 
 * @param {string} name Name of the layer to add this group to (will be created if it doesn't already exist)
 * @param {Object} group Group to add to the layer
 */
function addDisplayGroup(name, group)
{
    g_displayGroups.set(name, group);

    var layer = g_displayLayers.get(name);

    // if the layer doesn't exist, then create it
    if(layer == undefined)
    {
        layer = [];
    }

    layer.push(group);

    g_displayLayers.set(name, layer);

    var tbl = document.getElementById('groupsTable');
    var row = tbl.insertRow();

    var cbCell = row.insertCell();
    cbCell.className = "groupsTable_cbCell";
    
    var btn = document.createElement('button');
    btn.textContent = "check_box";
    // btn.className = "groupsTable_toggleBtn";
    btn.className = 'material-icons';
    cbCell.appendChild(btn);
    btn.onclick = function() {
        group.show = !group.show;
        btn.textContent = (group.show ? "check_box" : "check_box_outline_blank");
    }

    var nameCell = row.insertCell();
    nameCell.className = "groupsTable_nameCell";
    nameCell.innerHTML = name;

    nameCell.onclick = function(e) {
        console.log('Clicked on type ' + e.target.tagName);
        if(['TD'].includes(e.target.tagName.toUpperCase())) {
            viewer.zoomTo(group);
        }
    }

    // for polyline groups, add a colour changer - this will extend to other types later
    if(name.indexOf('polyline') != -1 || name.indexOf('markers') != -1)
    {
        var clr = document.createElement('input');
        clr.type = 'color';
        clr.value = '#0000ff';
        nameCell.appendChild(clr);
        clr.onchange = function(e) {
            setGroupColour(e.target.value, group, { colour: e.target.value });
        };
        nameCell.appendChild(document.createElement('br'));
        var sdr = document.createElement('input');
        sdr.type = 'range';
        nameCell.appendChild(sdr);
        sdr.oninput = function(e) {
            // todo: rename this function 
            setGroupColour(e.target.value, group, { width: e.target.value });
        }
    }
    if(name.indexOf('points') != -1)
    {
        var sdr = document.createElement('input');
        sdr.type = 'range';
        sdr.value = 3.0 * (1.0 / 0.2);  // set default value to match initial point size - TODO make this read from saved settings
        nameCell.appendChild(sdr);
        sdr.oninput = function(e) {
            // todo: rename this function 
            setGroupColour(e.target.value, group, { pointSize: e.target.value });
        }
    }

    dragElement(document.getElementById("groupsPanel"));
}

function setGroupColour(colour, group, options)
{
    var r = parseInt(colour.substring(1, 3), 16) / 255.0;
    var g = parseInt(colour.substring(3, 5), 16) / 255.0;
    var b = parseInt(colour.substring(5, 7), 16) / 255.0;
    var a = 1.0;

    // group.material = Cesium.Material.fromType('Color', { color: new Cesium.Color(r, g, b, a)});
    // group.material.uniforms.color = new Cesium.Color(r, g, b, a);
    // setEntityCollectionColour([r, g, b, a], group);

    // TODO: find out what type of object/group needs to change colour, then handle each accordingly (Cesium object types vary, and textured objects would need a tint, etc.)
    // check for an entity collection first
    if(group.values)
    {
        // console.log('Looking for entities to change colour');

        for(let val of group.values)
        {
            var ent = g_objToSrcMap.get(val.id);

            // if(ent && ent.data && ent.data.material)
            if(ent && ent.data)
            {
                if(ent.type == EntityType.Polyline)
                {
                    // console.log('Found polyline entity, setting colour.. (' + r + ', ' + g + ', ' + b + ', ' + a +')');

                    if('colour' in options)
                    {
                        val.polyline.material = new Cesium.Color(r, g, b, a);
                    }

                    if('width' in options)
                    {
                        val.polyline.width = options.width * 0.2;
                    }
                }
                else if(ent.type == EntityType.Marker)
                {
                    if('colour' in options)
                    {
                        val.point.color = new Cesium.Color(r, g, b, a);
                    }

                    if('width' in options)
                    {
                        val.point.pixelSize = options.width * 0.2;
                    }
                }

                // ent.data.material.uniforms.color = new Cesium.Color(r, g, b, a);
                // ent.data.material 
            }
        }
    }
    else if('style' in group)
    {
        // if(ent.type == EntityType.Points)
        {
            if('pointSize' in options)
            {
                group.style = new Cesium.Cesium3DTileStyle({
                    "pointSize" : options.pointSize * 0.2
                });
                // group.style.pointSize = options.pointSize * 0.1;
            }
        }
    }
    else
    {
        // console.log('Looking for entity to change colour');

        var ent = g_objToSrcMap.get(group.id);
    
        if(ent && ent.data && ent.data.material)
        {
            // console.log('Found entity material, setting colour..');
            ent.data.material.uniforms.color = new Cesium.Color(r, g, b, a);
        }
    }
}

function setEntityCollectionColour(colour, collection)
{
    if('values' in collection)
    {
        for(var e of collection.values)
        {
            setEntityCollectionColour(colour, e);
        }
    }
    else
    {
        // this seems like a slightly ridiculous way to do this..
        for(var p in collection)
        {
            if(Symbol.iterator in Object(p))
            {
                if(_material in p)
                {
                    p._material.color.setValue(new Cesium.Color(colour[0], colour[1], colour[2], colour[3]));                
                }
            }
        }
    }
}

/**
 * 
 * @param {number} currentDivision % of current step complete
 * @param {number} currentStep number of current loader step (e.g. scene_data.json element)
 * @param {number} totalSteps total number of loader steps
 */
function updateProgressDisplay(currentDivision, currentStep, totalSteps)
{
    var progress = 0;

    if(currentStep != undefined)
    {
        _g_loaderCurrentStep = currentStep;
    }
    
    if(totalSteps != undefined)
    {
        _g_loaderTotalSteps = totalSteps;
    }

    if(_g_loaderTotalSteps > 0)
    {
        progress = 100.0 * ((_g_loaderCurrentStep + currentDivision) / _g_loaderTotalSteps);
    }

    var msg = "Loading data..<br/><br/>";

    // document.getElementById('loaderProgressDisplay').textContent = msg;
    document.getElementById('loaderProgressBar').style.width = Math.abs(progress).toString() + '%';
}

function updateFromTime(clock)
{
    let cTime = clock.currentTime;
    g_ctime = Cesium.JulianDate.clone(cTime);

    for(let collection of g_intervalGroups.values())
    {
        // let interval = g_timeIntervals.findDataForIntervalContainingDate(cTime);
        let interval = collection.findDataForIntervalContainingDate(cTime);
        var snapshot = null;

        if(interval != undefined)
        {
            if(interval.type == "weather")
            {
                // snapshot = intervalValue;
                snapshot = interval.value;
            }
            else if(interval.type == "hygro")
            {
                // if(selectedPoint != null)
                {
                    // console.log("Found hygrochron data for interval");
                    // console.log("owner: " + interval.owner + " temp: " + interval.value.temperature + " humid: " + interval.value.humidity);
                    interval.element.label.text = interval.owner + "\n(" + Math.abs(interval.value.temperature).toFixed(2) + "C, humid: " + Math.abs(interval.value.humidity).toFixed(2) + "%)";
                }
            }
        }
    }
    
    if(snapshot != null)
    {
        // console.log("Found data at interval: " + interval.dt);
        // TODO: maybe don't keep destroying the contents of the title div :)
        // document.getElementById("weather_readout_title").innerHTML = interval.weather[0].main;
        // var iconname = weather_icon_names[interval.weather[0].main];
        document.getElementById("weather_readout_title").innerHTML = snapshot.weather[0].main;
        var iconname = weather_icon_names[snapshot.weather[0].main];
        if(iconname != undefined)
        {
            var e = document.createElement("I");
            e.textContent = iconname;
            e.className = 'material-icons';
            document.getElementById("weather_readout_title").appendChild(e);
        }

        document.getElementById("weather_readout_description").innerHTML = snapshot.weather[0].description;
        document.getElementById("weather_readout_content").innerHTML = "Temperature: " + (snapshot.main.temp - 273.15) + "&deg;C<br/>";
        document.getElementById("weather_readout_content").innerHTML += "Pressure: " + snapshot.main.pressure + " hPa<br/>";
        document.getElementById("weather_readout_content").innerHTML += "Humidity: " + snapshot.main.humidity + "&percnt;<br/>";
        document.getElementById("weather_readout_content").innerHTML += "Wind speed: " + snapshot.wind.speed + "m/sec<br/>";
        document.getElementById("weather_readout_content").innerHTML += "Wind direction: " + snapshot.wind.deg + "&deg;<br/>";
    }
    else
    {
        document.getElementById("weather_readout_title").innerHTML = "Data not present for this interval";
        document.getElementById("weather_readout_description").innerHTML = "";
        document.getElementById("weather_readout_content").innerHTML = "";
    }
    dragElement(document.getElementById("weatherReadout"));

}


//NH: Draggable divs



function dragElement(elmnt) {
 //   console.log(elmnt);
  var pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
  if (document.getElementById(elmnt.id)) {
    /* if present, the header is where you move the DIV from:*/
    document.getElementById(elmnt.id).onmousedown = dragMouseDown;
  } else {
    /* otherwise, move the DIV from anywhere inside the DIV:*/
    elmnt.onmousedown = dragMouseDown;
  }

  function dragMouseDown(e) {
    e = e || window.event;
    
    // DW: check that this isn't something you'd want to interact with directly
    // TODO: make this more robust :)
    // if(e.target != this) { return; }
    if(e.target != this && (['INPUT', 'SELECT', 'BUTTON'].includes(e.target.tagName.toUpperCase()))) { return; }
    
    e.preventDefault();
    e.stopPropagation();
    // get the mouse cursor position at startup:
    pos3 = e.clientX;
    pos4 = e.clientY;
    document.onmouseup = closeDragElement;
    // call a function whenever the cursor moves:
    document.onmousemove = elementDrag;
  }

  function elementDrag(e) {
    e = e || window.event;
    e.preventDefault();
    e.stopPropagation();
    // calculate the new cursor position:
    pos1 = pos3 - e.clientX;
    pos2 = pos4 - e.clientY;
    pos3 = e.clientX;
    pos4 = e.clientY;
    // set the element's new position:
    elmnt.style.top = (elmnt.offsetTop - pos2) + "px";
    elmnt.style.left = (elmnt.offsetLeft - pos1) + "px";
  }

  function closeDragElement() {
    /* stop moving when mouse button is released:*/
    document.onmouseup = null;
    document.onmousemove = null;
  }
}
