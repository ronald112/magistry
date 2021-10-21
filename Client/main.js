
import * as THREE from './node_modules/three';
import { OrbitControls } from './node_modules/three/examples/jsm/controls/OrbitControls';
import { TransformControls } from './node_modules/three/examples/jsm/controls/TransformControls.js';
import Stats from './node_modules/three/examples/jsm/libs/stats.module.js'; // fps, ms, mb, custom panels
import { Constants } from './inc/ProjectConstants.js';
import { GUI } from './node_modules/three/examples/jsm/libs/dat.gui.module.js';
import { SceneInit } from './src/SceneInit.js';
import axios from './node_modules/axios';
import * as mathjs from 'mathjs';

//#region global obj's
const BASE_URL = 'http://localhost:3000'

const X_AXIS = new THREE.Vector3(1, 0, 0);
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);

const params = {
    uniform: true,
    smooth: 10,
    arrayEdit: false,
    PPatchHX: AddPlusPatchX,
    MPatchHX: AddMinusPatchX,
    PPatchHZ: AddPlusPatchZ,
    MPatchHZ: AddMinusPatchZ,

    FUpPatchX: AddForwardUpPatchXY,
    FDownPatchX: AddForwardDownPatchXY,
    BUpPatchX: AddBackwardUpPatchXY,
    BDownPatchX: AddBackwardDownPatchXY,
    FUpPatchZ: AddForwardUpPatchZY,
    FDownPatchZ: AddForwardDownPatchZY,
    BUpPatchZ: AddBackwardUpPatchZY,
    BDownPatchZ: AddBackwardDownPatchZY,

    updateSurface: computePointsForBicubicSurface,
    HelpersVisability : changeHelperrsVisability,
    save: onSave,
    load: onLoad
};

let _camera, _scene, _renderer, _step, _container, _stats;

const _raycaster = new THREE.Raycaster();
const _pointer = new THREE.Vector2();
const _onUpPosition = new THREE.Vector2();
const _onDownPosition = new THREE.Vector2();

const _geometry = new THREE.BoxGeometry(8, 8, 8);
let _dotTransformControl;
let _twoDimensionalArray = [
                            [undefined]
                            ];

let _smoothDivision = params.smooth;
let _surfaceMeshes = [], _lineWires = [];
let _surfacePoints = [[]];

let _isAllVisible = true;
var _newPointDistanceFromAnchor = 80;
let _map = THREE.Texture;
let _patchGroupe = new THREE.Object3D();
let _sceneObjects = new THREE.Group();
_sceneObjects.add(_patchGroupe);
//#endregion

init();
update();

//#region INIT
function init() {
    _container = document.getElementById('container');

    // scene creating
    _scene = new THREE.Scene();
    _scene.background = new THREE.Color(0xf0f0f0);

    // camera creating
    _camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 1, 10000);
    _camera.position.set(0, 250, 1000);
    _scene.add(_camera);

    // scene init
    SceneInit(_scene);

    // floor creating
    const planeGeometry = new THREE.PlaneGeometry(2000, 2000);
    planeGeometry.rotateX(- Math.PI / 2);
    const planeMaterial = new THREE.ShadowMaterial({ opacity: 0.2 });
    const plane = new THREE.Mesh(planeGeometry, planeMaterial);
    plane.position.y = - 200;
    plane.receiveShadow = true;
    _scene.add(plane);

    // grid helper for surface creating
    const helper = new THREE.GridHelper(2000, 100);
    helper.position.y = - 199;
    helper.material.opacity = 0.25;
    helper.material.transparent = true;
    _scene.add(helper);

    // renderer setup
    _renderer = new THREE.WebGLRenderer({ antialias: true });
    _renderer.setPixelRatio(window.devicePixelRatio);
    _renderer.setSize(window.innerWidth, window.innerHeight);
    _renderer.shadowMap.enabled = true;
    _container.appendChild(_renderer.domElement);

    // statistics setup
    _stats = new Stats();
    _container.appendChild(_stats.dom);

    _scene.add(_sceneObjects);

    // Gui setup
    const gui = new GUI();
    initGui(gui, params);

    // Controls
    const controls = new OrbitControls(_camera, _renderer.domElement);
    controls.damping = 0.2;
    controls.addEventListener('change', render);


    // dot transform
    _dotTransformControl = new TransformControls(_camera, _renderer.domElement);
    _dotTransformControl.addEventListener('change', render);
    _dotTransformControl.addEventListener('dragging-changed', function (event) {
        if (!event.value)
            computePointsForBicubicSurface();
        controls.enabled = !event.value;
    });

    _scene.add(_dotTransformControl);

    _dotTransformControl.addEventListener('objectChange', function () {
    });
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('pointermove', onPointerMove);

    document.addEventListener('keydown', logKey);
    
    setupTexture();
}

