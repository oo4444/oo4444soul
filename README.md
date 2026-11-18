# L'Anneau Brisé — hommage 3D à Elden Ring 🗡️✨

Un jeu d'action 3D en vue troisième personne, dans le style d'Elden Ring :
ambiance sombre, endurance limitée, esquives avec frames d'invincibilité,
feux de camp, runes, et un boss à terrasser. **100 % procédural** — aucun
asset externe, tout (meshes, lumières, sons) est généré par le code.

## Lancer le jeu

Le jeu est une page web (Three.js chargé via CDN). Il faut servir les
fichiers avec un petit serveur local (obligatoire pour les modules ES) :

```bash
# au choix :
python3 -m http.server 8000
npx serve .
```

Puis ouvrir http://localhost:8000

## Contrôles

| Touche             | Action                          |
|--------------------|---------------------------------|
| `ZQSD` / `WASD`    | Se déplacer                     |
| Souris             | Caméra                          |
| Clic gauche        | Attaque (enchaînement possible) |
| `Maj`              | Courir (consomme l'endurance)   |
| `Espace`           | Esquive (frames d'invincibilité)|
| `Q` / Clic molette | Verrouiller une cible           |
| `F`                | Boire la fiole de grâce (×3)    |
| `E`                | Se reposer au feu de camp       |

## Mécaniques (pur style Souls)

- **Endurance** : courir, attaquer et esquiver la consomme ; elle se régénère après un court délai.
- **Esquive** : rouler donne des frames d'invincibilité — le bon timing traverse les coups.
- **Runes** : les ennemis vaincus en lâchent. À ta mort, elles sont lâchées sur place… retourne les chercher.
- **Feu de camp** : `E` pour restaurer la vie, la fiole… et faire renaître les ennemis.
- **Le boss** : la Sentinelle Déchue veille au nord, dans son cercle de piliers. Écrasement avec onde de choc, balances à 360°. Que la grâce te guide.

## Technique

- [Three.js](https://threejs.org/) (r160, modules ES via CDN)
- Aucune dépendance npm, aucun asset : géométrie, terrain (bruit de sommets),
  arbre-monde incandescent, lucioles, ondes de choc et effets sonores
  (WebAudio procédural) sont générés à l'exécution.

## Licence

MIT — hommage non affilié à FromSoftware.
