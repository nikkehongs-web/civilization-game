export const PlayerStates = Object.freeze({
  IDLE: 'IDLE',
  MOVING: 'MOVING',
  ATTACK: 'ATTACK',
  HIT: 'HIT',
  DEAD: 'DEAD'
});

export const MonsterStates = Object.freeze({
  IDLE: 'IDLE',
  CHASE: 'CHASE',
  ATTACK: 'ATTACK',
  RETURN: 'RETURN',
  DEAD: 'DEAD'
});

export const CombatRules = Object.freeze({
  playerAttackInterval: 0.72,
  playerAttackRange: 2.25,
  playerMoveSpeed: 4.0,
  playerRespawnMs: 3200,

  playerDamage(baseAttack) {
    return Math.max(1, Math.round(baseAttack));
  },

  monsterDamage(baseAttack, level) {
    return Math.max(1, Math.round(baseAttack + level * 0.9));
  },

  expForMonster(level, config) {
    return Math.max(
      1,
      Math.round((config.expBase ?? 20) + level * (config.expPerLevel ?? 8))
    );
  },

  nextExp(current) {
    return Math.max(current + 1, Math.floor(current * 1.28));
  }
});
