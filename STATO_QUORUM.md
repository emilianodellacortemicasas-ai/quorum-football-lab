# QUORUM · Football Lab: stato del lavoro

Questo file prevale sul `README.md` originale, dove i due sono in contrasto. Base di partenza: commit `e7e5494` del passaggio (147 file, hash verificati con `MANIFEST_SHA256.json`). Il progetto è completamente separato da qualsiasi altro progetto di Emiliano.

## Cosa è cambiato rispetto al passaggio (19 nov 2026)

### Identità
Gli header `oai-authenticated-*` di ChatGPT Sites non sono più considerati affidabili in produzione.

- Ogni API passa da `lib/identity.ts`.
- In produzione il server verifica il JWT di **Cloudflare Access**: firma RS256, audience, issuer, scadenza (`lib/access-jwt.ts`).
- `QUORUM_ALLOWED_EMAILS` è un secondo filtro, opzionale.
- Il mock locale funziona solo con `vite dev` su localhost.
- Senza la configurazione Access l'app resta chiusa a tutti (fail-closed).

### OpenAI
- La verifica ora esegue l'elenco dei modelli e una **richiesta Responses reale e minima**.
- Rileva anche la posizione di uscita del server.
- Mostra per ogni passaggio: HTTP, codice, tipo e request ID. Il testo grezzo del fornitore non viene mai esposto.
- La chiave viene salvata se OpenAI la riconosce almeno in un passaggio. Dopo una correzione dei permessi si usa «Ricontrolla», senza reincollarla.
- `List models: Read` non è più obbligatorio. Serve solo `Responses: Request`.

### Modello
Il default `gpt-6.2-sol` non risulta nel catalogo pubblico OpenAI a novembre 2026. Il nuovo default è `gpt-6.1-sol`, configurabile con `OPENAI_MODEL`. La diagnosi conferma quali modelli sono visibili al progetto.

### Ipotesi principale sul 403
OpenAI respinge con 403 (`unsupported_country_region_territory`) le richieste che escono da regioni non supportate. Con i Cloudflare Workers questo è un problema documentato. Il Worker ora viene eseguito in posizione fissa UE (`placement: targeted aws:eu-central-1`).

**L'ipotesi non è ancora provata.** La conferma arriverà dalla prima diagnosi sul server reale.

### Deploy autonomo
- `scripts/quorum-deploy.sh` è idempotente: D1, migrazioni, build, deploy, chiavi di cifratura generate una sola volta, segreti.
- `.github/workflows/deploy.yml` lo esegue da GitHub Actions con i secret del repository.

## Verifiche eseguite qui
- `npm run install:ci`, typecheck, build: OK.
- 28 test automatici passati: i 22 originali più 6 nuovi su JWT e diagnosi OpenAI.
- `wrangler deploy --dry-run` con la configurazione autonoma: OK.
- Build di produzione avviata in locale: pagine 200. Le API rifiutano gli header d'identità falsificati (401/403).

## Verificato in produzione (19 nov 2026, 03:15)
- URL: https://quorum-football-lab.emilianodc-myedu.workers.dev (Cloudflare Workers + D1 `quorum-football-lab-db`, Europa).
- Accesso: Cloudflare Access (team `twilight-frost-2e90`, Zero Trust Free), policy «Cloudflare account members», tutto il traffico; JWT verificato dal server.
- Deploy automatico a ogni push su `main` (GitHub Actions), 5 secret configurati.
- **Causa del blocco OpenAI dimostrata:** credito API esaurito (HTTP 429 `insufficient_quota`) + permesso `List models: Read` assente (HTTP 403), che la versione precedente rendeva bloccante. Regione: OK (IT/FRA). Dopo la ricarica: Responses HTTP 200 con `gpt-6.1-sol`.
- Spiegazione AI reale generata su scenario demo; puntata virtuale salvata in D1.

## Non ancora verificato
- API-Football, Sportmonks, The Odds API: account non ancora attivati.
- Il test `tests/integration.mjs` resta da adattare.
- Il modello statistico resta una baseline non calibrata. Nessun rendimento dimostrato.

