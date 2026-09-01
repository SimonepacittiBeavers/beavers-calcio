# Beavers Calcio — Area Allenatori

Questa è una prima versione funzionante e responsive dell'applicazione.

## Cosa fa già

- Dashboard con le 4 categorie: Esordienti Misto, Esordienti Puro, Giovanissimi, Allievi
- Anagrafica giocatori
- Importazione dei tuoi Excel dal foglio `ANAGRAFICA GIOCATORE`
- Allenamenti e presenze: Presente / Assente / Giustificato + abbigliamento
- Partite: convocato / titolare / minuti
- Valutazioni trimestrali: Tecnica / Tattica / Fisica / Mentalità + dettagli
- Statistiche base
- Potenziale e note predisposti nella struttura dati
- Export di backup JSON
- Interfaccia mobile
- Modalità DEMO locale, senza server

## Per renderla davvero multi-allenatore online

La strada semplice e gratuita è Firebase:

1. Crea un progetto su Firebase.
2. Abilita Authentication > Google.
3. Crea Firestore Database.
4. Inserisci la configurazione Web Firebase in `firebase-config.js`.
5. Pubblica la cartella con Firebase Hosting oppure GitHub Pages.
6. Applica `firestore.rules`.

### Importante sulla privacy

Gli Excel contengono dati personali dei minori e contatti dei genitori. Non pubblicare gli Excel su GitHub o dentro il sito.
Per una versione reale, le regole Firestore vanno rese più restrittive e gli allenatori devono vedere solo le proprie squadre. Prima del lancio pubblico conviene anche definire informativa/privacy e gestione degli accessi.

## Struttura dati consigliata per la versione completa

- `players`
- `teams`
- `trainings`
- `trainingRecords`
- `matches`
- `matchRecords`
- `evaluations`
- `potentials`
- `notes`
- `users`

Il prossimo passaggio tecnico dovrebbe essere:
1. autenticazione reale;
2. ruoli `admin` / `allenatore`;
3. assegnazione allenatore -> squadra;
4. salvataggio Firestore di tutti i record;
5. importazione completa di tutti i fogli Excel;
6. export Excel vero e proprio;
7. dashboard statistiche più avanzata.

## Avvio rapido locale

Non aprire semplicemente `index.html` con doppio click se il browser blocca i moduli.
Con Python:

`python -m http.server 8000`

poi apri `http://localhost:8000`.

## Import Excel aggiornato
Il pulsante **Importa Excel** accetta anche più file contemporaneamente.
I 4 file delle rose vengono riconosciuti dal nome:
- Allievi
- Giovanissimi
- Esordienti Pura
- Esordienti Misto

L'importazione salva in Firestore i campi normalizzati usati dal sito e conserva anche la riga originale dell'Excel nel campo `excelData`. Nella lista giocatori vengono mostrati solo **Nome** e **Ruolo**.
