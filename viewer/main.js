function startup()
{
    var viewer = new Cesium.Viewer('cesiumContainer', {
        imageryProvider: Cesium.createTileMapServiceImageryProvider({
            url: 'Assets/imagery/NaturalEarthII'
        }),
        // terrainProvider: Cesium.createWorldTerrain({ // Cesium ion account is expected for this
        //     requestVertexNormals : true
        // }),
        baseLayerPicker: false,
        geocoder: false
    });

    var tileset_points_test = viewer.scene.primitives.add(new Cesium.Cesium3DTileset({
        url: 'Assets/points/output_test_01/tileset.json'
    }));

    tileset_points_test.style = new Cesium.Cesium3DTileStyle({
        pointSize : 4.0
    });

    // enable this if Century data is present
    // var tileset_century = viewer.scene.primitives.add(new Cesium.Cesium3DTileset({
    //     url: 'Assets/points/century/tileset.json'
    // }));

    tileset_century.allTilesLoaded.addEventListener(function() {
        var centuryMarkerPosition = tileset_century.boundingSphere.center;

        var centuryMarker = viewer.entities.add({
            name : 'test marker2',
            position : centuryMarkerPosition,
            point : {
                pixelSize : 8,
                color : Cesium.Color.RED,
                outlineColor : Cesium.Color.WHITE,
                outlineWidth : 2
            },
            label : {
                text : 'Century',
                font : '16pt Segoe UI',
                style : Cesium.LabelStyle.FILL_AND_OUTLINE,
                outlineWidth : 0.5,
                verticalOrigin : Cesium.VerticalOrigin.BOTTOM,
                pixelOffset : new Cesium.Cartesian2(0, -9)
            }
        });
    });

    tileset_century.style = new Cesium.Cesium3DTileStyle({
        pointSize : 4.0
    });

    // viewer.zoomTo(tileset_points_test);
    viewer.zoomTo(tileset_century);

    var testRegion = viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(119.4955547, -5.0835328),
        ellipse: {
            semiMinorAxis : 100000.0,
            semiMajorAxis : 100000.0,
            material : Cesium.Color.BLUE.withAlpha(0.1)
        }
    });

    var i = 0;

    for(var shape of housedata.shapes)
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

        console.log(degArr);

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

        var highlight = viewer.scene.primitives.add(new Cesium.ClassificationPrimitive({
            geometryInstances: new Cesium.GeometryInstance({
                geometry: shapeGeom,
                // geometry : new Cesium.EllipsoidGeometry({
                //     radii : new Cesium.Cartesian3(20.0, 20.0, 20.0)
                // }),
                // modelMatrix : Cesium.Transforms.eastNorthUpToFixedFrame(origin),
                // modelMatrix : modelMatrix,
                attributes : {
                    color: Cesium.ColorGeometryInstanceAttribute.fromColor(new Cesium.Color(1.0, 0.0, 1.0, 0.5)),
                    show: new Cesium.ShowGeometryInstanceAttribute(true)
                },
                id: 'volume' + i.toString()
            }),
            show: true,
            classificationType : Cesium.ClassificationType.CESIUM_3D_TILE
        }));
    }

    var testHouseVolume = viewer.entities.add({
        polylineVolume : {
            positions : Cesium.Cartesian3.fromDegreesArray([
                119.4976785,
                -5.0812537,
                119.4976359,
                -5.0812718,
                119.497645,
                -5.0813094,
                119.4976624,
                -5.0813555,
                119.4977114,
                -5.0813363,
                119.4976785,
                -5.0812537
            ]),
            material: Cesium.Color.RED,
            shape: [new Cesium.Cartesian2(-5, -5),
                    new Cesium.Cartesian2(5, -5),
                    new Cesium.Cartesian2(5, 5),
                    new Cesium.Cartesian2(-5, 5)]
        }
    });

    var testMarker = viewer.entities.add({
        name : 'test marker',
        position : Cesium.Cartesian3.fromDegrees(119.4974811, -5.0815495),
        point : {
            pixelSize : 8,
            color : Cesium.Color.RED,
            outlineColor : Cesium.Color.WHITE,
            outlineWidth : 2
        },
        label : {
            text : 'Sample site',
            font : '16pt Segoe UI',
            style : Cesium.LabelStyle.FILL_AND_OUTLINE,
            outlineWidth : 0.5,
            verticalOrigin : Cesium.VerticalOrigin.BOTTOM,
            pixelOffset : new Cesium.Cartesian2(0, -9)
        }
    });

    var placeholderEntity = new Cesium.Entity();

    viewer.screenSpaceEventHandler.setInputAction(function onLeftClick(movement){
        var feature = viewer.scene.pick(movement.position);
        if(!Cesium.defined(feature))
        {
            viewer.selectedEntity = null;
            return;
        }
        placeholderEntity.name = "A dwelling";
        viewer.selectedEntity = placeholderEntity;
        placeholderEntity.description = 'Number of occupants: TBA<br/>';

    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
}