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
| **Lucia** | Canto Incantatore: incanta 0,7 s poi fa esplodere la testa (critico sui Boss) | Vortice d'Onda (anche Spazio), 2 slanci + discesa lenta | Corsa con Shift |
| **Ben 10** | Attacco della forma attiva | Potere della forma attiva | **1/2/3** o **Q**: Palla Rotante, XLR8, Feedback |
| **Fia Rood** | Lance di luce dorata a ricerca | Cura Divina (+75 HP, rigenera ostaggi vicini) | Doppio Spazio: il drago la solleva (tieni Spazio) |

Forme di Ben 10:
- **Palla Rotante** — tieni Click SX per rotolare e travolgere i nemici; Spazio fino a 3 salti.
- **XLR8** — Click SX scatto invulnerabile con scia di plasma che stordisce; corre sui muri spingendo contro di essi; Click DX/E Mossa Finale Rapida a catena.
- **Feedback** — combo elettrica ravvicinata; Click DX/E esplosione ad area con l'energia accumulata (anche assorbendo danni); Spazio tenuto o doppio tap per il supersalto caricato.

**Missione:** libera i 2 ostaggi (Zona A magazzino, Zona B torre) tenendo premuto **F** per 1,5 s. Ogni ostaggio è sorvegliato da un Boss (Corazzato e Comandante) con barra della vita in alto: resistono allo stordimento e attaccano con raffiche pesanti e onde d'urto.

**Mappa:** distretto industriale ~290×290 m con passerelle sopraelevate tra i tetti, barricate, barriere laser intermittenti, 10 torrette automatiche distruttibili e 16 barili esplosivi rossi.

## Prestazioni

- Qualità Grafica **Bassa / Media / Alta** dal menu principale o di pausa (salvata nel browser): risoluzione interna, ombre, densità particelle e distanza visiva.
- Contatore FPS in alto a destra.
- Solo 2 luci in scena (emisferica + sole): bagliori ed esplosioni usano particelle additive.
- Geometrie statiche della mappa unite per materiale; parti rigide di banditi, torrette e barili unite con colori per vertice; griglia spaziale per le collisioni.

## Struttura

- `index.html`, `css/style.css`: pagina, HUD e menu
- `js/main.js`: ciclo di gioco, telecamera, mira, qualità grafica, flusso partita
- `js/world.js`: mappa, edifici, passerelle, trappole, posizioni di torrette e barili
- `js/collision.js`: collisioni AABB con griglia, rampe, raycast
- `js/player.js`: controller del giocatore e poteri dei primi 3 eroi
- `js/kits.js`: poteri di Lucia, Ben 10 e Fia Rood
- `js/enemies.js`: banditi, Boss, torrette, barili esplosivi, proiettili
- `js/models.js`, `js/hostages.js`, `js/effects.js`, `js/audio.js`, `js/hud.js`, `js/input.js`, `js/heroes.js`, `js/projectiles.js`
