# Plan emails transactionnels XNT Servers

Ce document prépare l'intégration future d'un provider email comme Resend ou SMTP. Aucun provider n'est intégré à cette étape.

## Principes

- Envoyer les emails depuis le serveur uniquement.
- Ne jamais exposer les clés Resend/SMTP côté client.
- Garder les envois idempotents pour les événements Stripe et provisioning.
- Stocker les erreurs d'envoi dans les logs serveur, puis dans `activity_logs`/`audit_logs` si nécessaire.

## Événements

### Facture payée

- Déclencheur futur : webhook Stripe `invoice.paid`.
- Destinataire : utilisateur propriétaire de l'order.
- Contenu : montant, facture, plan, période de service, lien billing.
- Pièces/liens : hosted invoice URL et PDF Stripe si disponibles.

### Serveur prêt

- Déclencheur futur : fin de `provisionPaidOrder`.
- Destinataire : utilisateur propriétaire du serveur.
- Contenu : nom serveur, jeu/plan, adresse publique, port, lien dashboard/manage.
- Sécurité : ne jamais inclure d'IP privée. Réutiliser la même logique de filtrage que `getServerDetail`.

### Échec provisioning

- Déclencheur futur : `provisionPaidOrder` retourne une erreur.
- Destinataire : utilisateur + admin opérationnel.
- Contenu utilisateur : message clair, lien support prérempli.
- Contenu admin : order id, server_order id, erreur Pterodactyl, lien admin retry.

### Ticket répondu

- Déclencheur futur : réponse staff dans `ticket_messages`.
- Destinataire : propriétaire du ticket.
- Contenu : sujet, extrait de la réponse, lien support.

### Renouvellement échoué

- Déclencheur futur : webhook Stripe `invoice.payment_failed`.
- Destinataire : utilisateur propriétaire de l'abonnement.
- Contenu : montant, plan, date limite, lien Stripe/Billing.
- Effet applicatif : ne pas suspendre immédiatement sans politique de grace period.

### Abonnement suspendu

- Déclencheur futur : tâche serveur ou webhook Stripe après grace period.
- Destinataire : utilisateur propriétaire.
- Contenu : serveur concerné, raison, lien billing/support.

## Intégration recommandée

1. Créer `src/lib/email.server.ts` server-only.
2. Ajouter des variables serveur uniquement :
   - `EMAIL_PROVIDER=resend|smtp`
   - `RESEND_API_KEY`
   - `EMAIL_FROM`
   - ou configuration SMTP.
3. Créer des templates text/html minimalistes et sobres.
4. Ajouter une fonction idempotente par événement métier.
5. Ajouter une table dédiée plus tard si suivi d'envoi nécessaire : `email_events`.

## Tests

- Mode sandbox avec email de test.
- Vérifier qu'aucune clé email n'apparaît dans le bundle client.
- Tester les webhooks Stripe resend sans double email.
- Tester provisioning retry sans double email serveur prêt.
