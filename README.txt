# Achat & Suivi — Refactor (zéro serveur)

## Structure
- index.html (appli principale)
- login.html (page d’authentification — point d’entrée)
- Data/
  - donnees.xlsx
  - donnees_ot.xlsx
  - donnees_oi.xlsx
- src/
  - style.css
  - script.js
  - excel.js
- img/
  - logo.png

## Points clés
- Chemins mis à jour vers `src/*.js` et `src/style.css`.
- Chargements par défaut des fichiers Excel depuis `Data/`.
- Page *login* -> *index* OK, et *index* redirige vers *login* si pas de session.
- Indicateur de chargement global pendant l’import/lecture Excel.
- Responsive via Bootstrap, styles conservés.

Ouvrez `login.html` pour commencer.