function prepareScene() {
    createStartPatch();

    // addPatchByZ(1);
    // addPatchByZ(1);
    // addPatchByX(-1);
    computePointsForBicubicSurface();
}

function setupTexture() {
    let loader = new THREE.TextureLoader();
    loader.crossOrigin = "";
    loader.load( "https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/uv_grid_opengl.jpg",
        function(texture) { 
            _map = texture;
            // _map.wrapS = _map.wrapT = THREE.RepeatWrapping;
            // _map.anisotropy = 16;
            prepareScene();
        },
        function() {},
        function(error) {console.log(error)}
    );
    
}
//#endregion

//#region SURFACE BUILDING
function setupRenderBicubicSurface() {
    let material = new THREE.MeshLambertMaterial({
        side: THREE.DoubleSide,
        color: 0xb5a372,
        // map: = _map
    });

    let materialLine = new THREE.LineBasicMaterial({
        color: 0xb5a372,
    });

    _surfacePoints.forEach(points => {
        
    
        let geometry = new THREE.BufferGeometry();
        const indices = [];
        indices.length = 0;
    
        for (let i = 0; i < _smoothDivision; i++) {
            for (let j = 0; j < _smoothDivision; j++) {
            const a = i * (_smoothDivision + 1) + (j + 1);
            const b = i * (_smoothDivision + 1) + j;
            const c = (i + 1) * (_smoothDivision + 1) + j;
            const d = (i + 1) * (_smoothDivision + 1) + (j + 1);
    
            // generate two faces (triangles) per iteration
    
            indices.push(a, b, d); // face one
            indices.push(b, c, d); // face two
            }
        }
    
        geometry.setIndex(indices);
        geometry.setAttribute(
            "position",
            new THREE.Float32BufferAttribute(points, 3).onUpload(disposeArray)
        );
        geometry.computeVertexNormals();

        if (params.uniform === true) {
            let surfaceWire = new THREE.WireframeGeometry(geometry);
            surfaceWire = new THREE.LineSegments(surfaceWire, materialLine);
            _lineWires.push(surfaceWire);
            _scene.add(surfaceWire);
        } else {
            let surfaceMesh = new THREE.Mesh(geometry, material);
            _surfaceMeshes.push(surfaceMesh);
            _scene.add(surfaceMesh);
        }
    });
}

function disposeArray() {
    this.array = null;
}