## Secret del repository GitHub (Settings → Secrets → Actions)
| Nome | Contenuto |
|---|---|
| `CLOUDFLARE_API_TOKEN` | token API Cloudflare (Workers + D1 edit) |
| `CLOUDFLARE_ACCOUNT_ID` | ID account Cloudflare |
| `QUORUM_ADMIN_EMAIL` | email del proprietario |
| `QUORUM_ALLOWED_EMAILS` | email ammesse, separate da virgola |
| `CF_ACCESS_TEAM_DOMAIN` | `<team>.cloudflareaccess.com` |
| `CF_ACCESS_AUD` | Application Audience (AUD) tag dell'app Access |

Le chiavi dei fornitori dati e di OpenAI **non** vanno qui. Si inseriscono nella pagina `/collegamenti` dell'app, dove vengono cifrate nel browser.

## Aggiornamento 19 nov 2026, 03:50
- Perimetro (scelta di Emiliano, 19/11/2026): Serie A, Premier League, La Liga, Bundesliga, Ligue 1, Coppa Italia (Sportmonks Starter + 1 lega extra, 33 €/mese; trial fino al 3/12/2026). Niente Serie B. Coppe europee e nazionali fuori perimetro.
- API-Football rimosso dall'interfaccia (rischio blocchi/sospensione da IP condivisi Cloudflare); codice conservato.
- Accesso: aggiunto login con codice via email (One-time PIN) e policy «QUORUM utenti autorizzati» (solo emilianodc.myedu@gmail.com).
- Restyling «notte da stadio + tattico», nuovo logo (Q = cerchio di centrocampo), icone app, PWA installabile dietro Access (manifest con credenziali).
- Collegamenti verificati: OpenAI, Sportmonks (Free), The Odds API (Free).

## 19/11/2026 · Value scanner (v1)
- Cloudflare Workers Paid attivo (5 $/mese, approvato da Emiliano).
- Scansione automatica ogni giorno alle 06:40 (cron `40 5 * * *` UTC) + "Aggiorna ora" (solo admin, max 3/giorno, non entro 30 minuti dalla precedente).
- Flusso: calendario Sportmonks (prossimi 3 giorni) → quote The Odds API (h2h + totals, regione EU, 2 crediti per lega) → abbinamento squadre/orario → modello Poisson → consenso di mercato senza margine.
- Stima QUORUM = 35% modello + 65% mercato. Giocata proposta se: valore ≥ 3%, quota ≤ 4,50, ≥ 5 bookmaker, quota migliore entro il 6% della mediana, scarto modello/mercato ≤ max(6 punti, 25% del mercato). Puntata indicativa = ¼ Kelly, max 2%.
- Tutti gli esiti valutati sono salvati in `scanner_rows` (base per regolamento automatico e backtest). Esecuzioni in `scanner_runs`.
- Protezione crediti The Odds API: stop sotto 40 crediti residui (piano free 500/mese).

## 19/11/2026 · Pronostici + modello v2
- Nuova vista iniziale "Pronostici": per ogni partita segno, doppia chance, O/U 2,5, GG/NG, risultato più probabile, gol attesi, classifica, forma (ultime 5), indisponibili.
- Modello v2 (lib/model-v2.ts): rating attacco/difesa per campionato su ~13 mesi (4 finestre Sportmonks da 99 giorni), emivita 120 giorni, shrinkage 4 gol, fattore campo per lega, rho Dixon–Coles per lega. Coppa Italia usa i rating di Serie A. Stato salvato in D1 `model_state` e ricostruito a ogni scansione.
- Indisponibili: include `sidelined.player;sidelined.type` disponibile nel piano Starter. Mostrati, non ancora pesati nel calcolo.
- Prima verifica (42 partite): scarto medio dal mercato 4,8 punti su 1X2, 8,5 su Over/Under 2,5 con il modello che sottostima l'Over di 5,4 punti → da correggere col backtest.
- Le limitazioni dello scanner sono state tolte su richiesta: tutte le giocate con valore > 0 sono visibili, i controlli QUORUM sono un'etichetta. Unico freno: riserva crediti The Odds API (12).

