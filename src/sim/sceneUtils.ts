import * as THREE from 'three';

function makeAxisLabel(text: string, color: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 64; canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = color;
  ctx.font = 'bold 48px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 32, 32);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthTest: false }));
  sprite.scale.set(1.2, 1.2, 1);
  return sprite;
}

export function makeAxes(scene: THREE.Scene): THREE.Object3D[] {
  const origin = new THREE.Vector3(0, 0, 0);
  const len = 15;
  const head = 0.6;
  const headW = 0.3;
  const axes = [
    { dir: new THREE.Vector3(1, 0, 0), color: 0xff4444, label: 'X', hex: '#ff4444' },
    { dir: new THREE.Vector3(0, 1, 0), color: 0x44ff44, label: 'Y', hex: '#44ff44' },
    { dir: new THREE.Vector3(0, 0, 1), color: 0x4488ff, label: 'Z', hex: '#4488ff' },
  ];
  const objects: THREE.Object3D[] = [];
  for (const { dir, color, label, hex } of axes) {
    const arrow = new THREE.ArrowHelper(dir, origin, len, color, head, headW);
    scene.add(arrow);
    const sprite = makeAxisLabel(label, hex);
    sprite.position.copy(dir.clone().multiplyScalar(len + 0.8));
    scene.add(sprite);
    objects.push(arrow, sprite);
  }
  return objects;
}