function computePointOnSurface(uVal, vVal, i, j) {
    let p1 = _twoDimensionalArray[i][j].position.toArray();
    let p2 = _twoDimensionalArray[i][j + 1].position.toArray();
    let p3 = _twoDimensionalArray[i + 1][j].position.toArray();
    let p4 = _twoDimensionalArray[i + 1][j + 1].position.toArray();

    let p1u = mathjs.subtract(_twoDimensionalArray[i + 1][j].position.toArray(),
                            _twoDimensionalArray[i - 1][j].position.toArray()
    );
    let p2u = mathjs.subtract(
        _twoDimensionalArray[i + 1][j + 1].position.toArray(),
        _twoDimensionalArray[i - 1][j + 1].position.toArray()
                            );
    let p3u = mathjs.subtract(_twoDimensionalArray[i + 2][j].position.toArray(),
                            _twoDimensionalArray[i][j].position.toArray());
    let p4u = mathjs.subtract(_twoDimensionalArray[i + 2][j + 1].position.toArray(),
                            _twoDimensionalArray[i][j + 1].position.toArray());

    p1u = mathjs.multiply(p1u, 0.5);
    p2u = mathjs.multiply(p2u, 0.5);
    p3u = mathjs.multiply(p3u, 0.5);
    p4u = mathjs.multiply(p4u, 0.5);

    let p1v = mathjs.subtract(
        _twoDimensionalArray[i][j + 1].position.toArray(),
        _twoDimensionalArray[i][j - 1].position.toArray()
                            );
    let p2v = mathjs.subtract(_twoDimensionalArray[i][j + 2].position.toArray(),
                            _twoDimensionalArray[i][j].position.toArray());
    let p3v = mathjs.subtract(
        _twoDimensionalArray[i + 1][j + 1].position.toArray(),
        _twoDimensionalArray[i + 1][j - 1].position.toArray()
                            );
    let p4v = mathjs.subtract(_twoDimensionalArray[i + 1][j + 2].position.toArray(),
                            _twoDimensionalArray[i + 1][j].position.toArray());

    p1v = mathjs.multiply(p1v, 0.5);
    p2v = mathjs.multiply(p2v, 0.5);
    p3v = mathjs.multiply(p3v, 0.5);
    p4v = mathjs.multiply(p4v, 0.5);

    let p1uv = new Array(0,
                        0,
                        0);

    let p2uv = new Array(0,
                        0,
                        0);

    let p3uv = new Array(0,
                        0,
                        0);

    let p4uv = new Array(0,
                        0,
                        0);

    let mFu = new Array(
                        2.0 * Math.pow(uVal, 3) - 3 * Math.pow(uVal, 2) + 1.0,
                        -2.0 * Math.pow(uVal, 3) + 3.0 * Math.pow(uVal, 2),
                        Math.pow(uVal, 3) - 2.0 * Math.pow(uVal, 2) + uVal,
                        Math.pow(uVal, 3) - Math.pow(uVal, 2));

    let mFv = new Array(
                        2.0 * Math.pow(vVal, 3) - 3 * Math.pow(vVal, 2) + 1.0,
                        -2.0 * Math.pow(vVal, 3) + 3.0 * Math.pow(vVal, 2),
                        Math.pow(vVal, 3) - 2.0 * Math.pow(vVal, 2) + vVal,
                        Math.pow(vVal, 3) - Math.pow(vVal, 2));

    let mBx = mathjs.matrix([
                            [p1[0], p2[0], p1v[0], p2v[0]],
                            [p3[0], p4[0], p3v[0], p4v[0]],
                            [p1u[0], p2u[0], p1uv[0], p2uv[0]],
                            [p3u[0], p4u[0], p3uv[0], p4uv[0]],
                            ]);

    let mBy = mathjs.matrix([
                            [p1[1], p2[1], p1v[1], p2v[1]],
                            [p3[1], p4[1], p3v[1], p4v[1]],
                            [p1u[1], p2u[1], p1uv[1], p2uv[1]],
                            [p3u[1], p4u[1], p3uv[1], p4uv[1]],
                            ]);

    let mBz = mathjs.matrix([
                            [p1[2], p2[2], p1v[2], p2v[2]],
                            [p3[2], p4[2], p3v[2], p4v[2]],
                            [p1u[2], p2u[2], p1uv[2], p2uv[2]],
                            [p3u[2], p4u[2], p3uv[2], p4uv[2]],
                            ]);

    let resX = mathjs.multiply(mathjs.multiply(mBx, mFv), mFu);
    let resY = mathjs.multiply(mathjs.multiply(mBy, mFv), mFu);
    let resZ = mathjs.multiply(mathjs.multiply(mBz, mFv), mFu);

    return {
        xVal: resX,
        yVal: resY,
        zVal: resZ
    };
}

