# Déploiement Cloud (modèles)

## Objectif
Exposer le backend (et la PWA servie par le backend) derrière Nginx en HTTPS.

## Fichiers fournis
- `deploy/docker-compose.prod.yml`
- `deploy/nginx.conf`
- `deploy/backend.Dockerfile`

## Étapes
1. Copier `deploy/` sur votre serveur.
2. Créer un `.env` (DB, JWT, etc.).
3. Lancer:
```bash
docker compose -f deploy/docker-compose.prod.yml up -d --build
```
4. Activer HTTPS (Let's Encrypt) via votre méthode (certbot, proxy manager, etc.).

## Notes
- En PWA iOS, **HTTPS est requis**.
- En mode Cloud, l'app desktop ne démarre pas de backend local.


## Démarrage rapide (prod)

1. Copier `deploy/.env.prod.example` en `deploy/.env.prod` et renseigner les valeurs.
2. Depuis `btp-connect-latest/deploy` :

```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build
```

3. Vérifier la santé :
- `https://<PUBLIC_HOST>/health`

> Notes:
> - Nginx est configuré comme reverse-proxy. Pour TLS, utilisez un certificat (Let’s Encrypt) ou placez ce stack derrière un reverse-proxy TLS existant.
