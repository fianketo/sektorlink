# SektorLink – Pacijenti i hitne poruke između računara

Sopstveni server (Node.js) koji radi na jednom računaru u firmi — svi podaci ostaju na tom
računaru, ništa se ne šalje na Google/Firebase ili bilo koji spoljni servis.

## Šta aplikacija radi

- **Administrator** unosi pacijenta (broj, ime, sektor, razlog: *Ponavljanje* / *Nije urađeno*)
  → pacijent se pojavljuje na tom sektoru.
- **Laboranti (sektor)** vide pristigle pacijente u plutajućoj listi (dugme 📋 u donjem desnom
  uglu, ne ometa rad, brzo se otvara/zatvara), i kad završe kliknu **Odrađeno** → pacijent se
  vraća adminu na proveru ("Vraćeno na proveru").
- Laboranti takođe mogu sami poslati pacijenta koji je **spreman za pregled** → ide adminu
  ("Spremni za pregled").
- **Hitne poruke** — dugme 📢 gore desno, bira se primalac (svi / određeni sektor / admin).
  Kad poruka stigne, iskoči preko cele stranice uz zvučni signal dok se ne potvrdi klikom.
- Istorija zatvorenih stavki (audit trag), tamna/svetla tema, sektori se dodaju/preimenuju/brišu
  kroz ⚙️ (samo Administrator).

## Kako radi (arhitektura)

Jedan Node.js proces radi sve: služi aplikaciju (fajlovi u `public/`) i drži uživo (WebSocket)
konekciju sa svim otvorenim računarima, na istom portu. Podaci se čuvaju u `data/db.json` na
tom istom računaru — restart servera ih ne briše.

Svaki računar samo otvori adresu tog servera u browseru (kao običan sajt) i unese **pristupni
kod** — nema pravih naloga/lozinki po osobi.

## Podešavanje (jednom, na računaru koji će biti server)

1. Instaliraj [Node.js](https://nodejs.org) (LTS verzija) — obično dvoklik na instaler, Next-Next-Finish.
   Ovo je jedini korak koji fajl ispod ne može da uradi umesto tebe.
2. Iskopiraj ceo `sektorlink` folder na taj računar (ili `git clone` ovaj repo).
3. Dupli klik na **`Pokreni.bat`** u tom folderu. On sam:
   - napravi `config.json` (ako ne postoji),
   - instalira potrebne pakete (`npm install`, samo prvi put, može potrajati),
   - pokrene server.
4. Kad piše `SektorLink server radi na portu 3131`, server radi. Ostavi taj prozor otvoren
   (ili podesi autostart — pogledaj ispod, tako da se sam pokreće i posle restarta računara).
5. Podrazumevani pristupni kod je `PROMENI_ME`. Kad budeš imao/imala vremena, otvori `config.json`
   u Notepad-u, promeni `"accessCode"` u svoju šifru (i po želji `"port"`), sačuvaj, pa restartuj
   server (zatvori prozor i ponovo dupli klik na `Pokreni.bat`).

Za sledeći put: samo dupli klik na `Pokreni.bat` — ostali koraci se preskaču jer je sve već
napravljeno.

## Pristup sa ostalih računara u lokalnoj mreži

1. Na server-računaru nađi njegovu lokalnu IP adresu: `ipconfig` u cmd-u, potraži "IPv4 Address"
   (izgleda npr. kao `192.168.1.50`).
2. Na svakom drugom računaru u istoj mreži, otvori browser i idi na:
   ```
   http://192.168.1.50:3131/
   ```
   (zameni IP-jem sa koraka 1). Unesi pristupni kod iz `config.json` — pamti se, ne pita se
   ponovo na tom računaru dok se ne klikne "Promeni kod".

## Pristup za par računara van lokalne mreže (Cloudflare Tunnel)

Pošto ne postoji VPN, koristi se besplatan Cloudflare Tunnel — server dobija sigurnu javnu
adresu bez ikakvog otvaranja rutera ili port-forwarding-a.

1. Na server-računaru instaliraj `cloudflared` ([uputstvo](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)).
2. Dok `npm start` radi (server sluša na portu 3131), u novom prozoru komandne linije pokreni:
   ```
   cloudflared tunnel --url http://localhost:3131
   ```
3. Dobićeš privremenu adresu tipa `https://nasumicna-rec.trycloudflare.com` — to je adresa koju
   ti udaljeni računari otvaraju u browseru (unose isti pristupni kod kao i ostali).
4. Napomena: ovaj besplatni "quick tunnel" dobija **novu** adresu svaki put kad ga ponovo
   pokreneš. Ako to postane nezgodno (stalno slanje nove adrese ljudima), sledeći korak je
   named tunnel sa besplatnim Cloudflare nalogom i sopstvenim domenom — javi ako ti to zatreba,
   pa podešavamo.

## Bezbednosna napomena

Pristupni kod je jedina zaštita — svako ko ga zna može da čita/piše podatke (nema odvojenih
naloga po osobi/ulozi). Za internu upotrebu u jednoj ustanovi ovo je uobičajeno prihvatljivo,
pogotovo pošto je kod dodatni sloj povrh toga što serveru inače ne može niko spolja da priđe
osim preko tvog Cloudflare Tunnel linka (koji sam po sebi nije javno oglašen/pretraživ).

Podaci pacijenata (`data/db.json`) žive isključivo na server-računaru — ne šalju se nikom
trećem. Redovno pravi rezervnu kopiju tog fajla (npr. povremeno kopiraj `data/db.json` na USB
ili mrežni disk) — to je jedini fajl koji, ako se izgubi (kvar diska i sl.), znači gubitak
istorije. Sam kod aplikacije (u ovom repou) ne sadrži nikakve podatke pacijenata.

## Automatsko pokretanje pri paljenju Windows računara

Da ne moraš ručno da pokrećeš `Pokreni.bat` svaki put:

1. Otvori **Task Scheduler** (pretraga u Start meniju) → **Create Task**.
2. Tab **General**: ime npr. "SektorLink server", čekiraj "Run whether user is logged on or not"
   (ili "Run only when user is logged on" ako ti je jednostavnije).
3. Tab **Triggers** → **New** → "At startup" (ili "At log on").
4. Tab **Actions** → **New** → Program/script: puna putanja do `Pokreni.bat` (npr.
   `C:\SektorLink\Pokreni.bat`), Start in: putanja do `sektorlink` foldera (npr. `C:\SektorLink`).
5. Sačuvaj. Server će se sam pokrenuti pri sledećem paljenju računara.

## Ažuriranje aplikacije

Kad se kod promeni (npr. dodamo novu funkciju), na server-računaru: zaustavi server (Ctrl+C u
prozoru gde radi, ili restartuj Task Scheduler task), povuci novi kod (`git pull` ili zameni
fajlove), pa `npm start` ponovo. `data/db.json` ostaje netaknut — to je odvojeno od koda.