function cleanSceneFromSurfaces() {
    _surfaceMeshes.forEach(mesh => {
        _scene.remove(mesh);
    });
    _lineWires.forEach(lineWire => {
        _scene.remove(lineWire);
    });
    _surfacePoints.length = 0;
    _surfaceMeshes.length = 0;
    _lineWires.length = 0;
}

function computePointsForBicubicSurface() {
    cleanSceneFromSurfaces();
    let u, v;
    _step = 1.0 / _smoothDivision;

    for (let ji = 1; ji < _twoDimensionalArray.length - 2; ji++) {
        for (let ij = 1; ij < _twoDimensionalArray[0].length - 2; ij++) {
            _surfacePoints.push([]);
            for (let j = 0; j <= _smoothDivision; ++j) {
                v = j * _step;

                for (let i = 0; i <= _smoothDivision; ++i) {
                  u = i * _step;
                    let pt = computePointOnSurface(u, v, ji, ij);
                    _surfacePoints[_surfacePoints.length - 1].push(pt.xVal, pt.yVal, pt.zVal);
                }
            }
        }
    }
    setupRenderBicubicSurface();
}
//#endregion

//#region WORK WITH PATCHES
function addPoint(position, color) {
    var obj;
    if (position) {
        obj = getSurfaceHelperObjects(position, color);
        // dotGroupe.add(obj);
    } else {
        obj = getSurfaceHelperObjects(null, color);
        // dotGroupe.add(obj);
    }
    return obj;
}

function addPointRelativeToOtherPoint(root, axis, direction, distance, color) {
    var newPosition = new THREE.Vector3(root.x, root.y, root.z);

    switch (axis) {
        case X_AXIS:
            newPosition.x = newPosition.x + (distance * direction);
            break;
        case Y_AXIS:
            newPosition.y = newPosition.y + (distance * direction);
            break;
        case Z_AXIS:
            newPosition.z = newPosition.z + (distance * direction);
            break;
    }
    return addPoint(newPosition, color);
}

function addIndependentPointToScene(root, axis, direction, distance, color = Math.random() * 0xffffff) {
    let mesh = addPointRelativeToOtherPoint(root, axis, direction, distance, color);
    _patchGroupe.add(mesh);
    return mesh;
}


//#region X patch
function updateUndefinedPointByXAxis(newPatchDirection, pointPlaceDirection) {
    let pos = new THREE.Vector3();
    let row, column, rowAnchor;

    if (pointPlaceDirection === -1) {
        row = 0;
        rowAnchor = row + 1;
    }
    else {
        row = _twoDimensionalArray.length - 1;
        rowAnchor = row - 1;
    }

    if (newPatchDirection === 1) {
        column = _twoDimensionalArray[0].length - 1;
    }
    else {
        column = 0;
    }

    if (_twoDimensionalArray[row][column] != undefined)
        return;
    pos.x = _twoDimensionalArray[rowAnchor][column].position.x;
    pos.y = _twoDimensionalArray[rowAnchor][column].position.y;
    pos.z = _twoDimensionalArray[rowAnchor][column].position.z;

    _twoDimensionalArray[row][column] = addIndependentPointToScene(
        pos,
        Z_AXIS,
        pointPlaceDirection,
        _newPointDistanceFromAnchor);
}

function addPatchByX(newPatchDirection) {
    console.log(_twoDimensionalArray);
    let column = 0;
    let lastColumn = _twoDimensionalArray[0].length - 1;

    if (newPatchDirection == 1) {
        column = lastColumn;
    }
    updateUndefinedPointByXAxis(newPatchDirection, -1);
    updateUndefinedPointByXAxis(newPatchDirection, 1);

    if (newPatchDirection == 1) {
        _twoDimensionalArray[0].push(undefined);
    }
    else {
        _twoDimensionalArray[0].unshift(undefined);
    }
    let i = 1;
    for (; i < _twoDimensionalArray.length - 1; i++) {
        let mesh = addIndependentPointToScene(
            _twoDimensionalArray[i][column].position,
            X_AXIS,
            newPatchDirection,
            _newPointDistanceFromAnchor);

        if (newPatchDirection == 1) {
            _twoDimensionalArray[i].push(mesh);
        }
        else {
            _twoDimensionalArray[i].unshift(mesh);
        }
    }
    if (newPatchDirection == 1) {
        _twoDimensionalArray[i].push(undefined);
    }
    else {
        _twoDimensionalArray[i].unshift(undefined);
    }
    computePointsForBicubicSurface();
}
//#endregion

