@echo off
if %1!==! goto usage

rem input files might need to be reprojected to epsg:4376 by PDAL first 
rem output files as 3d tiles will go to .\cesium\output_points_3dtile\
rem these files need to be copied into .\Assets\points\[asset name]\ inside of the Cesium-based viewer directory 

rd /s /q scan_result
rd /s /q points_build
del /q cesium\output_points_3dtile\*.*
@echo on
entwine scan -c scan.json -i %1
entwine build -c build.json
entwine convert -i points_build -o cesium\output_points_3dtile --truncate
copy /y cesium\output_points_3dtile\*.* X:\RISE_PROJECT_DIRECTORY_CHANGE_THIS\Assets\points\points_test_01\
:usage
echo usage:
echo.
echo process inputfile.las
