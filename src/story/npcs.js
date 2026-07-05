import { makeCivilian, setAnim, updateRig } from '../characters.js';

function fallbackRng() {
  return {
    f: Math.random,
    range(a, b) { return a + (b - a) * this.f(); },
    pick(arr) { return arr[Math.floor(this.f() * arr.length) % arr.length]; },
  };
}

export function spawnStoryNpc(level, npc, site) {
  if (!level || !npc || !site) return null;
  const anchor = Array.isArray(site) ? site[0] : site;
  if (!anchor) return null;
  const rng = level.rng || fallbackRng();
  const rig = makeCivilian(npc.kind || 'kid', rng);
  const angle = rng.range ? rng.range(0, Math.PI * 2) : Math.random() * Math.PI * 2;
  const radius = Math.min(Math.max((anchor.r || 8) * 0.45, 2.5), 7);
  const x = anchor.x + Math.cos(angle) * radius;
  const z = anchor.z + Math.sin(angle) * radius;
  const y = level.world && level.world.groundH ? level.world.groundH(x, z) : 0;
  rig.group.position.set(x, y, z);
  rig.group.rotation.y = angle + Math.PI;
  setAnim(rig, 'cheer');
  if (level.scene) level.scene.add(rig.group);
  return { id: npc.id, npc, site: anchor, rig, x, z };
}

export function updateStoryNpc(npcState, dt) {
  if (!npcState || !npcState.rig) return;
  setAnim(npcState.rig, 'cheer');
  updateRig(npcState.rig, dt);
}

export function removeStoryNpc(level, npcState) {
  if (!level || !npcState || !npcState.rig || !npcState.rig.group) return;
  if (level.scene) level.scene.remove(npcState.rig.group);
}
