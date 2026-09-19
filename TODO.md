# Darba laika app — centrālais TODO

Šis ir vienīgais aktuālais aplikācijas darbu saraksts. Darbi ir sadalīti divās neatkarīgās plūsmās:

1. **Attīstība/uzlabojumi** — jaunas funkcijas un esošās aplikācijas pilnveidošana.
2. **Fix/kļūdu labojumi** — testējot vai ikdienas darbā atrastas kļūdas.

## Darba kārtība

Katru darbu abās plūsmās virzām secīgi: **Jauns → Plānots → Procesā → Testēšanā → Pabeigts**.

- Vienlaikus izstrādē ir viens galvenais darbs.
- Jaunu funkciju vai ideju pievienojam sadaļā **Attīstība/uzlabojumi**.
- Nepareizu aplikācijas darbību pievienojam sadaļā **Fix/kļūdu labojumi**.
- Pirms izstrādes vienojamies par rezultātu un pārvietojam darbu uz **Procesā**.
- Darbu atzīmējam kā pabeigtu tikai pēc pārbaudes testa versijā un, ja nepieciešams, publicēšanas `main` zarā.

---

# Attīstība/uzlabojumi

## Jauns

Šeit pievienojam jaunas idejas un uzlabojumus, kuriem vēl nav noteikta prioritāte.

### A-008 — Vairākas izkraušanas adreses vienam braucienam

Mērķis: vienam braucienam pēc uzkraušanas vietas var pievienot vairākas secīgas izkraušanas vietas, lai vienu kravu varētu nogādāt vairākās adresēs.

- [ ] Ļaut pievienot, rediģēt un noņemt vairākas izkraušanas vietas.
- [ ] Katrai izkraušanas vietai atsevišķi saglabāt adresi, kartes punktu un precīzas koordinātes.
- [ ] Parādīt un ļaut mainīt izkraušanas vietu secību.
- [ ] Korekti attēlot visas izkraušanas vietas pieteikuma izveidē, rediģēšanā un tikai lasāmajā skatā.
- [ ] Saglabāt esošo darbību braucieniem ar vienu izkraušanas vietu.
- [ ] Pārbaudīt vairāku izkraušanas vietu darbību datorā un telefonā.

### A-009 — Jauno pieteikumu skaits uz aplikācijas ikonas

Mērķis: uz instalētās aplikācijas ikonas redzēt neatvērto jauno pieteikumu skaitu, saglabājot esošo paziņojumu par katru saņemto pieteikumu.

- [ ] Par katru jaunu pieteikumu turpināt nosūtīt esošo push paziņojumu.
- [ ] Ikonas aplītī rādīt datubāzē esošo pieteikumu skaitu ar statusu **Jauns**.
- [ ] Atverot pieteikumu un tam automātiski pārejot uz **Plānots**, uzreiz samazināt ikonas skaitli.
- [ ] Ja nav neviena jauna pieteikuma, noņemt aplīti no ikonas.
- [ ] Sinhronizēt skaitu starp lietotāja telefonu un datoru.
- [ ] Pārbaudīt darbību instalētā PWA iPhone, Android un atbalstītā datora vidē.

## Plānots — prioritārā secībā

### A-001 — Kravas veida precizēšana un meklēšanas uzlabošana

Mērķis: kravas veida informācija ir pietiekami precīza, lai meklēšanā varētu ātri un droši atrast vajadzīgo uzdevumu vai braucienu.

- [ ] Vienoties par laukiem un ievades principu.
- [ ] Precizēt un standartizēt kravas veidu nosaukumus.
- [ ] Uzlabot meklēšanu pēc kravas veida un ar to saistītiem vārdiem.
- [ ] Nodrošināt vienādu attēlojumu pieteikumā, kartītēs, meklēšanā un pavadzīmē.

### A-002 — Drošības pārbaudes

Mērķis: pārliecināties, ka lietotāji, partneru publiskās saites un pavadzīmju parakstīšanas saites var piekļūt tikai atļautajiem datiem un darbībām.

- [ ] Pārbaudīt lietotāju lomas un sadaļu piekļuves tiesības.
- [ ] Pārbaudīt Supabase RLS politikas un servera API autorizāciju.
- [ ] Pārbaudīt partneru pieteikumu saišu deaktivizēšanu un atjaunošanu.
- [ ] Pārbaudīt attālinātās pavadzīmes parakstīšanas saites.
- [ ] Pārbaudīt failu, attēlu un personas datu pieejamību.

### A-003 — Partneru login, kopsavilkums un mēneša pārskats

Mērķis: partnerim ir sava droša pieeja, kurā var izveidot pieteikumus un redzēt tikai sava uzņēmuma informāciju.

- [ ] Izveidot partneru autentifikācijas un piekļuves loģiku.
- [ ] Izveidot partnera pieteikumu un braucienu kopsavilkumu.
- [ ] Izveidot partnera mēneša pārskatu.
- [ ] Vienoties par pārskatā redzamajiem datiem, filtriem un eksportu.

### A-004 — Pieteikuma izveidotājs, saņemšanas laiks un statistika

Mērķis: katram brauciena pieteikumam ir redzams, kas un kādā veidā to izveidoja, kā arī precīzs izveidošanas vai saņemšanas laiks; administrators var apskatīt šo informāciju statistikā.

- [x] Saglabāt izveidotāju: administrators, lietotājs vai partneris.
- [x] Saglabāt precīzu pieteikuma izveidošanas vai saņemšanas datumu un laiku.
- [x] Kartītē un vēsturē parādīt pieteikuma izveidotāju, datumu un laiku.
- [ ] Izveidot statistiku par izveidotajiem pieteikumiem un to avotiem (pagaidām atlikts).

### A-005 — Aplikācijas optimizācija