## 19/11/2026 · Backtest e modello v2.1
- Backtest walk-forward (lib/backtest.ts, endpoint /api/backtest solo admin): rifit settimanale solo con dati precedenti, 461 partite negli ultimi 150 giorni, 1.942 risultati totali.
- Griglia testata: emivita 45–320 giorni, shrinkage 1–4, fattore gol 1,00–1,09. Scelti: emivita 250, shrinkage 3, fattore gol 1,07.
- v2.1: log-loss 1X2 0,978 (riferimento frequenze di campionato 1,063); segno più probabile preso 53,6%; Over/Under 2,5 preso 57,5%; gol previsti 3,03 vs reali 3,02; Over previsto 57,2% vs reale 57,7%.
- Calibrazione pronostici principali: 56%→59% presi, 65%→62%, 74%→72%, 84%→95% (20 casi).
- Scarto Over 2,5 dal mercato sulle partite in programma: bias da −5,4 a −1,7 punti.
- Il backtest salvato è mostrato nella pagina Pronostici ("Affidabilità misurata").

## 19/11/2026 · Schedine automatiche
- Vista "Schedine" (lib/tickets.ts): raddoppi con la singola (quota 1,80–2,40), raddoppio in multipla (2–3 esiti, quota 1,90–2,30), multipla prudente (3–4, quota 2,5–4), multipla di valore (solo esiti con valore > 1%), multipla ambiziosa (4–6, quota 10–25), Bomba della settimana (5–8 esiti, quota 50–200, p ≥ 45%, mai contro il mercato).
- Sempre un solo esito per partita. Probabilità = stima QUORUM (35% modello + 65% mercato). "Analizza nel Laboratorio" carica la schedina nel calcolatore di sistemi.
- Orizzonte scanner esteso a 7 giorni (48 partite al 19/11).
- Nota: il valore atteso delle multiple è calcolato sulle quote migliori di bookmaker diversi, quindi è ottimistico rispetto a un solo bookmaker.

## 19/11/2026 · The Odds API 20K
- Abbonamento The Odds API 20K attivo (30 $/mese, sottoscritto da Emiliano). Nuova chiave collegata da lui in Collegamenti.
- Scansione ogni 3 ore (cron `40 2-23/3 * * *` UTC). Aggiornamenti manuali riusano le quote se scaricate da meno di 30 minuti.
- Aggiunto Goal/No Goal con quote reali (mercato `btts` per evento, 1 credito a partita, aggiornato ogni ~9 ore e salvato in D1).
- Stima consumo: ~2.400 crediti/mese per 1X2+O/U, ~4.000 per Goal/No Goal → ~6.500 su 20.000.