//#region Z patch
function updateUndefinedPointByZAxis(newPatchDirection, pointPlaceDirection) {
    let pos = new THREE.Vector3();
    let row, column, columnAnchor;

    if (pointPlaceDirection === -1) {
        column = 0;
        columnAnchor = column + 1;
    }
    else {
        column = _twoDimensionalArray[0].length - 1;
        columnAnchor = column - 1;
    }

    if (newPatchDirection === 1) {
        row = _twoDimensionalArray.length - 1;
    }
    else {
        row = 0;
    }

    if (_twoDimensionalArray[row][column] != undefined)
        return;
    pos.x = _twoDimensionalArray[row][columnAnchor].position.x;
    pos.y = _twoDimensionalArray[row][columnAnchor].position.y;
    pos.z = _twoDimensionalArray[row][columnAnchor].position.z;

    _twoDimensionalArray[row][column] = addIndependentPointToScene(
        pos,
        X_AXIS,
        pointPlaceDirection,
        _newPointDistanceFromAnchor);
}

function addPatchByZ(newPatchDirection) {
    let dots = [];
    let column = 0;
    let lastColumn = _twoDimensionalArray.length - 1;

    if (newPatchDirection == 1) {
        column = lastColumn;
    }

    updateUndefinedPointByZAxis(newPatchDirection, -1);
    updateUndefinedPointByZAxis(newPatchDirection, 1);

    dots = new Array();
    dots.push(undefined);
    for (let i = 1; i < _twoDimensionalArray[0].length - 1; i++) {
        dots.push(addIndependentPointToScene(
            _twoDimensionalArray[column][i].position,
            Z_AXIS,
            1 * newPatchDirection,
            _newPointDistanceFromAnchor));
    }
    dots.push(undefined);
    if (newPatchDirection == 1) {
        _twoDimensionalArray.push(dots);
    }
    else {
        _twoDimensionalArray.unshift(dots);
    }
    computePointsForBicubicSurface();
}
//#endregion

//#region Y patch

// isDown 1 = Down; direction -1 = UP
function addPatchByZY(newPatchDirection, isDown) {
    let dots = [];
    let border = 0;

    if (newPatchDirection == 1) {
        border = _twoDimensionalArray.length - 1;
    }

    updateUndefinedPointByZAxis(newPatchDirection, -1);
    updateUndefinedPointByZAxis(newPatchDirection, 1);

    dots = new Array();
    dots.push(undefined);
    for (let i = 1; i < _twoDimensionalArray[0].length - 1; i++) {
        dots.push(addIndependentPointToScene(
            _twoDimensionalArray[border][i].position,
            Y_AXIS,
            isDown,
            _newPointDistanceFromAnchor));
    }
    dots.push(undefined);
    if (newPatchDirection == 1) {
        _twoDimensionalArray.push(dots);
    }
    else {
        _twoDimensionalArray.unshift(dots);
    }
}

// isDown 1 = Down; direction -1 = UP
function addPatchByXY(newPatchDirection, isDown) {
    let border = 0;

    if (newPatchDirection == 1) {
        border = _twoDimensionalArray[0].length - 1;
    }

    updateUndefinedPointByXAxis(newPatchDirection, -1);
    updateUndefinedPointByXAxis(newPatchDirection, 1);

    if (newPatchDirection == 1) {
        _twoDimensionalArray[0].push(undefined);
    }
    else {
        _twoDimensionalArray[0].unshift(undefined);
    }
    let i = 1;
    for (; i < _twoDimensionalArray.length - 1; i++) {

        let mesh = addIndependentPointToScene(
            _twoDimensionalArray[i][border].position,
            Y_AXIS,
            isDown,
            _newPointDistanceFromAnchor);

            if (newPatchDirection == 1) {
                _twoDimensionalArray[i].push(mesh);
            }
            else {
                _twoDimensionalArray[i].unshift(mesh);
            }
    }
    if (newPatchDirection == 1) {
        _twoDimensionalArray[i].push(undefined);
    }
    else {
        _twoDimensionalArray[i].unshift(undefined);
    }
}

