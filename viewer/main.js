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

// also testing, some storage containers that will be improved later..
var g_kmlSources = new Map();

var g_intervalGroups = new Map();   // used for storing intervals as data is loaded in, this will all be merged into g_timeIntervals

// object references
var viewer = null;

var weather_icon_names = {
    "Clouds" : "cloud",
    "Thunderstorm" : "flash_on",
    "Rain" : "opacity"
};

async function loadSceneData()
{
    var response = await fetch("scene_data.json");
    var text = await response.text();

    await processSceneData(text);
}

function processSceneData(data)
{
    return new Promise(async (resolve, reject) => {
        console.log("processSceneData()");
        console.log(data);
        var g_sceneData = JSON.parse(data);

        for(var element of g_sceneData.elements)
        {
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
                await loadShapeData(element);
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
                "pointSize" : "5.0"
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
                    font : '16pt Segoe UI',
                    style : Cesium.LabelStyle.FILL_AND_OUTLINE,
                    outlineWidth : 0.5,
                    verticalOrigin : Cesium.VerticalOrigin.BOTTOM,
                    pixelOffset : new Cesium.Cartesian2(0, -9)
                }
            });

            // grp.add(element);
            
            // addDisplayGroup(description.name + "(" + description.datatype + ")", grp);
            addDisplayGroup(description.name + "(" + description.datatype + ")", element);
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
        grp.label = description.path;

        selector.add(grp);

        for(var e of dataSource.entities.values)
        {
            console.log("KML entity:");
            console.log(e.name);

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
        }
        resolve();
    });
}

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
        viewer.scene.primitives.add(model);

        // addDisplayGroup(description.name + "(" + description.datatype + ")", grp);
        addDisplayGroup(description.name + "(" + description.datatype + ")", model);

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

    var dataFilenames = filenames.toUpperCase().split('\n');

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

        // create the marker to represent the data collection location
        var markerPosition = Cesium.Cartesian3.fromDegrees(data[i][2], data[i][1]);
    
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
                outlineWidth : 0.5,
                verticalOrigin : Cesium.VerticalOrigin.BOTTOM,
                pixelOffset : new Cesium.Cartesian2(0, -9)
            },
            id : pointID
        });

        grp.add(marker);

        // load the time series for this data location
        var foundDataFile = false;
        var targetFile = "";

        console.log("pointID for this marker: " + pointID);

        for(let filename of dataFilenames)
        {
            var candidateString = filename.slice(-12, -7).split(' ').join('');

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
            await processHygrodataSeries(text, pointID, marker, sourceElement);
        }
    }

    addDisplayGroup(sourceElement.name + "(" + sourceElement.datatype + ")", grp);
}

// FIXME: currently storing a reference to each updatable marker here, really should have a dedicated structure and search feature for this
async function processHygrodataSeries(rawdata, pointID, marker, sourceElement)
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
                    // "data" : { "temperature" : data[i][7], "humidity" : data[i][8] }
                    "data" : //[
                        { 
                            "element" : marker,
                            "type" : "hygro",
                            "owner" : data[i][5] + " " + data[i][0],
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

        g_intervalGroups.set(sourceElement.name, new Cesium.TimeIntervalCollection(intervals));

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
        var testColour = new Cesium.Color(testColours[testColourIndex][0], testColours[testColourIndex][1],testColours[testColourIndex][2], 0.5);

        var highlight = viewer.scene.primitives.add(new Cesium.ClassificationPrimitive({
            geometryInstances: new Cesium.GeometryInstance({
                geometry: shapeGeom,
                id: shape.id,
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
                id: 'volume' + i.toString()
            }),
            show: true,
            classificationType : Cesium.ClassificationType.CESIUM_3D_TILE
        }));
    }

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

function ah_sandpit(viewer)
{
    viewer.dataSources.add(new Cesium.CzmlDataSource().load('../assets/simple.czml'))
    
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
    
    // merge all timesteps together
    g_timeIntervals = new Cesium.TimeIntervalCollection();

    for(var collection of g_intervalGroups.values())
    {
        for(let i = 0; i < collection.length; i++)
        {
            g_timeIntervals.addInterval(collection.get(i));
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
    
    viewer.screenSpaceEventHandler.setInputAction(function onLeftClick(movement){
        var feature = viewer.scene.pick(movement.position);
        if(!Cesium.defined(feature) || feature.id == undefined)
        {
            viewer.selectedEntity = null;
            selectedPoint = null;
            return;
        }

        if(feature.id._id != undefined)
        {
            var collection = g_hygroData.get(feature.id._id).intervals;

            if(collection != undefined)
            {
                console.log("Found data location " + feature.id._id + ", checking time " + g_ctime);
            }

            var interval = collection.findDataForIntervalContainingDate(g_ctime);

            if(interval != undefined)
            {
                console.log("Current time temp: " + interval.temperature + " | humidity: " + interval.humidity);
            }            
        }

        placeholderEntity.name = "Building: " + feature.id._id;
        viewer.selectedEntity = placeholderEntity;
        placeholderEntity.description = 'Number of occupants: TBA<br/>';

    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    viewer.clockViewModel.clock.onTick.addEventListener(function(clock)
    {
        updateFromTime(clock);
    });
}

function addDisplayGroup(name, group)
{
    g_displayGroups.set(name, group);

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
    nameCell.onclick = function() {
        viewer.zoomTo(group);
    }
}

function updateFromTime(clock)
{
    let cTime = clock.currentTime;
    g_ctime = Cesium.JulianDate.clone(cTime);
    let interval = g_timeIntervals.findDataForIntervalContainingDate(cTime);
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
                console.log("Found hygrochron data for interval");
                interval.element.label.text = interval.owner + " (" + interval.value.temperature + "&deg;, humid: " + interval.value.humidity + ")";
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
}