## 19/11/2026 · Regolamento automatico, mercati extra, demo rimossa
- Regolamento (lib/settle.ts, regole in lib/settle-contract.ts): dopo ogni scansione (ogni 3 ore) controlla le partite iniziate da più di 2,5 ore. Regola le giocate del portafoglio (fixture Sportmonks), tutti gli esiti valutati dallo scanner e le schedine proposte. Rinviate oltre 3 giorni/annullate = rimborso. Risultati finali salvati in `fixture_results`.
- Schedine salvate in `scanner_tickets`: una per tipo al giorno, 3 raddoppi singoli al giorno, Bomba una a settimana (lunedì).
- Vista "Risultati": rendimento value bet (1 unità alla quota migliore, ultima quota prima del via), per mercato, e per tipo di schedina.
- Mercati extra: corner e cartellini (medie di squadra pesate sugli avversari, binomiale negativa; quote reali `totals_corners`/`totals_cards`), rigori assegnati e sbagliati (Poisson su frequenze a favore/contro, % errore del campionato), marcatori (quota dei gol di squadra nell'ultimo anno × gol attesi, assenti esclusi). Dati da Sportmonks statistics (34/84/83) ed events (14/15/16/17).
- Demo eliminata dall'interfaccia: Partite usa solo il calendario reale, la panoramica rimanda ai Pronostici.
- Quote eventi: `btts,alternate_totals_corners,alternate_totals_cards,player_goal_scorer_anytime` (≈165 crediti per 48 partite, refresh ogni 12 ore → ~12.400 crediti/mese totali con 1X2+O/U). Marcatori del bookmaker abbinati ai marcatori del modello per nome.
- Money management: sezione guidata nel Portafoglio (3 regole, simulazione Monte Carlo 300 giocate per profilo Prudente 1% / Equilibrato 2% / Aggressivo 5% / Senza regole 15%, scelta profilo con un clic che imposta i limiti).

## 19/11/2026 · Guida in-app
- Vista "Guida" (app/guide.tsx): 19 slide con schermate reali (public/guide/*.jpg, 1,4 MB), frecce/tasti ←→, ingrandimento immagine, pulsante "Apri la sezione". Copre Pronostici, scheda partita, contesto, Centro partita, corner/cartellini, Valore, Bomba, Multiple, Raddoppi, Laboratorio, Risultati, Money management (regole, budget, profili, limiti), Partite, Collegamenti/telefono, Glossario.
- Aggiornati testi residui della demo nel Centro partita e nel Laboratorio.
- Per aggiornare le immagini: sostituire i file in public/guide con lo stesso nome.

## 19/11/2026 · Assenze, formazioni, CLV
- Assenze nel calcolo (lib/extras.ts attackAdjustment): gol attesi ridotti del 50% della quota di gol dei marcatori indisponibili; con formazioni ufficiali (Sportmonks `lineups`, type 11) anche del 35% per i marcatori in panchina; tetto −25%. Marcatori in panchina ×0,35 nelle probabilità marcatore.
- Ricalcolo pre-partita: cron orario `10 * * * *` → scansione "prematch" se una partita inizia tra 20 e 80 minuti e l'ultima scansione ha più di 40 minuti (riusa il modello, quote fresche).
- Quota di chiusura (CLV) in Risultati: quota alla prima proposta vs ultima quota prima del via.
- Quote italiane (Lottomatica/Planetwin365): The Odds API non le copre. Opzioni trovate: odds-api.io (Solo $65/mese, 2 bookmaker; Lottomatica IT e Planetwin365 IT nell'elenco ADM), OddsPapi (free 250 richieste/mese, 350+ bookmaker, piani a pagamento da verificare), Sportmonks Premium Odds (Planetwin365 sì, Lottomatica no). Planetwin365 appartiene a Lottomatica dal 2024. In attesa di decisione di Emiliano.
- Link con schedina precompilata sui bookmaker: non realizzabile (nessuna API pubblica di Lottomatica/Planetwin365 per login o schedina da terzi).

## 20/11/2026 — Quote italiane e affidabilità misurata
- OddsPapi (free, 250 req/mese): Lottomatica = Planetwin365 (stesse quote). Mercati 101/104/108/1010/1012. Max 5 tornei per chiamata: leghe ogni 12h, Coppa Italia ogni 24h (~190 req/mese). Nomi squadre da /participants (cache 7 giorni).
- Valore, Pronostici e Schedine usano la quota italiana quando c'è; puntata calcolata su quella.
- Calibrazione misurata (lib/calibration.ts): backtest walk-forward su 5.071 esiti (1X2, Over/Under, GG/NG), fasce 5 pt, shrinkage 40, monotona. Applicata al modello prima del blend; dopo il blend correzione con gli esiti reali chiusi (si attiva da sola man mano).
- Backtest automatico ogni 7 giorni nel cron (limits.cpu_ms 300000).
- Schedine: "Affidabilità misurata" con intervallo, al massimo metà esiti Over/Under quando esistono alternative, top 2 esiti per partita nei pool.
- Doppia chance (homeDraw/drawAway/homeAway) da OddsPapi mercato 101902; probabilità = somma 1X2.
- Backtest schedine con quote reali football-data.co.uk (I1, E0, SP1, D1, F1; cache 6 giorni): 1.897 partite abbinate, 19 settimane. Settimanale col backtest. Affidabilità mostrata = probabilità × fattore per tipo (vinte/attese, shrinkage 5).
- Esito 20/11: probabilità attendibili (93 vinte vs 99 attese), rendimento negativo con quote medie (margine bookmaker); peso modello 0/0.15/0.35/0.5 non cambia: resta 0.35.
- football-data.co.uk: verificare i termini prima della versione commerciale.