function createStartPatch() {
    var obj = addPoint();
    _patchGroupe.add(obj);
    
    var tempPosition = new THREE.Vector3(obj.position.x, obj.position.y, obj.position.z);
    _twoDimensionalArray[0].push(addIndependentPointToScene(tempPosition, Z_AXIS, -1, _newPointDistanceFromAnchor));
    _twoDimensionalArray.push([addIndependentPointToScene(tempPosition, X_AXIS, -1, _newPointDistanceFromAnchor),
                                obj]);
    
    
    for (let i = 1; i < 5; i++) {
        switch (i) {
            case 1:
                tempPosition.x += _newPointDistanceFromAnchor;
                
                _twoDimensionalArray[1].push(addIndependentPointToScene(tempPosition));
                _twoDimensionalArray[1].push(addIndependentPointToScene(tempPosition, X_AXIS, 1, _newPointDistanceFromAnchor));
                _twoDimensionalArray[0].push(addIndependentPointToScene(tempPosition, Z_AXIS, -1, _newPointDistanceFromAnchor));
                _twoDimensionalArray[0].push(undefined);
                break;
            case 2:
                tempPosition.z += _newPointDistanceFromAnchor;
                tempPosition.x -= _newPointDistanceFromAnchor;

                _twoDimensionalArray.push([addIndependentPointToScene(tempPosition, X_AXIS, -1, _newPointDistanceFromAnchor),
                                            addIndependentPointToScene(tempPosition)]);
                _twoDimensionalArray.push([undefined, addIndependentPointToScene(tempPosition, Z_AXIS, 1, _newPointDistanceFromAnchor)]);
                break;

            case 3:
                tempPosition.x += _newPointDistanceFromAnchor;
                _twoDimensionalArray[2].push(addIndependentPointToScene(tempPosition));
                _twoDimensionalArray[2].push(addIndependentPointToScene(tempPosition, X_AXIS, 1, _newPointDistanceFromAnchor));
                _twoDimensionalArray[3].push(addIndependentPointToScene(tempPosition, Z_AXIS, 1, _newPointDistanceFromAnchor));
                _twoDimensionalArray[3].push(undefined);
                break;
            default:
                break;
        }
    }
}

function getSurfaceHelperObjects(position, color = Math.random() * 0xffffff) {
    const material = new THREE.MeshLambertMaterial({ color: color });
    const object = new THREE.Mesh(_geometry, material);

    if (position) {
        object.position.copy(position);
    } else {
        object.position.x = Math.random() * 500 -250;
        object.position.y = Math.random() * 300;
        object.position.z = Math.random() * 400 - 200;
    }

    object.castShadow = true;
    object.receiveShadow = true;
    return object;
}
//#endregion
//#endregion

//#region GUI DECLARING
var _tempMatrix = new THREE.Matrix4();
var _tempgroup = new THREE.Group();
_tempgroup.userData.selected = [];
_tempgroup.userData.prevParent = [];
_scene.add(_tempgroup);

