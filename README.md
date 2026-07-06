# SektorLink – Pacijenti i hitne poruke između računara

Aplikacija je jedan samostalan HTML fajl (`index.html`) — bez servera, bez build koraka.

- **Bez podešavanja Firebase-a**: radi u lokalnom (`localStorage`) režimu. Dva tabа **u istom
  browseru na istom računaru** se uživo sinhronizuju (korisno za brzo testiranje), ali različiti
  fizički računari ne dele podatke dok se ne podesi Firebase.
- **Sa podešenim Firebase-om (obavezno za pravu upotrebu na više računara)**: svi računari dele
  iste podatke uživo (real-time), bez ikakve prijave/lozinke za korisnike.

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

## Podešavanje Firebase-a (jednom, ~5-10 min, besplatno, bez kartice)

1. Idi na **https://console.firebase.google.com**, prijavi se Google nalogom, **Add project**
   (napravi **nov, poseban** projekat samo za ovu aplikaciju).
2. **Build → Authentication → Get started → Sign-in method → Anonymous → Enable.**
   (Ovde namerno koristimo *Anonymous*, ne Email/Password — aplikacija nema login ekran; ovo
   samo omogućava da baza zna da je zahtev došao iz same aplikacije, a ne od nasumičnog posetioca.)
3. **Build → Realtime Database → Create Database.** Izaberi region, izaberi **"Start in locked mode"**.
4. Otvori tab **Rules** te baze i zameni sadržaj sa:
   ```json
   {
     "rules": {
       ".read": "auth != null",
       ".write": "auth != null"
     }
   }
   ```
   Klikni **Publish**.
5. Zupčanik gore levo → **Project settings** → "Your apps" → ikonica **Web (`</>`)** → registruj
   app. Prikazaće se `firebaseConfig` objekat.
6. Otvori `index.html`, pronađi `const FIREBASE_CONFIG = { ... }` na vrhu skripte, i zameni
   placeholder vrednosti pravim vrednostima iz koraka 5. Sačuvaj.
7. **Authentication → Settings → Authorized domains** → dodaj domen na kom će sajt živeti
   (npr. `tvoje-korisnicko-ime.github.io`). Bez ovog koraka aplikacija neće raditi na živom
   sajtu (radiće samo na `localhost` dok testiraš lokalno).
8. Otvori sajt na svakom računaru i izaberi ulogu (Administrator ili odgovarajući sektor).
   Administrator prvo treba da doda prave sektore kroz ⚙️ pre nego što se pojave kao izbor na
   drugim računarima.

### Bezbednosna napomena

Pravilo `auth != null` znači da svako ko otvori app (i time dobije anonimnu sesiju) može da
čita/piše podatke — nema razdvajanja po ulogama na nivou baze (to app radi na UI nivou). Za
internu upotrebu u jednoj ustanovi ovo je uobičajeno prihvatljivo. Pošto nema pravih
imena/lozinki naloga, korisnici nikad ne vide login ekran.

## Postavljanje na besplatan GitHub Pages

1. Napravi **nov, poseban** GitHub repozitorijum (Public — potrebno za besplatan Pages), npr. `sektorlink`.
2. Otpremi ova 4 fajla (`index.html`, `manifest.json`, `icon.svg`, `README.md`) u koren tog repoa.
3. **Settings → Pages** → "Build and deployment" → **Deploy from a branch** → grana `main`, folder `/ (root)` → Save.
4. Posle 1-2 minuta sajt je dostupan na `https://tvoje-korisnicko-ime.github.io/sektorlink/`.
5. Ne zaboravi korak 7 iz sekcije o Firebase-u iznad (dodaj taj domen u Authorized domains).

## Napomena o zvuku

Zvučni signal za hitne poruke koristi Web Audio API i radi tek posle prve interakcije korisnika
sa stranicom (ograničenje browsera protiv autoplay-a zvuka) — u praksi nije problem jer se ulazi
preko ekrana za izbor uloge.
