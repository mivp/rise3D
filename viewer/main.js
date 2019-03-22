var g_sceneData = null;
var g_defaultElement = null;
var g_weatherData = null;
var g_timeIntervals = null; //= new Cesium.TimeIntervalCollection();
// testing
var housedata = null;
var weatherCtr = null;

// object references
var viewer = null;

var weather_icon_names = {
    "Clouds" : "cloud",
    "Thunderstorm" : "flash_on",
    "Rain" : "opacity"
};

function loadSceneData()
{
    var req = new XMLHttpRequest();
    req.addEventListener("load", function(evt){
        processSceneData(req.responseText);
    });
    req.open("GET", "scene_data.json");
    req.send();
}

function processSceneData(data)
{
    console.log("processSceneData()");
    console.log(data);
    var g_sceneData = JSON.parse(data);

    for(var element of g_sceneData.elements)
    {
        if(element.type == "tileset")
        {
            // for elements already in 3D tiles format
            loadElement(element);
        }
        else if(element.type == "geometry")
        {
            // for geometry defined manually
            loadShapeData(element);
        }
        else if(element.type == "file")
        {
            loadFile(element);
        }
        else
        {
            // unknown element type
            console.log("Scene element with unknown type " + element.type + " encounted, skipping..");
        }
    }
}

function loadElement(description)
{

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
    });    
}

function loadFile(element)
{
    if(element.datatype == "kml")
    {
        loadKML(element);
    }
    else if(element.datatype == "mesh")
    {
        loadMesh(element);
    }
}

function loadKML(description)
{
    console.log("Loading KML/KMZ: " + new URL(description.path, window.location.href));
    viewer.dataSources.add(Cesium.KmlDataSource.load(description.path),
        {
            camera: viewer.scene.camera,
            canvas: viewer.scene.canvas
        });
}

function loadMesh(description)
{
    console.log("Loading mesh file: " + new URL(description.path, window.location.href));

    var deg = toLatLon(description.position.x, description.position.y, 50, 'M');

    var origin = Cesium.Cartesian3.fromDegrees(deg.longitude, deg.latitude);
    var modelMatrix = Cesium.Transforms.eastNorthUpToFixedFrame(origin);
    // Cesium.Matrix4.multiplyByTranslation(modelMatrix, new Cesium.Cartesian3(0, 1, 0), modelMatrix);
    Cesium.Matrix4.multiply(modelMatrix, Cesium.Matrix4.fromTranslationQuaternionRotationScale(
        new Cesium.Cartesian3(-8, 41, 18),
        new Cesium.Quaternion.fromHeadingPitchRoll(new Cesium.HeadingPitchRoll(0, (Math.PI / 2), 0)),
        new Cesium.Cartesian3(1, 1, 1)),
        modelMatrix);

    viewer.scene.primitives.add(Cesium.Model.fromGltf({
        url: description.path,
        scale: 0.05,
        show: true,
        modelMatrix: modelMatrix,
        allowPicking: true
    }));
}

function loadShapeData(element)
{
    var req = new XMLHttpRequest();
    req.addEventListener("load", function(evt){
        processShapeData(req.responseText);
    });
    req.open("GET", element.path);
    req.send();
}

function processShapeData(description)
{
    var geometry = JSON.parse(description);
    var housedata = geometry;   // todo: remove this, probably won't be needed

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
                    "data" : snapshot
                }
            );

            console.log("Adding interval");
            intervals.push(interval);
        }

        g_timeIntervals = new Cesium.TimeIntervalCollection(intervals);

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
    loadSceneData();

    // load demo weather data
    await loadWeatherData();

    viewer.clockViewModel.clock.currentTime = g_timeIntervals.get(0).start;

    // look at the default element, this should be selected as part of the loading process
    viewer.zoomTo(g_defaultElement);
    
    ah_sandpit(viewer);
    
    var testRegion = viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(119.4955547, -5.0835328),
        ellipse: {
            semiMinorAxis : 100000.0,
            semiMajorAxis : 100000.0,
            material : Cesium.Color.BLUE.withAlpha(0.1)
        }
    });

    var placeholderEntity = new Cesium.Entity();
    
    viewer.screenSpaceEventHandler.setInputAction(function onLeftClick(movement){
        var feature = viewer.scene.pick(movement.position);
        if(!Cesium.defined(feature) || feature.id == undefined)
        {
            viewer.selectedEntity = null;
            return;
        }
        placeholderEntity.name = "Building: " + feature.id;
        viewer.selectedEntity = placeholderEntity;
        placeholderEntity.description = 'Number of occupants: TBA<br/>';

    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    viewer.clockViewModel.clock.onTick.addEventListener(function(clock)
    {
        updateFromTime(clock);
    });
}

function updateFromTime(clock)
{
    let cTime = clock.currentTime;
    let interval = g_timeIntervals.findDataForIntervalContainingDate(cTime);

    if(interval != undefined)
    {
        // console.log("Found data at interval: " + interval.dt);
        // TODO: maybe don't keep destroying the contents of the title div :)
        document.getElementById("weather_readout_title").innerHTML = interval.weather[0].main;
        var iconname = weather_icon_names[interval.weather[0].main];
        if(iconname != undefined)
        {
            var e = document.createElement("I");
            e.textContent = iconname;
            e.className = 'material-icons';
            document.getElementById("weather_readout_title").appendChild(e);
        }

        document.getElementById("weather_readout_description").innerHTML = interval.weather[0].description;
        document.getElementById("weather_readout_content").innerHTML = "Temperature: " + (interval.main.temp - 273.15) + "&deg;C<br/>";
        document.getElementById("weather_readout_content").innerHTML += "Pressure: " + interval.main.pressure + " hPa<br/>";
        document.getElementById("weather_readout_content").innerHTML += "Humidity: " + interval.main.humidity + "&percnt;<br/>";
        document.getElementById("weather_readout_content").innerHTML += "Wind speed: " + interval.wind.speed + "m/sec<br/>";
        document.getElementById("weather_readout_content").innerHTML += "Wind direction: " + interval.wind.deg + "&deg;<br/>";
    }
    else
    {
        document.getElementById("weather_readout_title").innerHTML = "Data not present for this interval";
        document.getElementById("weather_readout_description").innerHTML = "";
        document.getElementById("weather_readout_content").innerHTML = "";
    }
}