function initGui(gui, params) {
    gui.add(params, 'uniform').onChange(function (value) { params.uniform = value });
    gui.add(params, 'smooth', 2, 50, 50).step(2).onChange(function (value) { onSmoothChange(value) });
    gui.add(params, 'arrayEdit').onChange(function (value) { onArrayEdit(value) });

    let h;
    let h1;
    let h2;
    let h3;

    h = gui.addFolder("Add patch");

    h1 = h.addFolder("X Axis")
    h1.add(params, 'MPatchHX');
    h1.add(params, 'PPatchHX');

    h1 = h.addFolder("Z Axis")
    h1.add(params, 'MPatchHZ');
    h1.add(params, 'PPatchHZ');

    h1 = h.addFolder("Y Axis")

    h2 = h1.addFolder("Z Axis");
    h3 = h2.addFolder("Forward");
    h3.add(params, 'FUpPatchZ');
    h3.add(params, 'FDownPatchZ');
    h3 = h2.addFolder("Backward");
    h3.add(params, 'BUpPatchZ');
    h3.add(params, 'BDownPatchZ');

    h2 = h1.addFolder("X Axis");
    h3 = h2.addFolder("Forward");
    h2.add(params, 'FUpPatchX');
    h2.add(params, 'FDownPatchX');
    h3 = h2.addFolder("Backward");
    h2.add(params, 'BUpPatchX');
    h2.add(params, 'BDownPatchX');

    gui.add(params, 'HelpersVisability');
    gui.add(params, 'updateSurface');
    gui.add(params, 'save');
    gui.add(params, 'load');
    gui.open();
}

//#endregion

//#region GUI IMPLEMENTATION
function AddForwardDownPatchZY() {
    addPatchByZY(-1, -1);
}

function AddForwardUpPatchZY() {
    addPatchByZY(-1, 1);
}

function AddBackwardDownPatchZY() {
    addPatchByZY(1, -1);
}

function AddBackwardUpPatchZY() {
    addPatchByZY(1, 1);
}

function AddForwardDownPatchXY() {
    addPatchByXY(1, -1);
}

function AddForwardUpPatchXY() {
    addPatchByXY(1, 1);
}

function AddBackwardDownPatchXY() {
    addPatchByXY(-1, -1);
}

function AddBackwardUpPatchXY() {
    addPatchByXY(-1, 1);
}

function AddPlusPatchX() {
    addPatchByX(1);
}

function AddMinusPatchX() {
    addPatchByX(-1);
}

function AddPlusPatchZ() {
    addPatchByZ(1);
}

function AddMinusPatchZ() {
    addPatchByZ(-1);
}

function onSmoothChange(value) {
    _smoothDivision = value;
}

function onArrayEdit(value) {
    if (value) {
        var intersectedObject;
        for (var i = _patchGroupe.children.length - 1; i >= 0; i--) {
            intersectedObject = _patchGroupe.children[i];
            intersectedObject.matrixWorldNeedsUpdate = true;
            _tempMatrix.copy(_tempgroup.matrixWorld).invert();
            var intersectedObject_matrix_new = intersectedObject.matrixWorld.premultiply(_tempMatrix);
            intersectedObject_matrix_new.decompose(intersectedObject.position, intersectedObject.quaternion, intersectedObject.scale);

            _tempgroup.userData.selected.push(intersectedObject);
            _tempgroup.userData.prevParent.push(intersectedObject.parent);
            _tempgroup.add(intersectedObject);
        }

        if (_tempgroup.userData.selected.length > 0) {
            _dotTransformControl.attach(_tempgroup);
        }
    } else {
        var intersectedObject;
        for (var i = _tempgroup.children.length - 1; i >= 0; i--) {

            intersectedObject = _tempgroup.userData.selected[i];

            intersectedObject.matrixWorldNeedsUpdate = true;
            _tempgroup.userData.prevParent[i].matrixWorldNeedsUpdate = true;
            _tempMatrix.copy(_tempgroup.userData.prevParent[i].matrixWorld).invert();
            var intersectedObject_matrix_old = intersectedObject.matrixWorld.premultiply(_tempMatrix);
            intersectedObject_matrix_old.decompose(intersectedObject.position, intersectedObject.quaternion, intersectedObject.scale);

            _tempgroup.userData.prevParent[i].add(intersectedObject);
            intersectedObject.matrixWorldNeedsUpdate = true;
        }
        _tempgroup.userData.selected = [];
        _tempgroup.userData.prevParent = []

        _dotTransformControl.detach();

    }
}
//#endregion

