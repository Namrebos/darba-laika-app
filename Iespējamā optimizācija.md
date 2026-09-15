# Iespējamā optimizācija

## 1. Uzdevumu kartītes

Pašlaik ir atsevišķi `TaskCard`, `TaskDetailsCard`, `TaskPreviewCard` un vēl uzdevumu attēlošana Kopsavilkumā.

Izveidot vienu kopīgu uzdevuma kartīti ar režīmiem:

- `preview` — īsais kartītes skats;
- `edit` — rediģējama kartīte;
- `readonly` — pilns tikai lasāms skats;
- `active` — aktīvās Darbadienas kartīte.

## 2. Kopīgie datu tipi

`Task`, `TransportRequest`, `Partner` un kontaktpersonu tipi pašlaik ir definēti atkārtoti vairākos failos.

Pārvietot tos uz vienu kopīgu vietu, lai datubāzes lauku izmaiņas automātiski būtu jāievieš tikai vienreiz.

## 3. Partnera un pārvadātāja kartītes

Partnera un pārvadātāja kartītes ir ļoti līdzīgas, bet realizētas atsevišķi.

Izveidot vienu rekvizītu komponenti, kurai var norādīt kartītes nosaukumu un saglabāšanas mērķi.

## 4. Datuma un laika noteikumi

Datuma un laika pārbaudes atkārtojas pieteikuma formā un vairākos servera API maršrutos.

Izveidot vienu kopīgu validācijas funkciju, kas pārbauda:

- vai datums un laiks nav pagātnē;
- vai izkraušana nav agrāka par uzkraušanu;
- pieļaujamo laika rezervi formas aizpildīšanai;
- vienādu darbību izveides un rediģēšanas režīmā.

## 5. Lietotāju piekļuves tiesības

`role` un `can_access_*` pārbaudes atkārtojas daudzās lapās un API maršrutos.

Izveidot vienotu piekļuves tiesību funkciju, lai viena un tā pati sadaļa klienta pusē un serverī vienmēr izmantotu vienādus noteikumus.

## 6. Partneru datu apstrāde

Partnera meklēšana, dublikātu pārbaude, kontaktpersonu kārtošana un saglabāšana atkārtojas Partneru sadaļā un brauciena pieteikuma formās.

Izveidot kopīgu partneru datu servisu un vienotus partnera izvēles komponentus.

## 7. Attēlu apstrāde

Attēlu saspiešana, laika zīmoga pievienošana, augšupielāde un galerijas atvēršana notiek vairākās vietās ar nedaudz atšķirīgu loģiku.

Izveidot vienotu attēlu apstrādes un augšupielādes moduli.

## 8. Pavadzīmes datu modelis

Pavadzīmei un pārvadājuma pieteikumam ir atsevišķi `TransportRequest` tipi un datu pārveidošanas loģika.

Izmantot vienu kopīgu pārvadājuma datu modeli un vienu funkciju, kas sagatavo pavadzīmes datus. Tas samazinās risku, ka pavadzīmē tiek parādīta novecojusi vai nepareiza informācija.

## Ieteiktā izpildes secība

1. Pabeigt vienoto brauciena pieteikuma formu.
2. Apvienot datuma un laika validāciju.
3. Apvienot uzdevumu kartītes.
4. Izveidot kopīgos datu tipus.
5. Centralizēt piekļuves tiesību pārbaudi.
6. Apvienot partnera un pārvadātāja kartītes.
7. Centralizēt partneru datu apstrādi.
8. Apvienot attēlu apstrādi un pavadzīmes datu modeli.
