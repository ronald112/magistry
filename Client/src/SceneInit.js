import * as THREE from 'three';

function SceneInit(scene) {
    scene.add(new THREE.AmbientLight(0xf0f0f0));
    const light = new THREE.SpotLight(0xfffff1, 1.5);
    light.position.set(0, 1500, 200);
    light.lookAt(new THREE.Vector3(0, 0, 0));
    light.castShadow = true;
    // light.shadow.camera.near = 200;
    // light.shadow.camera.far = 2000;
    // light.shadow.bias = - 0.000222;
    // light.shadow.mapSize.width = 1024;
    // light.shadow.mapSize.height = 1024;
    scene.add(light);
}

export {SceneInit}