//#region UTILS
function changeHelperrsVisability() {
    _isAllVisible = !_isAllVisible;
    _patchGroupe.children.forEach(point => {
        point.visible = !point.visible;
    })
}

function logKey(e) {
    if (e.code === "Escape") {
        _dotTransformControl.detach();
    }
}
//#endregion

//#region SAVER
function SimpleDot(x, y, z, isMainPoint) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.mainPoint = isMainPoint;
}

function cleanScene() {
    cleanSceneFromSurfaces();

    _patchGroupe.children.forEach(mesh => {
        _scene.remove(mesh);
    });
    console.log(_patchGroupe);
    _patchGroupe.children.length = 0;
}

function onLoad() {
    let popupResult = confirm("Do you want to load?");
    if (!popupResult)
        return;
    console.log("onLoad");
    axios.get(`${BASE_URL}/diploma`).then(
        (res) => {
            console.log(res.data);

            let twoDimensionalArray = res.data.patches_list;
            if (twoDimensionalArray.length === 0)
                return;
            cleanScene();
            
            _twoDimensionalArray.length = 0;
            for (let i = 0; i < twoDimensionalArray.length; i++) {
                let dots_list = [];

                for (let j = 0; j < twoDimensionalArray[0].length; j++) {
                    const mesh = twoDimensionalArray[i][j];

                    if (mesh != undefined) {
                        let threePoint = addIndependentPointToScene(new THREE.Vector3(
                            mesh.x,
                            mesh.y,
                            mesh.z
                        ));
                        dots_list.push(threePoint);
                    } 
                    else {
                        dots_list.push(undefined);
                    }
                }
                _twoDimensionalArray.push(dots_list);
            };
            console.log(_twoDimensionalArray);
        }
    );
    computePointsForBicubicSurface();
}

function onSave() {
    let popupResult = confirm("Do you want to save?");
    if (!popupResult)
        return;
    console.log('onSave invoke');
    if (_twoDimensionalArray.length === 0)
        return;
    
    let patches_list = [];

    for (let i = 0; i < _twoDimensionalArray.length; i++) {
        let dots_list = [];

        for (let j = 0; j < _twoDimensionalArray[0].length; j++) {
            const mesh = _twoDimensionalArray[i][j];

            if (mesh != undefined) {
                let x = mesh.position.x;
                let y = mesh.position.y;
                let z = mesh.position.z;
                dots_list.push(new SimpleDot(x, y, z));
            } 
            else {
                dots_list.push(undefined);
            }
        }
        patches_list.push(dots_list);
    };
    console.log(patches_list);

    axios.post(`${BASE_URL}/diploma`, patches_list).then(
        (res) => {
            console.log(res.data);
        }
    )

}
//#endregion

//#region UPDATE
function update() {
    requestAnimationFrame(update);
    render();
    _stats.update();
    calculate();
}

function calculate() {
    let patches = _patchGroupe.children;
    patches.some(patch => {
        patch.children.some(point => {
            // if ()
        })
    })
}

function render() {
    _renderer.render(_scene, _camera);
}

function onPointerDown(event) {
    // onDownPosition.x = event.clientX;
    // onDownPosition.y = event.clientY;
}

function onPointerUp(event) {
    _onUpPosition.x = event.clientX;
    _onUpPosition.y = event.clientY;

    if (_onDownPosition.distanceTo(_onUpPosition) === 0) _dotTransformControl.detach();
}

function onPointerMove(event) {
    _pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    _pointer.y = - (event.clientY / window.innerHeight) * 2 + 1;

    _raycaster.setFromCamera(_pointer, _camera);

    if (_patchGroupe.children && !_dotTransformControl.dragging && _isAllVisible) {
        const intersects = _raycaster.intersectObjects(_patchGroupe.children);
    
        if (intersects.length > 0) {
            const point = intersects[0].object;
    
            if (!params.arrayEdit && point !== _dotTransformControl.object) {
                _dotTransformControl.attach(point);
                return true;
            }
        }
    }
}
//#endregion