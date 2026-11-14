# Hero Strike — Operazione Ostaggi

Sparatutto d'azione 3D in terza persona, giocabile nel browser. Three.js 0.187.0 (CDN jsDelivr via importmap) ed effetti sonori procedurali con Web Audio API: nessun asset esterno.

## Avvio

I moduli ES richiedono un server HTTP (non `file://`):

```bash
python3 -m http.server 8000
# poi apri http://localhost:8000
```

## Eroi

| Eroe | Click SX | Click DX / E | Movimento |
|---|---|---|---|
| **Web-Slinger** | Ragnatele (danno + rallentamento, 2 colpi immobilizzano) | Rampino entro 45 m verso muri e tetti | Salto doppio, corsa con Shift |
| **Thunder Warrior** | Lancio del martello (testa = critico ×2), resta conficcato | Richiamo: travolge i nemici sulla traiettoria | Super-salto (Spazio) con onda d'urto |
| **Iron Striker** | Raggi repulsori laser | Scarica posteriore: nube che stordisce | Volo con Shift o doppio Spazio; Spazio sale, C/Ctrl scende |

**Missione:** libera i 2 ostaggi (Zona A magazzino, Zona B torre) tenendo premuto **F** per 1,5 s. Esc mette in pausa.

> Nota: in finestra (non a schermo intero) il browser non permette di bloccare Ctrl+W; per scendere in volo è più sicuro usare **C**.

## Struttura

- `index.html`, `css/style.css`: pagina, HUD e menu
- `js/main.js`: ciclo di gioco, telecamera, mira, flusso partita
- `js/world.js`: mappa, edifici, zone, spawn dei banditi
- `js/collision.js`: collisioni AABB, rampe, raycast
- `js/player.js`: controller del giocatore e poteri dei 3 eroi
- `js/enemies.js`: IA dei banditi e proiettili traccianti
- `js/models.js`, `js/hostages.js`, `js/effects.js`, `js/audio.js`, `js/hud.js`, `js/input.js`, `js/heroes.js`, `js/projectiles.js`
