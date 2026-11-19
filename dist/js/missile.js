import {Vector3, Quaternion} from '../vendor/three.module.js';

export const missileSpeed = 52;
const offset = new Vector3(), desired = new Vector3(), heading = new Vector3();
const relativeVelocity = new Vector3(), turn = new Quaternion(), rotationToTarget = new Quaternion();

// Estimate where a target maintaining its current velocity can be intercepted.
export function missileCourse(from, target, targetVelocity, out){
  offset.subVectors(target, from);
  const speedMargin = missileSpeed**2 - targetVelocity.lengthSq();
  const along = offset.dot(targetVelocity);
  const discriminant = along**2 + speedMargin*offset.lengthSq();
  const divisor = discriminant > 0 ? Math.sqrt(discriminant)-along : 0;
  const leadTime = divisor > .001 ? Math.min(3, offset.lengthSq()/divisor) : 0;
  return out.copy(offset).addScaledVector(targetVelocity, leadTime).normalize();
}

// Lead moving targets, but limit the rate of turn. Commit to a straight pass
// when the current course would intercept within a second.
export function guideMissile(position, velocity, target, targetVelocity, dt){
  missileCourse(position, target, targetVelocity, desired);
  heading.copy(velocity).normalize();
  rotationToTarget.setFromUnitVectors(heading, desired);
  turn.identity().rotateTowards(rotationToTarget, 1.8*dt);
  velocity.copy(heading.applyQuaternion(turn)).multiplyScalar(missileSpeed);
  offset.subVectors(target, position);
  relativeVelocity.subVectors(velocity, targetVelocity);
  const time = offset.dot(relativeVelocity) / Math.max(.001, relativeVelocity.lengthSq());
  return time >= 0 && time <= 1.15 && offset.addScaledVector(relativeVelocity, -time).lengthSq() < 2.6**2;
}

// Check the whole relative path of the shot and player during this frame.
export function hitDuringFrame(from, to, playerFrom, playerTo, radius){
  offset.subVectors(from, playerFrom);
  relativeVelocity.subVectors(to, playerTo).sub(offset);
  const t = Math.max(0, Math.min(1, -offset.dot(relativeVelocity)/Math.max(.000001, relativeVelocity.lengthSq())));
  return offset.addScaledVector(relativeVelocity, t).lengthSq() <= radius*radius;
}
