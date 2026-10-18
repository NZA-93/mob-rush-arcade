/** Timed shot choices. They expire. Nothing here is a permanent upgrade. */
export const BUFFS = {
  spread: { name: "SPREAD", line: "3-WAY", dur: 12, color: "#7ecbff" },
  rapid: { name: "RAPID", line: "FAST", dur: 12, color: "#ffe08a" },
  pierce: { name: "PIERCE", line: "BIG", dur: 12, color: "#d7ecff" },
  homing: { name: "HOMING", line: "SEEK", dur: 12, color: "#c9a6ff" },
  shield: { name: "SHIELD", line: "WALL", dur: 8, color: "#8af0ff" },
  bomb: { name: "BOMBS", line: "BOOM", dur: 12, color: "#ffb15a" },
  freeze: { name: "FREEZE", line: "STOP", dur: 4.2, color: "#b9f6ff" },
};

export function buffPool(level) {
  const pool = ["spread", "rapid", "pierce"];
  if (level >= 2) pool.push("shield", "homing");
  if (level >= 3) pool.push("bomb", "freeze");
  return pool;
}
