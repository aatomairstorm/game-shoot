// Hero data used by the menu, the HUD and gameplay.
export const HEROES = {
  web: {
    id: 'web',
    name: 'WEB-SLINGER',
    tagline: 'Agilità aracnide, ragnatele e rampino',
    color: '#ff3b47',
    hp: 110,
    stats: { Velocità: 5, Potenza: 2, Mobilità: 5 },
    powers: [
      { key: 'Click SX', name: 'Spara-Ragnatele', desc: 'Ragnatele rapide verso il mirino: danneggiano e rallentano. Due colpi immobilizzano il bandito in una rete.' },
      { key: 'Click DX / E', name: 'Rampino', desc: 'Aggancia muri e tetti entro 45 m e ti trascina in aria verso l’alto.' },
      { key: 'Spazio ×2', name: 'Salto Doppio', desc: 'Agilità elevata: doppio salto e corsa con Shift.' },
    ],
    hints: [['WASD', 'Muovi'], ['Spazio', 'Salto ×2'], ['Shift', 'Corsa'], ['Click SX', 'Ragnatela'], ['Click DX / E', 'Rampino'], ['F', 'Libera'], ['Esc', 'Pausa']],
  },
  thor: {
    id: 'thor',
    name: 'THUNDER WARRIOR',
    tagline: 'Martello da guerra e potere del tuono',
    color: '#4fb4ff',
    hp: 150,
    stats: { Velocità: 3, Potenza: 5, Mobilità: 3 },
    powers: [
      { key: 'Click SX', name: 'Lancio del Martello', desc: 'Scaglia il martello verso il mirino. Colpo alla testa = danno critico ×2. Resta conficcato dove colpisce.' },
      { key: 'Click DX / E', name: 'Richiamo', desc: 'Il martello torna in mano travolgendo i nemici sulla traiettoria con fulmini e respingimento.' },
      { key: 'Spazio', name: 'Super-Salto', desc: 'Balzo ad alta quota con onda d’urto all’atterraggio.' },
    ],
    hints: [['WASD', 'Muovi'], ['Spazio', 'Super-Salto'], ['Shift', 'Corsa'], ['Click SX', 'Lancia'], ['Click DX / E', 'Richiama'], ['F', 'Libera'], ['Esc', 'Pausa']],
  },
  iron: {
    id: 'iron',
    name: 'IRON STRIKER',
    tagline: 'Armatura volante e repulsori laser',
    color: '#ffb43a',
    hp: 125,
    stats: { Velocità: 4, Potenza: 4, Mobilità: 5 },
    powers: [
      { key: 'Shift / Spazio ×2', name: 'Volo Libero', desc: 'Attiva/disattiva il volo. In volo: WASD, Spazio sale, C o Ctrl scende.' },
      { key: 'Click SX', name: 'Raggi Repulsori', desc: 'Laser ad alta precisione dai palmi con esplosione all’impatto.' },
      { key: 'Click DX / E', name: 'Scarica Posteriore', desc: 'Proiettili “organici” dal posteriore: nube maleodorante che stordisce e danneggia.' },
    ],
    hints: [['WASD', 'Muovi'], ['Shift', 'Volo on/off'], ['Spazio', 'Sali'], ['C', 'Scendi'], ['Click SX', 'Laser'], ['Click DX / E', 'Scarica'], ['F', 'Libera'], ['Esc', 'Pausa']],
  },
};
