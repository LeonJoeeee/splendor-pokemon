// 占位数据集（竖切片用）：~28 张卡，覆盖 5 色与若干进化链 + 1 张 extraBonus。
// Phase 3 会按 cardDatasetSpec 生成完整 90 卡（40/30/20）替换本文件。
import type { Card, CardAbility, EnergyCost, EnergyType, Stage, Tier } from '../engine/types';

interface CardSpec {
  species: string;
  name: string;
  nameZh: string;
  tier: Tier;
  cost: EnergyCost;
  bonus: EnergyType;
  prestige: number;
  weakness: EnergyType;
  family: string;
  stage: Stage;
  ability?: CardAbility;
}

function build(s: CardSpec): Card {
  return {
    id: `${s.species.toLowerCase()}-t${s.tier}`,
    speciesId: s.species,
    name: s.name,
    nameZh: s.nameZh,
    tier: s.tier,
    cost: s.cost,
    bonus: s.bonus,
    prestige: s.prestige,
    weakness: s.weakness,
    family: s.family,
    stage: s.stage,
    evolvesFromFamily: s.stage > 1 ? s.family : undefined,
    evolutionDiscount: s.stage > 1 ? 1 : 0,
    ability: s.ability,
  };
}

const SPECS: CardSpec[] = [
  // ---- 草 ----
  { species: 'BULBASAUR', name: 'Bulbasaur', nameZh: '妙蛙种子', tier: 1, cost: { water: 1, fire: 1, psychic: 1 }, bonus: 'grass', prestige: 0, weakness: 'fire', family: 'bulbasaur-line', stage: 1 },
  { species: 'IVYSAUR', name: 'Ivysaur', nameZh: '妙蛙草', tier: 2, cost: { grass: 2, water: 2, psychic: 2 }, bonus: 'grass', prestige: 1, weakness: 'fire', family: 'bulbasaur-line', stage: 2 },
  { species: 'VENUSAUR', name: 'Venusaur', nameZh: '妙蛙花', tier: 3, cost: { grass: 3, water: 3, psychic: 3, fire: 1 }, bonus: 'grass', prestige: 4, weakness: 'fire', family: 'bulbasaur-line', stage: 3 },
  { species: 'CATERPIE', name: 'Caterpie', nameZh: '绿毛虫', tier: 1, cost: { fire: 2 }, bonus: 'grass', prestige: 0, weakness: 'fire', family: 'caterpie-line', stage: 1 },
  { species: 'METAPOD', name: 'Metapod', nameZh: '铁甲蛹', tier: 2, cost: { grass: 3, fire: 2 }, bonus: 'grass', prestige: 1, weakness: 'fire', family: 'caterpie-line', stage: 2 },
  { species: 'ODDISH', name: 'Oddish', nameZh: '走路草', tier: 1, cost: { electric: 2, water: 1 }, bonus: 'grass', prestige: 0, weakness: 'fire', family: 'oddish-line', stage: 1 },

  // ---- 火 ----
  { species: 'CHARMANDER', name: 'Charmander', nameZh: '小火龙', tier: 1, cost: { grass: 1, psychic: 1 }, bonus: 'fire', prestige: 0, weakness: 'water', family: 'charmander-line', stage: 1 },
  { species: 'CHARMELEON', name: 'Charmeleon', nameZh: '火恐龙', tier: 2, cost: { fire: 3, grass: 2, psychic: 2 }, bonus: 'fire', prestige: 1, weakness: 'water', family: 'charmander-line', stage: 2 },
  { species: 'CHARIZARD', name: 'Charizard', nameZh: '喷火龙', tier: 3, cost: { fire: 4, grass: 3, psychic: 3 }, bonus: 'fire', prestige: 4, weakness: 'water', family: 'charmander-line', stage: 3, ability: { type: 'extraBonus', energy: 'fire', amount: 1 } },
  { species: 'GROWLITHE', name: 'Growlithe', nameZh: '卡蒂狗', tier: 1, cost: { water: 2 }, bonus: 'fire', prestige: 0, weakness: 'water', family: 'growlithe-line', stage: 1 },
  { species: 'ARCANINE', name: 'Arcanine', nameZh: '风速狗', tier: 2, cost: { fire: 3, water: 2, grass: 1 }, bonus: 'fire', prestige: 2, weakness: 'water', family: 'growlithe-line', stage: 2 },
  { species: 'VULPIX', name: 'Vulpix', nameZh: '六尾', tier: 1, cost: { psychic: 2, water: 1 }, bonus: 'fire', prestige: 0, weakness: 'water', family: 'vulpix-line', stage: 1 },

  // ---- 水 ----
  { species: 'SQUIRTLE', name: 'Squirtle', nameZh: '杰尼龟', tier: 1, cost: { fire: 1, electric: 1 }, bonus: 'water', prestige: 0, weakness: 'grass', family: 'squirtle-line', stage: 1 },
  { species: 'WARTORTLE', name: 'Wartortle', nameZh: '卡咪龟', tier: 2, cost: { water: 3, fire: 2, electric: 1 }, bonus: 'water', prestige: 1, weakness: 'grass', family: 'squirtle-line', stage: 2 },
  { species: 'BLASTOISE', name: 'Blastoise', nameZh: '水箭龟', tier: 3, cost: { water: 3, fire: 3, electric: 3 }, bonus: 'water', prestige: 4, weakness: 'grass', family: 'squirtle-line', stage: 3 },
  { species: 'MAGIKARP', name: 'Magikarp', nameZh: '鲤鱼王', tier: 1, cost: { electric: 2 }, bonus: 'water', prestige: 0, weakness: 'grass', family: 'magikarp-line', stage: 1 },
  { species: 'GYARADOS', name: 'Gyarados', nameZh: '暴鲤龙', tier: 2, cost: { water: 4, electric: 2 }, bonus: 'water', prestige: 2, weakness: 'grass', family: 'magikarp-line', stage: 2 },
  { species: 'PSYDUCK', name: 'Psyduck', nameZh: '可达鸭', tier: 1, cost: { grass: 1, psychic: 2 }, bonus: 'water', prestige: 0, weakness: 'grass', family: 'psyduck-line', stage: 1 },

  // ---- 电 ----
  { species: 'PICHU', name: 'Pichu', nameZh: '皮丘', tier: 1, cost: { grass: 1, water: 1 }, bonus: 'electric', prestige: 0, weakness: 'grass', family: 'pichu-line', stage: 1 },
  { species: 'PIKACHU', name: 'Pikachu', nameZh: '皮卡丘', tier: 2, cost: { electric: 2, water: 2, fire: 1 }, bonus: 'electric', prestige: 1, weakness: 'grass', family: 'pichu-line', stage: 2 },
  { species: 'RAICHU', name: 'Raichu', nameZh: '雷丘', tier: 3, cost: { electric: 3, water: 3, fire: 3 }, bonus: 'electric', prestige: 4, weakness: 'grass', family: 'pichu-line', stage: 3 },
  { species: 'MAGNEMITE', name: 'Magnemite', nameZh: '小磁怪', tier: 1, cost: { psychic: 2 }, bonus: 'electric', prestige: 0, weakness: 'grass', family: 'magnemite-line', stage: 1 },
  { species: 'VOLTORB', name: 'Voltorb', nameZh: '霹雳电球', tier: 1, cost: { fire: 2, grass: 1 }, bonus: 'electric', prestige: 0, weakness: 'grass', family: 'voltorb-line', stage: 1 },

  // ---- 超能力 ----
  { species: 'ABRA', name: 'Abra', nameZh: '凯西', tier: 1, cost: { fire: 1, electric: 1 }, bonus: 'psychic', prestige: 0, weakness: 'electric', family: 'abra-line', stage: 1 },
  { species: 'KADABRA', name: 'Kadabra', nameZh: '勇基拉', tier: 2, cost: { psychic: 3, fire: 2 }, bonus: 'psychic', prestige: 1, weakness: 'electric', family: 'abra-line', stage: 2 },
  { species: 'ALAKAZAM', name: 'Alakazam', nameZh: '胡地', tier: 3, cost: { psychic: 3, fire: 3, electric: 3 }, bonus: 'psychic', prestige: 4, weakness: 'electric', family: 'abra-line', stage: 3 },
  { species: 'DROWZEE', name: 'Drowzee', nameZh: '催眠貘', tier: 1, cost: { electric: 2, grass: 1 }, bonus: 'psychic', prestige: 0, weakness: 'electric', family: 'drowzee-line', stage: 1 },
  { species: 'MEWTWO', name: 'Mewtwo', nameZh: '超梦', tier: 3, cost: { psychic: 4, fire: 3, electric: 3 }, bonus: 'psychic', prestige: 5, weakness: 'psychic', family: 'mewtwo-line', stage: 1 },
];

export const CARDS: Card[] = SPECS.map(build);
