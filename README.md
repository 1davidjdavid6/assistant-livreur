# Assistant Livreur — Besançon

Outil d'aide à la décision pour un livreur à vélo (VAE) toutes plateformes
(Uber Eats, Deliveroo, Stuart, Delicity, Just Eat) à Besançon.

## État actuel

`index.html` est un outil autonome, sans backend : il évalue une ou plusieurs
courses en même temps (prix, distance, période, météo, fatigue, mode retour
domicile) et affiche une recommandation ACCEPTER / PEUT-ÊTRE / REFUSER.
Aucune donnée n'est sauvegardée — tout est recalculé en direct dans le
navigateur.

## Feuille de route (en cours)

- [ ] Authentification (Supabase Auth)
- [ ] Sauvegarde des courses en base (PostgreSQL / Supabase)
- [ ] Politiques RLS (livreur ↔ admin)
- [ ] Chronomètre 15 min (délai avant annulation d'une commande)
- [ ] Tableau de bord admin en temps réel (Supabase Realtime)
- [ ] Déploiement continu via Netlify

## Stack prévue

- Frontend : HTML5 / CSS3 / JavaScript (aucun framework)
- Backend : Supabase (PostgreSQL, Auth, Realtime)
- Hébergement : Netlify