Mērķis: uzlabot aplikācijas ātrumu, stabilitāti un uzturēšanu, nemainot lietotājam ierasto darbību.

- [ ] Izmērīt lēnākās lapas un darbības telefonā un datorā.
- [ ] Sakārtot liekos datu pieprasījumus un komponentu pārzīmēšanu.
- [ ] Optimizēt karšu un attēlu ielādi.
- [ ] Realizēt tehniskos darbus no faila `Iespējamā optimizācija.md` pa vienam, atsevišķi testējot katru izmaiņu.

### A-006 — Lietotāja un saistīto datu dzēšana

Mērķis: administratoram dzēšot lietotāju, kontrolēti izdzēst vai anonimizēt arī ar šo lietotāju saistīto informāciju Supabase.

- [ ] Precīzi vienoties, kuri lietotāja dati jādzēš, kuri jāanonimizē un kuri jāsaglabā uzņēmuma vēsturei.
- [ ] Parādīt administratoram dzēšanas kopsavilkumu pirms apstiprināšanas.
- [ ] Ieviest drošu saistīto datu dzēšanas secību Supabase.
- [ ] Novērst daļēji izdzēsta lietotāja vai bojātu datu saišu palikšanu kļūdas gadījumā.
- [ ] Pārbaudīt dzēšanu testa datos pirms funkcijas publicēšanas.

## Procesā

_Pašlaik nav._

## Testēšanā

### A-007 — Vienotā brauciena pieteikuma forma

- [ ] Notestēt jauna brauciena izveidi no `+ Jauns`.
- [ ] Notestēt izveidi un rediģēšanu sadaļā **Plānotie uzdevumi**.
- [ ] Notestēt tikai lasāmo skatu **Kopsavilkumā** un **Darbadienā**.
- [ ] Pārbaudīt vienādus tālruņa, datuma, adreses, kartes un obligāto lauku noteikumus visos ieejas punktos.
- [ ] Pārbaudīt kartes slāņus, marķieri, saišu importu un ritināšanu datorā un telefonā.
- [ ] Pārbaudīt pavadzīmes paraksta līniju un pildspalvas ikonu.
- [ ] Pārbaudīt, ka pavadzīmē redzams virsraksts **Nosūtītājs**.
- [ ] Pēc apstiprināšanas pievienot izmaiņas `main` zaram.
- [ ] Pēc publicēšanas pārbaudīt, ka paziņojumos tiek lietots partnera īsais nosaukums.

## Pabeigts

_Pašlaik nav._

---

# Fix/kļūdu labojumi

## Jauns

Šeit pievienojam testējot vai ikdienas lietošanā atrastas kļūdas.

### F-003 — Brauciena kartītes autocomplete visās rediģēšanas sadaļās

Mērķis: autocomplete darbojas vienādi visur, kur atļauts izveidot vai rediģēt brauciena kartītes teksta laukus, neatkarīgi no brauciena statusa un sadaļas.

- [ ] Ievadot uzņēmuma reģistrācijas numuru, piedāvāt atbilstošo uzņēmumu un aizpildīt uzņēmuma datus.
- [ ] Nodrošināt uzņēmuma un pārējo autocomplete lauku darbību gan jaunā, gan jau izveidotā braucienā.
- [ ] Nodrošināt autocomplete darbību **Plānotajos uzdevumos**, lietotājam nosūtītā braucienā un jau sāktā braucienā, ja attiecīgie lauki ir rediģējami.
- [ ] Nodrošināt vienādu autocomplete darbību visos pārējos rediģēšanas skatos.
- [ ] Pārbaudīt rezultātu datorā un telefonā, nemainot tikai lasāmo skatu darbību.

## Plānots

### F-001 — Darba laika korekciju sistēma

Mērķis: darba grafika izmaiņas nedrīkst mainīt vai sabojāt iepriekšējo periodu darba laika uzskaiti un aprēķinus.

- [ ] Saglabāt katras darba grafika izmaiņas ar spēkā stāšanās datumu.
- [ ] Vēsturiskajiem periodiem izmantot tajā laikā spēkā esošo grafiku.
- [ ] Nepieļaut grafika periodu pārklāšanos.
- [ ] Ļaut administratoram droši koriģēt vēsturiskos grafikus, nemainot faktiskos darba laika ierakstus.
- [ ] Pārbaudīt aprēķinus pirms un pēc grafika maiņas.

### F-002 — Offline režīma tests un kļūdu labošana

Mērķis: aplikācijas galvenās darbības bez interneta strādā paredzami un pēc savienojuma atjaunošanas dati korekti sinhronizējas bez zudumiem vai dublikātiem.

- [ ] Vienoties, kurām aplikācijas darbībām obligāti jāstrādā offline režīmā.
- [ ] Notestēt darbu ar izslēgtu internetu telefonā un datorā.
- [ ] Notestēt jaunu ierakstu, labojumu, attēlu un darbību rindas saglabāšanu bezsaistē.
- [ ] Notestēt automātisko sinhronizāciju pēc interneta atjaunošanas.
- [ ] Pārbaudīt konfliktus, dublikātus un datu zuduma gadījumus.
- [ ] Novērst atrastās kļūdas un atkārtot pilno offline testu.

## Procesā

_Pašlaik nav._

## Testēšanā

_Pašlaik nav._

## Pabeigts

_Pašlaik nav._

---

# Pabeigto darbu arhīva princips

Pabeigtos darbus glabājam attiecīgās plūsmas sadaļā **Pabeigts**, norādot pabeigšanas datumu un, ja vajadzīgs, saiti uz commit vai versiju.

_Pabeigtie vēsturiskie darbi atrodami Git vēsturē; šajā sarakstā turpmāk uzkrāsim tikai darbus no saraksta ieviešanas brīža._
